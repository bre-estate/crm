import * as XLSX from "xlsx";
import { readFileSync } from "fs";
const wb = XLSX.read(readFileSync("data-excel/Bao Cao Doanh Thu.xlsx"), { cellDates: false });
const g = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["2.2_Doanh thu"], { header: 1, defval: null, raw: false });
for (let i = 2; i < 8; i++) {
  const r = (g[i] as any[]).map((c, j) => (c == null ? "" : `${j}:${String(c).slice(0, 18)}`)).filter(Boolean);
  console.log(`[${i}]`, r.join(" | "));
}
console.log("--- 2 dòng dữ liệu đầu ---");
for (let i = 5; i < 8; i++) {
  const r = (g[i] as any[]).map((c, j) => (c == null ? "" : `${j}:${String(c).slice(0, 16)}`)).filter(Boolean);
  if (r.length > 3) console.log(`[${i}]`, r.join(" | "));
}
