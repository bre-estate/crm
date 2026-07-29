import postgres from "postgres";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
dotenv.config({ path: ".env.local" });

const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const sql = readFileSync(join(process.cwd(), "drizzle", "0018_restructure_bctc.sql"), "utf8");
  await c.unsafe(sql);
  const cats = await c<{ code: string; name: string; group_bctc: string | null }[]>`
    SELECT code, name, group_bctc FROM accounting_categories ORDER BY display_order, code
  `;
  console.log("✅ Migration 0018 applied. Categories now:");
  for (const cat of cats) {
    console.log(`  ${cat.code.padEnd(10)} · ${(cat.group_bctc ?? "-").padEnd(6)} · ${cat.name}`);
  }
  const [txn] = await c<{ n: string }[]>`
    SELECT COUNT(*)::text AS n FROM financial_transactions
     WHERE category_code IN ('632', '6427-rent', '6427-svc', '6428', '153-211', 'secondary')
  `;
  console.log(`\n  Rows còn dùng category cũ (nên = 0): ${txn.n}`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
