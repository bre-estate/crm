import XLSX from "xlsx";
const path = "/Users/trietnguyen/Documents/Company/BRE/App/CRM/data-excel/BAO CAO DOANH THU.xlsx";
const wb = XLSX.readFile(path, { cellDates: true, cellNF: false });
console.log("Sheets:", wb.SheetNames);
console.log(`Total ${wb.SheetNames.length} sheets\n`);

// Show first row + row count per sheet
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const cols = rows[0]?.length ?? 0;
  console.log(`[${name}] ${rows.length} rows × ${cols} cols`);
}
