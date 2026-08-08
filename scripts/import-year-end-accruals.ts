/**
 * Import file "251231_Trich truoc 335.xlsx" — trích trước cuối kỳ 31/12/2025.
 * Sheet "Chi tiết GV trích trước": 43 rows per căn với 7 cột breakdown.
 * Sheet "Chi tiet 335": tổng hợp — dùng để verify tổng.
 *
 * Usage: cd BRE/App/CRM && npx tsx scripts/import-year-end-accruals.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import ExcelJS from "exceljs";
import postgres from "postgres";
import fs from "fs";

const FILE = "data-excel/251231_Trich truoc 335.xlsx";
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function num(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    if ("result" in v) return num(v.result);
    if ("text" in v) return num(v.text);
  }
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function str(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    if ("result" in v) return str(v.result);
    if ("text" in v) return str(v.text);
  }
  return String(v).trim();
}

async function main() {
  const mig = fs.readFileSync("drizzle/0033_year_end_accruals.sql", "utf-8");
  await sql.unsafe(mig);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet("Chi tiet GV trich truoc")!;

  const accrualDate = "2025-12-31";
  console.log("Clearing existing year_end_accruals for 2025-12-31...");
  await sql`DELETE FROM year_end_accruals WHERE accrual_date = ${accrualDate}`;
  await sql`DELETE FROM year_end_other_accruals WHERE accrual_date = ${accrualDate}`;

  // Data từ row 6 (sau header), stop khi thấy "TỔNG CỘNG"
  const rows: any[] = [];
  for (let i = 6; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const unitCode = str(row.getCell(2).value);
    if (!unitCode || unitCode.toUpperCase().includes("TỔNG")) break;

    rows.push({
      accrual_date: accrualDate,
      unit_code: unitCode,
      project_name: str(row.getCell(3).value),
      partner_name: str(row.getCell(4).value),
      employee_name: str(row.getCell(5).value),
      hh_sale: num(row.getCell(6).value),
      cdt_bonus_sale: num(row.getCell(7).value),
      cty_bonus_ql: num(row.getCell(8).value),
      kpi_ceo: num(row.getCell(9).value),
      kpi_tpkd: num(row.getCell(10).value),
      bonus_admin: num(row.getCell(11).value),
      customer_support: num(row.getCell(12).value),
      total_amount: num(row.getCell(13).value),
      source_file: "251231_Trich truoc 335.xlsx",
      source_row: i,
    });
  }

  console.log(`Importing ${rows.length} accrual rows...`);
  for (const r of rows) {
    await sql`INSERT INTO year_end_accruals ${sql(r)}`;
  }

  // Verify tổng
  const [totals] = await sql`
    SELECT
      COALESCE(SUM(hh_sale),0)::float8 as hh,
      COALESCE(SUM(cdt_bonus_sale),0)::float8 as cdt,
      COALESCE(SUM(cty_bonus_ql),0)::float8 as ql,
      COALESCE(SUM(kpi_ceo),0)::float8 as ceo,
      COALESCE(SUM(kpi_tpkd),0)::float8 as tpkd,
      COALESCE(SUM(bonus_admin),0)::float8 as admin,
      COALESCE(SUM(customer_support),0)::float8 as ho_tro
    FROM year_end_accruals WHERE accrual_date = ${accrualDate}
  `;
  console.log("\n═══ Tổng đã import ═══");
  console.log(`HH sale:        ${fmt(Number(totals.hh))} (Kim: 842.552.348)`);
  console.log(`CĐT thưởng NV:  ${fmt(Number(totals.cdt))} (Kim: 278.636.363)`);
  console.log(`Cty thưởng QL:  ${fmt(Number(totals.ql))} (Kim: 60.000.000)`);
  console.log(`KPI CEO:        ${fmt(Number(totals.ceo))} (Kim: 125.277.425)`);
  console.log(`KPI TPKD:       ${fmt(Number(totals.tpkd))} (Kim: 29.210.024)`);
  console.log(`Admin:          ${fmt(Number(totals.admin))} (Kim: 6.357.540)`);
  console.log(`Hỗ trợ khách:   ${fmt(Number(totals.ho_tro))} (Kim: 10.000.000)`);

  // Insert other accruals (từ sheet Chi tiet 335 mục 8+9)
  await sql`
    INSERT INTO year_end_other_accruals (accrual_date, description, category, amount, source_file)
    VALUES
      (${accrualDate}, 'Trích trước Thưởng đạt DS T11+12 (Minh Nhật + Thanh Thúy)', 'thuong_ds_sale', 10095833, ${'251231_Trich truoc 335.xlsx'}),
      (${accrualDate}, 'Trích trước Thưởng top 1 DS Trần Minh Nhật', 'thuong_ds_sale', 25000000, ${'251231_Trich truoc 335.xlsx'})
  `;
  console.log(`\n✅ Imported 2 other accruals: Thưởng ĐS 10M + Top 1 25M`);

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
