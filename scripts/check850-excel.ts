import * as XLSX from "xlsx";
import * as path from "path";

const wb = XLSX.readFile(path.join(process.cwd(), "BAO CAO DOANH THU.xlsx"));
const ws = wb.Sheets["2.1_TT DU AN"];
if (!ws) {
  console.error("Sheet 2.1_Danh sách căn not found");
  console.log("Available sheets:", wb.SheetNames);
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });

// Row structure: header rows 0-5, data từ row 6+
// Find row where unit_code (col 3?) = A-07-09
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  // Search all cols for A-07-09
  const rowStr = r.map((v) => String(v ?? "")).join("|");
  if (rowStr.includes("A-07-09") || rowStr.includes("A.07.09") || rowStr.includes("A_07_09")) {
    console.log(`\n=== Row ${i + 1} (excel row number) ===`);
    r.forEach((v, idx) => {
      if (v !== null && v !== "") console.log(`  col ${idx}: ${JSON.stringify(v)}`);
    });
  }
}

// Also show header row (rows 0-5)
console.log("\n=== Header rows (top) ===");
for (let i = 0; i < 6; i++) {
  console.log(`Row ${i}:`, rows[i]);
}
