import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const rows = await sql`SELECT email, role, active FROM user_permissions ORDER BY email`;
  rows.forEach((r: any) => console.log(`  ${r.email}: role=${r.role}, active=${r.active}`));
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
