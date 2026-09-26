import * as XLSX from "xlsx";
const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx", { cellFormula: true });
const ws = wb.Sheets["2.3_Gia von"];

// Sample rows với formula
for (const rowNum of [5, 6, 10, 15]) {
  console.log(`\n--- Row ${rowNum + 1} ---`);
  for (const col of ["AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL", "AM"]) {
    const ref = `${col}${rowNum + 1}`;
    const cell = ws[ref];
    if (!cell) continue;
    console.log(`  ${col}: value=${cell.v}${cell.f ? `  formula: =${cell.f}` : ""}`);
  }
}
