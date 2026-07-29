import * as XLSX from "xlsx";
const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx", { cellFormula: true });
const ws = wb.Sheets["2.1_TT DU AN"];
const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });

console.log("=== Sheet 2.1 header rows 3-8 (cols P onwards) ===");
for (let i = 3; i < 8; i++) {
  const r = rows[i] ?? [];
  console.log(`\n--- Row ${i} ---`);
  for (let c = 15; c < 50; c++) {
    const letter = (() => {
      const n = c + 1;
      if (n <= 26) return String.fromCharCode(64 + n);
      const q = Math.floor((n - 1) / 26);
      const rem = (n - 1) % 26 + 1;
      return String.fromCharCode(64 + q) + String.fromCharCode(64 + rem);
    })();
    const v = r[c];
    if (v !== null && v !== undefined && v !== "") {
      console.log(`  ${letter}: ${String(v).substring(0, 55)}`);
    }
  }
}

// Sample row 7 (căn A.05.09?)
console.log(`\n=== Row 7 A/H data ===`);
console.log(`  A7: ${ws.A8?.v}`);
console.log(`  H7: ${ws.H8?.v}`);
console.log(`  T7 (pmgBase): ${ws.T8?.v}`);
console.log(`  AL7: ${ws.AL8?.v}`);
console.log(`  AA7: ${ws.AA8?.v}`);
console.log(`  AB7: ${ws.AB8?.v}`);
