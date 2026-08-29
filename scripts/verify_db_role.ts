import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const [r] = await sql`SELECT current_user AS role, session_user`;
  console.log("Current DB role:", r.role);
  const [b] = await sql`SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  console.log("Bypass RLS?", b.rolbypassrls);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
