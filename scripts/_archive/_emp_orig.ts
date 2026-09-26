import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import XLSX from "xlsx";
const sql = postgres(process.env.DATABASE_URL!);
async function main() {
  // Employees full record
  const [e2] = await sql`SELECT * FROM employees WHERE id=2`;
  console.log("Employee #2 (Lê Gia Giang):");
  for (const k of Object.keys(e2||{})) console.log(`  ${k}: ${e2[k]}`);

  // Activity log liên quan
  console.log("\n═══ Activity logs mentioning Lê Gia Giang ═══");
  const acts = await sql`SELECT id, created_at, actor_email, action, target_type, target_id, details
    FROM activity_logs WHERE details::text ILIKE '%Gia Giang%' OR target_type='employee' AND target_id=2 ORDER BY created_at LIMIT 10`;
  for (const a of acts) console.log(`  ${a.created_at} · ${a.actor_email} · ${a.action} · ${a.target_type}#${a.target_id} · ${String(a.details).slice(0,80)}`);

  // Search Excel BCDT sheet 2.1: sale_person = "Lê Gia Giang"
  console.log("\n═══ Excel BCDT 2.1 - rows có 'Lê Gia Giang' ═══");
  const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx");
  const sh = wb.Sheets["2.1_TT DU AN"];
  const rows: any[][] = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false });
  let count = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const txt = r.map((c:any)=>String(c??"")).join(" | ");
    if (/Gia Giang/i.test(txt) && !/Cẩm/i.test(txt.replace(/Cẩm Giang/g, ""))) {
      // Trim rows containing "Gia Giang" but not "Cẩm Giang"
      const gia = r.findIndex((c:any) => /Lê Gia Giang/i.test(String(c||"")));
      if (gia >= 0) {
        count++;
        if (count <= 5) console.log(`  [row ${i+1}] col ${gia}: ${r[gia]} · unit=${r[2]} · sale=${r[7]} · dept_leader=${r[8]}`);
      }
    }
  }
  console.log(`  Total: ${count} rows in Excel với "Lê Gia Giang"`);
  await sql.end();
}
main();
