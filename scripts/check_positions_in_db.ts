import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const rows = await sql`SELECT DISTINCT position, COUNT(*)::int as n FROM employees GROUP BY position`;
  rows.forEach((r: any) => console.log(`  "${r.position}": ${r.n}`));
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
