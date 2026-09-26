import * as XLSX from "xlsx";

const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx", { cellFormula: true });
const ws = wb.Sheets["2.2_Doanh thu"];
const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });

// Header rows 3-6
console.log("=== Sheet 2.2 headers ===");
for (let i = 3; i < 8; i++) {
  const r = rows[i] ?? [];
  console.log(`\n--- Row ${i} ---`);
  for (let c = 0; c < 32; c++) {
    const letter = (() => {
      const n = c + 1;
      if (n <= 26) return String.fromCharCode(64 + n);
      const q = Math.floor((n - 1) / 26);
      const rem = (n - 1) % 26 + 1;
      return String.fromCharCode(64 + q) + String.fromCharCode(64 + rem);
    })();
    const v = r[c];
    if (v !== null && v !== undefined && v !== "") {
      console.log(`  ${letter}: ${String(v).substring(0, 60)}`);
    }
  }
}

// Sample row 6 (first data) col P
console.log(`\n=== Row 6 col P sample ===`);
const cell = ws["P7"] || ws["P8"] || ws["P6"];
console.log(cell);
