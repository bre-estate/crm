import * as XLSX from "xlsx";

const file = "data-excel/SO SACH BRE 2025.xlsx";
const wb = XLSX.readFile(file);

console.log(`\n=== FILE: ${file} ===`);
console.log(`Sheets (${wb.SheetNames.length}):`);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  const rows = range.e.r - range.s.r + 1;
  const cols = range.e.c - range.s.c + 1;
  console.log(`  - "${name}" · ${rows} rows × ${cols} cols`);
}

// Dump first sheet fully to see structure
console.log(`\n=== First 15 rows of each sheet ===`);
for (const name of wb.SheetNames) {
  console.log(`\n--- Sheet: "${name}" ---`);
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false });
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const cells = (rows[i] as any[]).map((c) => {
      if (c === null || c === undefined) return "";
      const s = String(c);
      return s.length > 40 ? s.substring(0, 40) + "…" : s;
    });
    console.log(`  [${String(i).padStart(3)}] ${cells.join(" | ")}`);
  }
  console.log(`  ... (total ${rows.length} rows)`);
}
