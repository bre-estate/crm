/**
 * Auto-classify accounting_journal (NKC) — dùng cho P&L dồn tích khớp Kim BC.
 * Áp classifyNkc() cho mỗi row → gán bucket.
 *
 * Usage: cd BRE/App/CRM && npx tsx scripts/classify-accounting-journal.ts [--force]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { classifyNkc, CATEGORIES } from "../lib/transaction-classifier";
import fs from "fs";

const FORCE = process.argv.includes("--force");
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  // Chạy migration trước (idempotent)
  const mig = fs.readFileSync("drizzle/0032_nkc_category.sql", "utf-8");
  await sql.unsafe(mig);

  const rows = await sql<Array<{ id: number; debit_account: string; credit_account: string; description: string; amount: number }>>`
    SELECT id, debit_account, credit_account, description, amount
    FROM accounting_journal
    ${FORCE ? sql`` : sql`WHERE category IS NULL OR category_source IS NULL OR category_source != 'manual'`}`;

  console.log(`Classifying ${rows.length} NKC rows...`);
  const buckets = new Map<string, { count: number; total: number }>();
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    for (const r of chunk) {
      const result = classifyNkc({
        debitAccount: r.debit_account,
        creditAccount: r.credit_account,
        description: r.description,
        amount: Number(r.amount),
      });
      await sql`
        UPDATE accounting_journal
        SET category = ${result.category},
            category_source = 'auto',
            category_confidence = ${result.confidence}
        WHERE id = ${r.id}`;
      const b = buckets.get(result.category) ?? { count: 0, total: 0 };
      b.count++;
      b.total += Number(r.amount);
      buckets.set(result.category, b);
    }
  }

  console.log(`\n═══ Breakdown per bucket (accrual, filtered 2025 sẽ query riêng) ═══`);
  const sorted = Array.from(buckets.entries()).sort((a, b) => b[1].total - a[1].total);
  for (const [key, v] of sorted) {
    const meta = CATEGORIES[key as keyof typeof CATEGORIES];
    console.log(`${key.padEnd(20)} ${String(v.count).padStart(4)} rows  ${fmt(v.total).padStart(18)}  ${meta?.label ?? ""}`);
  }

  // So sánh với Kim BC 2025
  console.log(`\n═══ So Kim BC 2025 (dồn tích) ═══`);
  const kim: Record<string, number> = {
    'hh_sale': 1794473527,
    'ho_tro_khach': 83539517,
    'cty_thuong_ql': 165000000,
    'cty_thuong_tpkd': 52040296,
    'cty_thuong_admin': 7958743,
    'cty_thuong_ceo': 122971840,
    'luong_nvkd': 345221721,
    'thuong_ds_sale': 83981270,
    'luong_admin': 348473123,
    'marketing': 192330000,
  };
  const rows2025 = await sql`
    SELECT category, COALESCE(SUM(amount),0)::float8 as s
    FROM accounting_journal
    WHERE substr(entry_date,1,4)='2025' AND credit_account != '911'
    GROUP BY category`;
  const g = new Map<string, number>();
  for (const r of rows2025) g.set(r.category, Number(r.s));
  for (const [k, v] of Object.entries(kim)) {
    const em = g.get(k) ?? 0;
    const diff = em - v;
    const mark = Math.abs(diff) < v * 0.1 ? '✅' : Math.abs(diff) < v * 0.3 ? '~' : '❌';
    console.log(`  ${k.padEnd(20)} em: ${fmt(em).padStart(15)}  Kim: ${fmt(v).padStart(15)}  chênh: ${(diff>=0?'+':'')+fmt(diff)}  ${mark}`);
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
