import postgres from "postgres";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
dotenv.config({ path: ".env.local" });

const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const sql = readFileSync(join(process.cwd(), "drizzle", "0017_accrual_month.sql"), "utf8");
  await c.unsafe(sql);
  const [cnt] = await c<{ n: string }[]>`
    SELECT COUNT(*)::text AS n
      FROM financial_transactions
     WHERE accrual_month IS NOT NULL
  `;
  console.log("✅ Migration 0017 applied. Rows with accrual_month:", cnt.n);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
