/**
 * So sánh cost_reconciliations (App DB) vs snapshot Excel 2.3_Gia von.
 *
 * Snapshot được precompute local qua `scripts/snapshot_cost_excel.mjs` và
 * commit vào repo (lib/reports/cost-audit-snapshot.json). Mỗi lần Excel BC DT
 * cập nhật, chạy script lại + commit lại JSON.
 *
 * Lý do dùng snapshot thay vì read Excel live: file gitignored, không lên
 * Vercel. User không muốn upload lại mỗi lần. Snapshot cân bằng: Excel data
 * stable trong repo, DB data query live → diff luôn cập nhật khi có recon mới.
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import snapshot from "./cost-audit-snapshot.json";

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

type ExcelEntry = {
  excelRow: number;
  employee: string | null;
  items: { loai: string; amt: number }[];
  total: number;
};
type Snapshot = {
  snapshotAt: string;
  sourceFile: string;
  sheet: string;
  totalRows: number;
  perProduct: Record<string, ExcelEntry[]>;
};

// Label ↔ cost_type mapping. Cột Excel → xem scripts/snapshot_cost_excel.mjs.
const COST_TYPE_LABEL: Record<string, string> = {
  sale_commission: "HH sale",
  customer_support: "Hỗ trợ khách",
  cdt_bonus_sale: "CĐT thưởng NVKD",
  cdt_bonus_manager: "CĐT thưởng QL",
  bonus_manager: "CTY thưởng QL",
  kpi_ceo: "KPI CEO",
  kpi_tpkd: "KPI TPKD",
  kpi_admin: "KPI Admin",
};

function excelLoaiToCostType(loai: string): string | undefined {
  return Object.entries(COST_TYPE_LABEL).find(([, v]) => v === loai)?.[0];
}

export async function getMissingCostReport(): Promise<{
  rows: MissingCostRow[];
  excelTotal: number;
  dbTotal: number;
  totalDiff: number;
  snapshotAt: string;
}> {
  const snap = snapshot as Snapshot;

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

  for (const [code, excelRows] of Object.entries(snap.perProduct)) {
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
    snapshotAt: snap.snapshotAt,
  };
}
