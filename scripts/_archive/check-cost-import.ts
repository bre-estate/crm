import * as XLSX from "xlsx";
const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx", { cellFormula: true });
const ws = wb.Sheets["2.3_Gia von"];
const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });

// Header row 3 (0-indexed)
console.log("Cols 10-25:");
for (let c = 10; c < 25; c++) {
  const letter = String.fromCharCode(65 + c);
  const hdr = rows[3]?.[c];
  console.log(`  col ${c} (${letter}): ${hdr}`);
}

console.log(`\n=== Sample row 5 (data row 1) ===`);
const r = rows[5] ?? [];
for (let c = 10; c < 25; c++) {
  const letter = String.fromCharCode(65 + c);
  const hdr = rows[3]?.[c];
  const val = r[c];
  console.log(`  col ${c} (${letter}) ${hdr}: ${val}`);
}
