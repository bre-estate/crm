/**
 * Auto-classify 824 rows bank_transactions vào 32 bucket.
 * Chỉ classify rows chưa có category (category IS NULL) hoặc category_source='auto' (rerun refresh).
 *
 * Usage:
 *   cd BRE/App/CRM && npx tsx scripts/classify-bank-transactions.ts [--force]
 *   --force: rerun cả rows đã manual (dangerous — thường không dùng)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { classify, CATEGORIES } from "../lib/transaction-classifier";

const FORCE = process.argv.includes("--force");
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const rows = await sql<Array<{ id: number; description: string; debit_amount: number | null; credit_amount: number | null }>>`
    SELECT id, description, debit_amount, credit_amount
    FROM bank_transactions
    ${FORCE ? sql`` : sql`WHERE category IS NULL OR category_source IS NULL OR category_source != 'manual'`}`;

  console.log(`Classifying ${rows.length} rows...`);
  let updated = 0;
  const buckets = new Map<string, { count: number; total: number }>();
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    for (const r of chunk) {
      const result = classify({
        description: r.description,
        debitAmount: r.debit_amount,
        creditAmount: r.credit_amount,
      });
      await sql`
        UPDATE bank_transactions
        SET category = ${result.category},
            category_source = 'auto',
            category_confidence = ${result.confidence}
        WHERE id = ${r.id}`;
      updated++;
      const amt = Number(r.debit_amount ?? 0) + Number(r.credit_amount ?? 0);
      const b = buckets.get(result.category) ?? { count: 0, total: 0 };
      b.count++;
      b.total += amt;
      buckets.set(result.category, b);
    }
  }

  console.log(`\n✅ Updated ${updated} rows\n`);
  console.log("═══ Breakdown per bucket ═══");
  const sorted = Array.from(buckets.entries()).sort((a, b) => b[1].total - a[1].total);
  for (const [key, v] of sorted) {
    const meta = CATEGORIES[key as keyof typeof CATEGORIES];
    console.log(`${key.padEnd(20)} ${String(v.count).padStart(4)} rows  ${fmt(v.total).padStart(18)}  [${meta?.group ?? "?"}] ${meta?.label ?? ""}`);
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
