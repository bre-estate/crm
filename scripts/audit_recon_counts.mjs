/**
 * So sánh số lượng recon Excel vs App per căn, cho cả doanh thu + giá vốn.
 *
 * Bước 1: đếm số dòng
 *   - Excel_DT vs App_DT
 *   - Excel_GV vs App_GV
 *   Nếu số lượng bằng nhau → coi bước 1 = OK, chuyển sang bước 2.
 *   Nếu số Excel > App → App THIẾU (thiếu N dòng).
 *   Nếu số App > Excel → App DƯ (dư N dòng).
 *
 * Bước 2 (chỉ khi bước 1 OK): so sánh giá trị bên trong.
 *   Match từng dòng theo (ngày ĐC + người, fallback amount).
 *   Nếu lệch amount > 1000 → flag discrepancy.
 */
import dotenv from "dotenv";
import postgres from "postgres";
import XLSX from "xlsx";

dotenv.config({ path: "/Users/trietnguyen/Documents/Company/BRE/App/CRM/.env.local" });
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

const EXCEL_PATH = "/Users/trietnguyen/Documents/Company/BRE/App/CRM/data-excel/BAO CAO DOANH THU.xlsx";

// Convert Excel date (may be null/string/Date) to YYYY-MM-DD or null.
function toDateStr(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 2020 || y > 2035) return null;
  return d.toISOString().slice(0, 10);
}

// Extract Excel revenue rows: Ma_SP col 6, Tổng phải thu col 26.
function loadExcelRevenue() {
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.2_Doanh thu"], { header: 1, raw: true, defval: null });
  const perProduct = new Map();
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const code = r[6] ? String(r[6]).trim() : null;
    const total = Number(r[26] ?? 0);
    if (!code || !total || Math.abs(total) < 0.5) continue;
    const cur = perProduct.get(code) || [];
    cur.push({
      excelRow: i + 1,
      date: toDateStr(r[1]),
      soBB: r[2] ? String(r[2]).trim() : null,
      dot: r[17] ? String(r[17]).trim() : null,
      amount: total,
    });
    perProduct.set(code, cur);
  }
  return perProduct;
}

// Extract Excel cost rows: Ma_SP col 3, Tổng col 38.
function loadExcelCost() {
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.3_Gia von"], { header: 1, raw: true, defval: null });
  const perProduct = new Map();
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const code = r[3] ? String(r[3]).trim() : null;
    const total = Number(r[38] ?? 0);
    if (!code || !total || Math.abs(total) < 0.5) continue;
    const cur = perProduct.get(code) || [];
    cur.push({
      excelRow: i + 1,
      date: toDateStr(r[1]),
      employee: r[2] ? String(r[2]).trim() : null,
      nvkd: r[9] ? String(r[9]).trim() : null,
      amount: total,
    });
    perProduct.set(code, cur);
  }
  return perProduct;
}

async function main() {
  console.log("Loading Excel...");
  const excelRev = loadExcelRevenue();
  const excelCost = loadExcelCost();

  console.log("Loading DB...");
  const dbRev = await sql`
    SELECT p.product_code, rr.id, rr.reconciliation_date, rr.minutes_number,
           rr.total_receivable_this_time AS amount
    FROM revenue_reconciliations rr JOIN products p ON p.id = rr.product_id
  `;
  const dbCost = await sql`
    SELECT p.product_code, cr.id, cr.reconciliation_date, cr.employee_name,
           cr.amount_payable_this_time
    FROM cost_reconciliations cr JOIN products p ON p.id = cr.product_id
  `;

  const dbRevByCode = new Map();
  for (const r of dbRev) {
    const cur = dbRevByCode.get(r.product_code) || [];
    cur.push(r);
    dbRevByCode.set(r.product_code, cur);
  }
  const dbCostByCode = new Map();
  for (const r of dbCost) {
    const cur = dbCostByCode.get(r.product_code) || [];
    cur.push(r);
    dbCostByCode.set(r.product_code, cur);
  }

  // Union tất cả product codes
  const allCodes = new Set([
    ...excelRev.keys(),
    ...excelCost.keys(),
    ...dbRevByCode.keys(),
    ...dbCostByCode.keys(),
  ]);

  const report = [];
  for (const code of allCodes) {
    const exR = excelRev.get(code) || [];
    const exC = excelCost.get(code) || [];
    const dbR = dbRevByCode.get(code) || [];
    const dbC = dbCostByCode.get(code) || [];
    report.push({
      code,
      exRcount: exR.length,
      dbRcount: dbR.length,
      exCcount: exC.length,
      dbCcount: dbC.length,
      revDiff: exR.length - dbR.length,
      costDiff: exC.length - dbC.length,
    });
  }

  // Filter: chỉ show căn có lệch số lượng
  const lech = report.filter((r) => r.revDiff !== 0 || r.costDiff !== 0);
  lech.sort((a, b) => Math.abs(b.revDiff) + Math.abs(b.costDiff) - Math.abs(a.revDiff) - Math.abs(a.costDiff));

  console.log(`\n=== BƯỚC 1: SỐ LƯỢNG DÒNG (${lech.length}/${allCodes.size} căn có lệch) ===\n`);
  console.log("Mã căn                      | DT Excel/App | GV Excel/App | Status");
  console.log("-".repeat(90));
  for (const r of lech) {
    const revStatus =
      r.revDiff === 0 ? "OK" : r.revDiff > 0 ? `App THIẾU ${r.revDiff}` : `App DƯ ${-r.revDiff}`;
    const costStatus =
      r.costDiff === 0 ? "OK" : r.costDiff > 0 ? `App THIẾU ${r.costDiff}` : `App DƯ ${-r.costDiff}`;
    console.log(
      `${r.code.padEnd(28)} | ${String(r.exRcount).padStart(4)}/${String(r.dbRcount).padStart(4)}    | ${String(r.exCcount).padStart(4)}/${String(r.dbCcount).padStart(4)}    | DT: ${revStatus.padEnd(18)} GV: ${costStatus}`,
    );
  }

  // Summary
  const totalRevMissing = lech.filter((r) => r.revDiff > 0).reduce((s, r) => s + r.revDiff, 0);
  const totalRevExtra = lech.filter((r) => r.revDiff < 0).reduce((s, r) => s - r.revDiff, 0);
  const totalCostMissing = lech.filter((r) => r.costDiff > 0).reduce((s, r) => s + r.costDiff, 0);
  const totalCostExtra = lech.filter((r) => r.costDiff < 0).reduce((s, r) => s - r.costDiff, 0);

  console.log(`\n=== TÓM TẮT SỐ LƯỢNG ===`);
  console.log(`  Doanh thu: App THIẾU ${totalRevMissing} dòng | App DƯ ${totalRevExtra} dòng`);
  console.log(`  Giá vốn:   App THIẾU ${totalCostMissing} dòng | App DƯ ${totalCostExtra} dòng`);
  console.log(`  Tổng số căn có bất thường: ${lech.length}/${allCodes.size}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
