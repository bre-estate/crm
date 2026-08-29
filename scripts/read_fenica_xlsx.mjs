import XLSX from "xlsx";
import fs from "fs";

const path = "/Users/trietnguyen/Documents/Company/BRE/App/CRM/data-excel/Fenica/FENICA_BĐS BRE_ĐỐI CHIẾU PDV (Từ ngày 18.07.2026 đến ngày 17.08.2026).xlsx";
const wb = XLSX.readFile(path, { cellDates: true, cellNF: false });
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  console.log(`\n═══ SHEET: ${name} (${rows.length} rows) ═══`);
  rows.slice(0, 50).forEach((r, i) => {
    // Rút gọn giá trị: null/empty → "", Date → date string, > 20 char → cắt
    const trimmed = (r ?? []).map(c => {
      if (c == null) return "";
      if (c instanceof Date) return c.toISOString().slice(0, 10);
      const s = String(c);
      return s.length > 30 ? s.slice(0, 27) + "..." : s;
    });
    console.log(`  R${i}:`, JSON.stringify(trimmed));
  });
  if (rows.length > 50) console.log(`  ... còn ${rows.length - 50} rows`);
}
