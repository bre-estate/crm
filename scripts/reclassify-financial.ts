/**
 * Reclassify data trong financial_transactions theo rule mới.
 * Đọc mọi row, chạy classify() lại với description + note, update nếu khác.
 *
 * Cũng seed thêm category mới '3331-3334' (Thuế pass-through) nếu chưa có.
 *
 * Run: npx tsx scripts/reclassify-financial.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import { classify } from "../lib/accounting/classify";
dotenv.config({ path: ".env.local" });

const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  // Seed categories mới nếu chưa có
  await c`
    INSERT INTO accounting_categories (code, name, group_name, is_expense, display_order) VALUES
      ('3331-3334', 'Thuế GTGT + TNDN (pass-through)', 'Công nợ thuế', false, 75),
      ('141', 'Tạm ứng nội bộ', 'Tạm ứng', false, 140)
    ON CONFLICT (code) DO NOTHING
  `;
  console.log("✅ Categories '3331-3334' + '141' seeded.\n");

  const rows = await c<any[]>`
    SELECT id, description, note, category_code, management_group
    FROM financial_transactions
  `;
  console.log(`Đọc ${rows.length} rows...`);

  let changed = 0;
  const changeStats = new Map<string, number>();
  for (const r of rows) {
    // Reclassify từ description + note (giống parser)
    const text = `${r.description ?? ""} ${r.note ?? ""}`;
    const c2 = classify(text);
    if (c2.categoryCode !== r.category_code || c2.managementGroup !== r.management_group) {
      const key = `${r.category_code} → ${c2.categoryCode}`;
      changeStats.set(key, (changeStats.get(key) ?? 0) + 1);
      await c`
        UPDATE financial_transactions
        SET category_code = ${c2.categoryCode},
            management_group = ${c2.managementGroup},
            updated_at = now()
        WHERE id = ${r.id}
      `;
      changed++;
    }
  }
  console.log(`\n✅ Updated ${changed} rows.\n`);
  console.log("Migration stats:");
  for (const [k, n] of [...changeStats.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${n} rows`);
  }

  // Summary sau reclassify
  console.log("\n== SUMMARY sau reclassify ==");
  const byGroup = await c<any[]>`
    SELECT COALESCE(management_group, '?') AS g, COUNT(*)::int AS n, SUM(amount)::bigint AS s
    FROM financial_transactions
    GROUP BY management_group
    ORDER BY 1
  `;
  for (const g of byGroup) {
    console.log(
      `  ${g.g.padEnd(45)} ${String(g.n).padStart(5)} rows  ${Number(g.s).toLocaleString("vi-VN").padStart(18)} VND`,
    );
  }

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
