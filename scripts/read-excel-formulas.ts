import * as XLSX from "xlsx";

const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx", { cellFormula: true });
const ws = wb.Sheets["3_BC DOANH THU - GIA VON"];

// Row 9 in Excel = STT 1 (data start). Cần đọc từng cell W..AI.
// Chọn row đầu tiên có STT (dùng 9 để có formula ổn định).
const TARGET_ROWS = [11]; // A.05.09 (Fiato Uptown, có data đầy đủ)
const COLS = ["R", "U", "AV", "AW", "AX"];

for (const rowNum of TARGET_ROWS) {
  const cellRef = `A${rowNum + 1}`; // XLSX 1-indexed
  const sttCell = ws[cellRef];
  const stt = sttCell?.v;
  const canRef = ws[`C${rowNum + 1}`]?.v;
  const projRef = ws[`D${rowNum + 1}`]?.v;
  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`  Row ${rowNum + 1} — STT=${stt}, căn=${canRef}, dự án=${projRef}`);
  console.log(`═════════════════════════════════════════════════`);
  for (const col of COLS) {
    const ref = `${col}${rowNum + 1}`;
    const cell = ws[ref];
    if (!cell) continue;
    const value = cell.v;
    const formula = cell.f;
    console.log(`  ${col}: value=${typeof value === "number" ? value.toFixed(2) : value}`);
    if (formula) console.log(`      formula: =${formula}`);
  }
}
