/**
 * Compare cost_reconciliations (App) vs Excel BC DOANH THU sheet "2.3_Gia von".
 * Trả về list căn có sai lệch (Excel có mà App thiếu, hoặc ngược lại).
 *
 * Excel path: data-excel/BAO CAO DOANH THU.xlsx (relative to project root).
 * Nếu file không tồn tại (env production trên Vercel), throw để page catch.
 */
import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type MissingItem = {
  loai: string;
  amt: number;
  employee: string | null;
  excelRow: number;
};

export type MissingCostRow = {
  productCode: string;
  productId: number | null;
  excelCount: number;
  dbCount: number;
  excelTotal: number;
  dbTotal: number;
  diff: number;
  missingItems: MissingItem[];
  actors: string[];
};

const COST_TYPE_LABEL: Record<string, string> = {
  sale_commission: "HH sale",
  customer_support: "Hỗ trợ khách",
  cdt_bonus_sale: "CĐT thưởng NVKD",
  cdt_bonus_manager: "CĐT thưởng QL",
  kpi_ceo: "KPI CEO",
  kpi_tpkd: "KPI TPKD",
  kpi_admin: "KPI Admin",
};

function excelLoaiToCostType(loai: string): string | undefined {
  return Object.entries(COST_TYPE_LABEL).find(([, v]) => v === loai)?.[0];
}

function parseExcelRow(r: (string | number | null)[]) {
  const items: { loai: string; amt: number }[] = [];
  const push = (loai: string, amt: number) => {
    if (amt && Math.abs(amt) > 0.5) items.push({ loai, amt });
  };
  push("HH sale", Number(r[21] ?? 0));
  push("Hỗ trợ khách", Number(r[24] ?? 0));
  push("CĐT thưởng NVKD", Number(r[25] ?? 0));
  push("CĐT thưởng QL", Number(r[27] ?? 0));
  push("KPI CEO", Number(r[31] ?? 0));
  push("KPI TPKD", Number(r[35] ?? 0));
  push("KPI Admin", Number(r[37] ?? 0));
  return items;
}

export async function getMissingCostReport(): Promise<{
  rows: MissingCostRow[];
  excelTotal: number;
  dbTotal: number;
  totalDiff: number;
  hasExcel: boolean;
}> {
  const excelPath = path.join(process.cwd(), "data-excel", "BAO CAO DOANH THU.xlsx");
  if (!fs.existsSync(excelPath)) {
    return { rows: [], excelTotal: 0, dbTotal: 0, totalDiff: 0, hasExcel: false };
  }

  const wb = XLSX.readFile(excelPath, { cellDates: true, cellNF: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.3_Gia von"], {
    header: 1,
    raw: true,
    defval: null,
  }) as (string | number | null)[][];

  const excelPerProduct = new Map<
    string,
    { excelRow: number; employee: string | null; items: { loai: string; amt: number }[]; total: number }[]
  >();

  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const productCode = r[3];
    const total = Number(r[38] ?? 0);
    if (!productCode || !total) continue;
    const items = parseExcelRow(r);
    const employee = r[2] ? String(r[2]) : null;
    const cur = excelPerProduct.get(String(productCode)) || [];
    cur.push({ excelRow: i + 1, employee, items, total });
    excelPerProduct.set(String(productCode), cur);
  }

  // Load DB cost_reconciliations + actor (from activity_logs)
  const dbRows = (await db.execute(sql`
    SELECT p.id AS product_id, p.product_code, cr.id, cr.cost_type,
      cr.employee_name, cr.reconciliation_date, cr.amount_payable_this_time,
      (SELECT actor_email FROM activity_logs
        WHERE entity_type='cost_reconciliation' AND entity_id=cr.id AND action='create'
        ORDER BY created_at LIMIT 1) AS actor
    FROM cost_reconciliations cr
    JOIN products p ON p.id = cr.product_id
  `)) as unknown as Array<{
    product_id: number;
    product_code: string;
    id: number;
    cost_type: string;
    employee_name: string;
    reconciliation_date: string | null;
    amount_payable_this_time: number;
    actor: string | null;
  }>;

  const dbPerProduct = new Map<string, typeof dbRows>();
  for (const r of dbRows) {
    const cur = dbPerProduct.get(r.product_code) || [];
    cur.push(r);
    dbPerProduct.set(r.product_code, cur);
  }

  const report: MissingCostRow[] = [];
  let excelTotal = 0;
  let dbTotal = 0;

  for (const [code, excelRows] of excelPerProduct) {
    const dbList = dbPerProduct.get(code) || [];
    const dbUsed = new Set<number>();
    const missingItems: MissingItem[] = [];

    for (const eRow of excelRows) {
      for (const item of eRow.items) {
        const costType = excelLoaiToCostType(item.loai);
        const match = dbList.find(
          (d) =>
            !dbUsed.has(d.id) &&
            d.cost_type === costType &&
            Math.abs(Number(d.amount_payable_this_time) - item.amt) < 1000,
        );
        if (match) dbUsed.add(match.id);
        else
          missingItems.push({
            loai: item.loai,
            amt: item.amt,
            employee: eRow.employee,
            excelRow: eRow.excelRow,
          });
      }
    }

    const excelSum = excelRows.reduce((s, r) => s + r.total, 0);
    const dbSum = dbList.reduce((s, r) => s + Number(r.amount_payable_this_time), 0);
    excelTotal += excelSum;
    dbTotal += dbSum;
    const diff = excelSum - dbSum;
    if (Math.abs(diff) < 1000) continue;

    const actors = [...new Set(dbList.map((d) => d.actor).filter(Boolean) as string[])];
    report.push({
      productCode: code,
      productId: dbList[0]?.product_id ?? null,
      excelCount: excelRows.length,
      dbCount: dbList.length,
      excelTotal: excelSum,
      dbTotal: dbSum,
      diff,
      missingItems,
      actors,
    });
  }
  report.sort((a, b) => b.diff - a.diff);

  return {
    rows: report,
    excelTotal,
    dbTotal,
    totalDiff: excelTotal - dbTotal,
    hasExcel: true,
  };
}
