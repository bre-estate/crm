import * as XLSX from "xlsx";
import * as path from "path";

const wb = XLSX.readFile(
  path.join(process.cwd(), "data-excel", "Chi phí", "So theo doi thanh toan.xlsx"),
);
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  console.log(`\n=== Sheet "${name}" — ${rows.length} rows ===`);
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    console.log(`R${i}:`, JSON.stringify(rows[i]));
  }
  if (rows.length > 25) console.log(`... (${rows.length - 25} rows còn lại)`);
}
