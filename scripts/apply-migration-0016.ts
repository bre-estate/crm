import postgres from "postgres";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
dotenv.config({ path: ".env.local" });

const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const sql = readFileSync(join(process.cwd(), "drizzle", "0016_invoice_unique_partner.sql"), "utf8");
  await c.unsafe(sql);
  const [cnt] = await c<{ n: string }[]>`
    SELECT indexname AS n FROM pg_indexes
    WHERE tablename = 'invoices' AND indexname = 'invoices_number_date_partner_uniq'
  `;
  console.log("✅ Migration applied. Index created:", cnt?.n ?? "MISSING");
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
