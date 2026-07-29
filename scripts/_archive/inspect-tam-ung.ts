import * as XLSX from "xlsx";
import * as path from "path";

const dir = path.join(process.cwd(), "data-excel", "Chi phí");
const wb = XLSX.readFile(path.join(dir, "SỔ TẠM ỨNG BRE.xlsx"));
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  console.log(`\n--- Sheet "${name}" — ${rows.length} rows ---`);
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    console.log(`R${i}:`, JSON.stringify(rows[i]));
  }
  if (rows.length > 20) console.log(`... (${rows.length - 20} rows còn lại)`);
}
