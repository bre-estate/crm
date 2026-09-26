import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import fs from "fs";
async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const migration = fs.readFileSync("drizzle/0039_chat_logs.sql", "utf-8");
  await sql.unsafe(migration);
  console.log("✓ Migration applied");
  const [{ count }] = await sql`SELECT COUNT(*)::int FROM chat_logs`;
  console.log(`  chat_logs: ${count} rows`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
