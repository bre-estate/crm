import * as XLSX from "xlsx";
import { readFileSync } from "fs";
const wb = XLSX.read(readFileSync("data-excel/Bao Cao Doanh Thu.xlsx"), { cellDates: false });
for (const ten of ["2.1_TT DU AN", "2.2_Doanh thu", "2.3_Gia von"]) {
  const g = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[ten], { header: 1, defval: null, raw: false });
  console.log(`\n=== ${ten}: ${g.length} dòng ===`);
  for (let i = 0; i < Math.min(4, g.length); i++) {
    const r = (g[i] as any[]).slice(0, 14).map((c) => (c == null ? "" : String(c).slice(0, 15)));
    console.log(`  [${i}]`, r.join(" | "));
  }
}
