import * as XLSX from "xlsx";

const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx");
const ws = wb.Sheets["3_BC DOANH THU - GIA VON"];
const colIdx = (letter: string): number => {
  let n = 0;
  for (const c of letter.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};
const START = colIdx("W");
const END = colIdx("AI");

const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });

// Print header rows 3-9 in detail
console.log(`=== Header rows 3-9, cols A-AI (all) ===`);
for (let i = 3; i < 10; i++) {
  const r = rows[i] ?? [];
  console.log(`\n--- Row ${i} ---`);
  for (let c = 0; c <= END; c++) {
    const letter = (() => {
      const n = c + 1;
      if (n <= 26) return String.fromCharCode(64 + n);
      const q = Math.floor((n - 1) / 26);
      const rem = (n - 1) % 26 + 1;
      return String.fromCharCode(64 + q) + String.fromCharCode(64 + rem);
    })();
    const v = r[c];
    if (v !== null && v !== undefined && v !== "") {
      const s = String(v).substring(0, 60);
      const highlight = c >= START ? " ⭐" : "";
      console.log(`  ${letter}: ${s}${highlight}`);
    }
  }
}
