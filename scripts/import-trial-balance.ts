/**
 * Import sheet CDPS từ SO SACH BRE XXXX.xlsx → trial_balance table.
 * Nguồn Balance Sheet quản trị chuẩn TT200 (opening + period + closing).
 *
 * Usage: cd BRE/App/CRM && npx tsx scripts/import-trial-balance.ts [file.xlsx] [period_end]
 * Default: data-excel/SO SACH BRE 2025.xlsx, period_end=2025-12-31
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import ExcelJS from "exceljs";
import postgres from "postgres";
import fs from "fs";
import path from "path";

const FILE = process.argv[2] || "data-excel/SO SACH BRE 2025.xlsx";
const PERIOD_END = process.argv[3] || "2025-12-31";

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
  if (typeof v === "object" && ("result" in v || "text" in v)) return str((v as any).result ?? (v as any).text);
  return String(v).trim();
}

async function main() {
  const { runWithImportLog } = await import("../lib/import-log");
  await runWithImportLog({
    scriptName: "import-trial-balance",
    sourceFile: FILE,
    targetTable: "trial_balance",
  }, async (log) => {
  const mig = fs.readFileSync("drizzle/0034_trial_balance.sql", "utf-8");
  await sql.unsafe(mig);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet("CDPS");
  if (!ws) throw new Error("Sheet CDPS không tồn tại");

  await sql`DELETE FROM trial_balance WHERE period_end = ${PERIOD_END}`;

  // Data từ row 10 (header ở R8-9)
  const rows: any[] = [];
  for (let i = 10; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const code = str(row.getCell(1).value);
    const name = str(row.getCell(2).value);
    if (!code || code === "Cộng" || code === "TỔNG" || !name) continue;
    // Skip parent aggregates that duplicate children (VD 111 = parent của 1111 nếu 111 chỉ có 1 child)
    // Nhưng vẫn giữ vì có thể user muốn view tổng nhóm
    rows.push({
      period_end: PERIOD_END,
      account_code: code,
      account_name: name,
      opening_debit: num(row.getCell(3).value),
      opening_credit: num(row.getCell(4).value),
      period_debit: num(row.getCell(5).value),
      period_credit: num(row.getCell(6).value),
      closing_debit: num(row.getCell(7).value),
      closing_credit: num(row.getCell(8).value),
      source_file: path.basename(FILE),
    });
  }

  // Dedup by account_code (keep first — parent rows) hoặc use ON CONFLICT
  console.log(`Importing ${rows.length} trial balance rows for period ${PERIOD_END}...`);
  const seen = new Set<string>();
  let dedupSkip = 0;
  for (const r of rows) {
    if (seen.has(r.account_code)) { dedupSkip++; continue; }
    seen.add(r.account_code);
    await sql`INSERT INTO trial_balance ${sql(r)}`;
  }
  if (dedupSkip > 0) console.log(`(Skipped ${dedupSkip} duplicate account_code rows)`);

  // Sanity check: TS = NPT + VCSH
  const [t] = await sql`
    SELECT
      SUM(CASE WHEN account_code ~ '^[12]' THEN closing_debit - closing_credit ELSE 0 END)::float8 as ts,
      SUM(CASE WHEN account_code ~ '^3'   THEN closing_credit - closing_debit ELSE 0 END)::float8 as npt,
      SUM(CASE WHEN account_code ~ '^4'   THEN closing_credit - closing_debit ELSE 0 END)::float8 as vcsh
    FROM trial_balance WHERE period_end = ${PERIOD_END} AND length(account_code) = 3`;
  console.log(`\n═══ Sanity check ═══`);
  console.log(`Tài sản (TS):        ${fmt(Number(t.ts))}`);
  console.log(`Nợ phải trả (NPT):   ${fmt(Number(t.npt))}`);
  console.log(`Vốn CSH (VCSH):      ${fmt(Number(t.vcsh))}`);
  console.log(`NPT + VCSH:          ${fmt(Number(t.npt) + Number(t.vcsh))}`);
  console.log(`Chênh:               ${fmt(Number(t.ts) - Number(t.npt) - Number(t.vcsh))}`);
  console.log(Math.abs(Number(t.ts) - Number(t.npt) - Number(t.vcsh)) < 1000 ? "✅ CÂN" : "⚠️ LỆCH");

    log.created = rows.length - dedupSkip;
    log.skipped = dedupSkip;
    log.details = {
      period_end: PERIOD_END,
      total_ts: Number(t.ts), total_npt: Number(t.npt), total_vcsh: Number(t.vcsh),
      balance_check: Math.abs(Number(t.ts) - Number(t.npt) - Number(t.vcsh)) < 1000,
    };
    await sql.end();
  });
}
main().catch(e => { console.error(e); process.exit(1); });
