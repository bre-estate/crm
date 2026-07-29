import * as XLSX from "xlsx";
const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx", { cellFormula: true });
const ws = wb.Sheets["2.3_Gia von"];

// Rows to inspect: 244 (B.31.20 kpi_admin), 260 (B.26.20 kpi_admin -12592), 225 (B.14.08 cdtSale -20M)
for (const rowNum of [244, 260, 225, 138]) {
  console.log(`\n─── Row ${rowNum + 1} (0-index ${rowNum}) ───`);
  for (const col of ["A", "B", "C", "D", "E", "L", "M", "N", "Q", "R", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL", "AM"]) {
    const ref = `${col}${rowNum + 1}`;
    const cell = ws[ref];
    if (!cell) continue;
    console.log(`  ${col}: ${cell.v}${cell.f ? `  =${cell.f}` : ""}`);
  }
}
