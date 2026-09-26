/**
 * Verify 5 cases chi quá so với file Excel gốc (sheet 2.3_Gia von).
 * Xem DB có match với Excel không — nếu match thì Excel gốc đã sai/thừa;
 * nếu DB > Excel thì import script hoặc UI đã insert extra.
 */
import * as XLSX from "xlsx";
import path from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const EXCEL_PATH = path.join(process.cwd(), "data-excel", "BAO CAO DOANH THU.xlsx");
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const toNum = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[.,\s]/g, "");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};
const toStr = (v: unknown): string => (v == null ? "" : String(v).trim());
const normalizeUnit = (s: string): string => s.trim().replace(/[.\-\s]/g, "");

// 5 cases từ inspect
const CASES = [
  { unit: "B.26.20", type: "kpi_tpkd", excelCol: 35 /* AJ = KPI TPKD còn đợt này */ },
  { unit: "B2-09-16", type: "cdt_bonus_sale", excelCol: 24 /* Y */ },
  { unit: "B2-11.17", type: "kpi_ceo", excelCol: 31 /* AF = KPI CEO còn đợt này */ },
  { unit: "A.05.09", type: "kpi_ceo", excelCol: 31 },
  { unit: "A1-15-17", type: "kpi_admin", excelCol: 37 /* AL */ },
];

async function main() {
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
  const ws = wb.Sheets["2.3_Gia von"];
  if (!ws) throw new Error("Sheet 2.3_Gia von not found");
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];

  console.log(`Excel sheet 2.3_Gia von — ${rows.length} rows total\n`);

  for (const c of CASES) {
    const normalized = normalizeUnit(c.unit);
    console.log(`\n========== ${c.unit} · ${c.type} ==========`);

    // Excel rows: data từ row idx 4+
    const matchedRows: { rowIdx: number; row: unknown[] }[] = [];
    for (let i = 4; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const unitCode = toStr(row[4]); // col E
      if (normalizeUnit(unitCode) !== normalized) continue;
      matchedRows.push({ rowIdx: i, row });
    }
    console.log(`Excel matched ${matchedRows.length} rows cho ${c.unit}:`);
    let excelTotalForType = 0;
    for (const { rowIdx, row } of matchedRows) {
      const employeeName = toStr(row[2]);
      const reconDate = row[1];
      const totalAM = toNum(row[38]); // AM = tổng phải trả
      // Column-specific amounts
      const pmgPayable = toNum(row[21]); // V = HH sale (PMG payable)
      const csVal = toNum(row[23]); // X = customer support
      const cdtBonusSale = toNum(row[24]); // Y
      const cdtBonusMgr = toNum(row[25]); // Z
      const bsVal = toNum(row[26]); // AA
      const bmVal = toNum(row[27]); // AB
      const kpiCeoAmt = toNum(row[31]); // AF
      const kpiTpkdAmt = toNum(row[35]); // AJ
      const kpiAdminAmt = toNum(row[37]); // AL

      const typeAmt = (() => {
        switch (c.type) {
          case "sale_commission": return pmgPayable;
          case "customer_support": return csVal;
          case "cdt_bonus_sale": return cdtBonusSale;
          case "cdt_bonus_manager": return cdtBonusMgr;
          case "bonus_sale": return bsVal;
          case "bonus_manager": return bmVal;
          case "kpi_ceo": return kpiCeoAmt;
          case "kpi_tpkd": return kpiTpkdAmt;
          case "kpi_admin": return kpiAdminAmt;
          default: return 0;
        }
      })();
      if (typeAmt !== 0) {
        excelTotalForType += typeAmt;
        console.log(
          `  Excel row ${rowIdx + 1}: ${employeeName} · ${reconDate} · ${c.type}=${fmt(typeAmt)} (AM tổng ${fmt(totalAM)})`,
        );
      }
    }
    console.log(`  → Excel TỔNG cho ${c.type}: ${fmt(excelTotalForType)}`);

    // DB recons cho căn+loại này
    const dbRows = await db.execute(sql`
      SELECT
        cr.id, cr.reconciliation_date, cr.employee_name,
        cr.amount_payable_this_time::float8 AS amt,
        cr.note
      FROM cost_reconciliations cr
      JOIN products p ON p.id = cr.product_id
      WHERE (
        REPLACE(REPLACE(REPLACE(p.unit_code, '.', ''), '-', ''), ' ', '')
        = ${normalized}
      )
      AND cr.cost_type = ${c.type}
      ORDER BY cr.reconciliation_date
    `);
    const dbList = dbRows as unknown as Array<{
      id: number;
      reconciliation_date: string;
      employee_name: string;
      amt: number;
      note: string | null;
    }>;
    let dbTotal = 0;
    console.log(`DB recons (${dbList.length}):`);
    for (const r of dbList) {
      dbTotal += r.amt;
      console.log(
        `  DB #${r.id} · ${r.employee_name} · ${r.reconciliation_date} · ${fmt(r.amt)} · note "${r.note ?? ""}"`,
      );
    }
    console.log(`  → DB TỔNG: ${fmt(dbTotal)}`);

    const diff = dbTotal - excelTotalForType;
    if (Math.abs(diff) < 1) {
      console.log(`  ✓ MATCH (DB = Excel)`);
    } else {
      console.log(
        `  ⚠ MISMATCH: DB ${fmt(dbTotal)} vs Excel ${fmt(excelTotalForType)} · chênh ${diff > 0 ? "+" : ""}${fmt(diff)}`,
      );
    }
  }
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error("Lỗi:", err);
    await client.end();
    process.exit(1);
  });
