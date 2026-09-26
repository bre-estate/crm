import XLSX from "xlsx";
const path = "/Users/trietnguyen/Documents/Company/BRE/App/CRM/data-excel/BAO CAO DOANH THU.xlsx";
const wb = XLSX.readFile(path, { cellDates: true, cellNF: false });

function showSheet(name, headerRowIdx = 0, showRows = [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  console.log(`\n═══ ${name} (${rows.length} rows) ═══`);
  showRows.forEach(idx => {
    if (rows[idx]) {
      const trimmed = rows[idx].map(c => {
        if (c == null) return "";
        if (c instanceof Date) return c.toISOString().slice(0, 10);
        const s = String(c);
        return s.length > 25 ? s.slice(0, 22) + "..." : s;
      });
      console.log(`  R${idx}:`, JSON.stringify(trimmed).slice(0, 400));
    }
  });
}

showSheet("2.2_Doanh thu");
showSheet("2.3_Gia von");
