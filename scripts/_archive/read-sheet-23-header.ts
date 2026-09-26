import * as XLSX from "xlsx";
const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx", { cellFormula: true });
const ws = wb.Sheets["2.3_Gia von"];
const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });

console.log("=== Sheet 2.3 header rows 0-6 ===");
for (let i = 0; i < 6; i++) {
  const r = rows[i] ?? [];
  console.log(`\n--- Row ${i} ---`);
  for (let c = 0; c < 45; c++) {
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
