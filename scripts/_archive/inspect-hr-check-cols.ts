import * as XLSX from "xlsx";

const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx");
const sheetName = "3_BC DOANH THU - GIA VON";
const ws = wb.Sheets[sheetName];
if (!ws) {
  console.error(`Sheet "${sheetName}" not found. Available:`, wb.SheetNames);
  process.exit(1);
}

// Header từ excel A-AI: cột W=index 22, AI=index 34
// Chuyển cột letter → index
const colIdx = (letter: string): number => {
  let n = 0;
  for (const c of letter.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};
const START = colIdx("W");
const END = colIdx("AI");
console.log(`Reading cols ${START}..${END} (W..AI, ${END - START + 1} cols)`);

// Read rows 0..10 để lấy header
const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });
console.log(`Total rows: ${rows.length}\n`);

// Find header row (likely row 0-5)
console.log("=== First 8 rows, cols W..AI ===");
for (let i = 0; i < Math.min(8, rows.length); i++) {
  const r = rows[i] ?? [];
  const slice = [];
  for (let c = START; c <= END; c++) {
    const letter = (() => {
      const n = c + 1;
      if (n <= 26) return String.fromCharCode(64 + n);
      const q = Math.floor((n - 1) / 26);
      const rem = (n - 1) % 26 + 1;
      return String.fromCharCode(64 + q) + String.fromCharCode(64 + rem);
    })();
    const val = String(r[c] ?? "").substring(0, 40);
    slice.push(`${letter}=${val}`);
  }
  console.log(`Row ${i}: ${slice.join(" | ")}`);
}

// Detect data start row: find first row with numeric in col A
let dataStart = -1;
for (let i = 0; i < rows.length; i++) {
  const v = rows[i]?.[0];
  if (typeof v === "number" && v > 0 && v < 10000) {
    dataStart = i;
    break;
  }
}
console.log(`\nData start row: ${dataStart}`);

// Sample 5 data rows for cols W-AI
console.log(`\n=== Sample data rows (W..AI) ===`);
for (let i = dataStart; i < Math.min(dataStart + 5, rows.length); i++) {
  const r = rows[i];
  if (!r) continue;
  console.log(`\nRow ${i}: STT=${r[0]}, căn=${r[6] ?? r[7] ?? "?"}`);
  for (let c = START; c <= END; c++) {
    const letter = (() => {
      const n = c + 1;
      if (n <= 26) return String.fromCharCode(64 + n);
      const q = Math.floor((n - 1) / 26);
      const rem = (n - 1) % 26 + 1;
      return String.fromCharCode(64 + q) + String.fromCharCode(64 + rem);
    })();
    const v = r[c];
    if (v !== null && v !== undefined && v !== "") {
      console.log(`  ${letter}: ${typeof v === "number" ? v.toFixed(4) : String(v).substring(0, 60)}`);
    }
  }
}
