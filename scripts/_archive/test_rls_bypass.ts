import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  // Test 3 tables vừa enable RLS: đọc được ko?
  const [{ count: bank }] = await sql`SELECT COUNT(*)::int FROM bank_transactions`;
  const [{ count: rentals }] = await sql`SELECT COUNT(*)::int FROM rentals`;
  const [{ count: contracts }] = await sql`SELECT COUNT(*)::int FROM contracts`;
  console.log(`bank_transactions: ${bank} rows ✓`);
  console.log(`rentals: ${rentals} rows ✓`);
  console.log(`contracts: ${contracts} rows ✓`);
  console.log("→ Server (postgres role, bypass RLS) vẫn đọc được. App OK.");
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
