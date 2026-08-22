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

function parseExcelRow(r) {
  const items = [];
  const push = (loai, amt) => { if (amt && Math.abs(amt) > 0.5) items.push({ loai, amt }); };
  push("HH sale", Number(r[21] ?? 0));
  push("Hỗ trợ khách", Number(r[24] ?? 0));
  push("CĐT thưởng NVKD", Number(r[25] ?? 0));
  push("CĐT thưởng QL", Number(r[27] ?? 0));
  push("KPI CEO", Number(r[31] ?? 0));
  push("KPI TPKD", Number(r[35] ?? 0));
  push("KPI Admin", Number(r[37] ?? 0));
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
