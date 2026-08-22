/**
 * Đọc Excel 2.3_Gia von và dump ra JSON snapshot commit vào repo.
 * Chạy local mỗi lần Excel BC DT cập nhật.
 * Output: lib/reports/cost-audit-snapshot.json
 */
import XLSX from "xlsx";
import { writeFileSync } from "fs";

const excelPath = "/Users/trietnguyen/Documents/Company/BRE/App/CRM/data-excel/BAO CAO DOANH THU.xlsx";
const outPath = "/Users/trietnguyen/Documents/Company/BRE/App/CRM/lib/reports/cost-audit-snapshot.json";

const wb = XLSX.readFile(excelPath, { cellDates: true, cellNF: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.3_Gia von"], { header: 1, raw: true, defval: null });

// Mapping cột sheet "2.3_Gia von" → cost_type DB (verified 2026-08-22).
// Header row idx=3. Xem doc trong lib/reports/missing-cost.ts.
function parseExcelRow(r) {
  const items = [];
  const push = (loai, amt) => { if (amt && Math.abs(amt) > 0.5) items.push({ loai, amt }); };
  push("HH sale", Number(r[21] ?? 0));            // Col U: PMG phai tra dot nay (gross)
  push("Hỗ trợ khách", Number(r[23] ?? 0));       // Col W: Chi hỗ trợ cho khách (chi thực tế)
  push("CĐT thưởng NVKD", Number(r[24] ?? 0));    // Col X: CĐT thưởng sale (trừ VAT)
  push("CĐT thưởng QL", Number(r[25] ?? 0));      // Col Y: CĐT thưởng QL sàn
  push("CTY thưởng QL", Number(r[27] ?? 0));      // Col AA: CTY thưởng quản lý → bonus_manager
  push("KPI CEO", Number(r[31] ?? 0));            // Col AE: KPI CEO còn tt đợt này
  push("KPI TPKD", Number(r[35] ?? 0));           // Col AI: KPI TPKD còn tt đợt này
  push("KPI Admin", Number(r[37] ?? 0));          // Col AK: Thưởng Admin
  return items;
}

const perProduct = {};
for (let i = 4; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const productCode = r[3];
  const total = Number(r[38] ?? 0);
  if (!productCode || !total) continue;
  const key = String(productCode);
  if (!perProduct[key]) perProduct[key] = [];
  perProduct[key].push({
    excelRow: i + 1,
    employee: r[2] ? String(r[2]).trim() : null,
    items: parseExcelRow(r),
    total,
  });
}

const snapshot = {
  snapshotAt: new Date().toISOString(),
  sourceFile: "BAO CAO DOANH THU.xlsx",
  sheet: "2.3_Gia von",
  totalRows: rows.length,
  perProduct,
};

writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf-8");
console.log(`✓ Snapshot saved to ${outPath}`);
console.log(`  ${Object.keys(perProduct).length} products, ${Object.values(perProduct).reduce((s, v) => s + v.length, 0)} rows`);
