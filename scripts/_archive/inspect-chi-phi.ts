import * as XLSX from "xlsx";
import * as path from "path";

const dir = path.join(process.cwd(), "data-excel");

function dumpSheet(file: string) {
  const wb = XLSX.readFile(path.join(dir, file));
  console.log(`\n\n=== FILE: ${file} ===`);
  console.log("Sheets:", wb.SheetNames);
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    console.log(`\n--- Sheet "${name}" — ${rows.length} rows ---`);
    // First 15 rows
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      console.log(`R${i}:`, JSON.stringify(rows[i]));
    }
    if (rows.length > 15) console.log(`... (${rows.length - 15} rows còn lại)`);
  }
}

dumpSheet("Chi Phí - Cá nhân 1.xlsx");
dumpSheet("Chi Phí - Cá nhân 2.xlsx");
