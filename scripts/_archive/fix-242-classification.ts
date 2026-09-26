/**
 * Fix classification cho category_code='242' theo rule mới:
 *   - Gộp #1366 (VAT bàn thờ 2.15M) → #1353 (bàn thờ 26.2M) → 28.35M
 *   - Gộp #1363 (VAT Camera 1.5M) → #1407 (Lắp đặt Camera 1.7M) → 3.2M
 *   - Reclassify các row còn lại qua classify(text, recipient, amount)
 *     (tự apply exclude keywords + threshold 3M)
 *   - Manual override #1551 (Ổ điện 3.373M): user chọn chuyển 6423 chi thẳng
 *
 * Chạy: npx tsx scripts/fix-242-classification.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { classify } from "../lib/accounting/classify";

const MERGE_PAIRS = [
  { targetId: 1353, sourceId: 1366, name: "Bàn thờ + VAT 10%" },
  { targetId: 1407, sourceId: 1363, name: "Lắp đặt Camera + VAT 10%" },
];

const MANUAL_OVERRIDES = [
  { id: 1551, categoryCode: "6423", managementGroup: "6a. Đồ dùng VP", note: "Manual: ổ điện chi thẳng dù 3.373M ≥ ngưỡng (per Triết 2026-08-11)" },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  // 1. Merge VAT vào TSCĐ gốc + delete VAT row
  console.log("━━━ Bước 1: Gộp VAT vào TSCĐ gốc ━━━");
  for (const p of MERGE_PAIRS) {
    const [target] = await sql`SELECT id, amount, description FROM financial_transactions WHERE id = ${p.targetId}`;
    const [source] = await sql`SELECT id, amount, description FROM financial_transactions WHERE id = ${p.sourceId}`;
    if (!target || !source) {
      console.log(`  ⚠️  Skip ${p.name}: target=${p.targetId} source=${p.sourceId} không tìm thấy`);
      continue;
    }
    const oldAmount = Number(target.amount);
    const addAmount = Number(source.amount);
    const newAmount = oldAmount + addAmount;
    const mergeNote = ` · Đã gộp VAT 10% từ #${p.sourceId} (+${Math.round(addAmount).toLocaleString("vi-VN")})`;
    await sql`
      UPDATE financial_transactions
      SET amount = ${newAmount},
          note = coalesce(note, '') || ${mergeNote}::text,
          updated_at = now()
      WHERE id = ${p.targetId}
    `;
    await sql`DELETE FROM financial_transactions WHERE id = ${p.sourceId}`;
    console.log(`  ✓ #${p.targetId} ${target.description}: ${Math.round(oldAmount).toLocaleString("vi-VN")} → ${Math.round(newAmount).toLocaleString("vi-VN")} (gộp #${p.sourceId})`);
  }

  // 2. Reclassify các row 242 còn lại qua rule mới
  console.log("\n━━━ Bước 2: Reclassify 242 rows còn lại ━━━");
  const rows = await sql`
    SELECT id, description, note, amount, recipient, category_code, management_group
    FROM financial_transactions
    WHERE category_code = '242'
    ORDER BY amount DESC
  `;
  let changed = 0, kept = 0;
  const stats = new Map<string, number>();
  for (const r of rows) {
    const text = `${r.description ?? ""} ${r.note ?? ""}`;
    const c2 = classify(text, r.recipient ?? undefined, Number(r.amount));
    if (c2.categoryCode === r.category_code) {
      kept++;
      continue;
    }
    const key = `${r.category_code} → ${c2.categoryCode}`;
    stats.set(key, (stats.get(key) ?? 0) + 1);
    const rcNote = ` · Reclassify: ${c2.note}`;
    await sql`
      UPDATE financial_transactions
      SET category_code = ${c2.categoryCode},
          management_group = ${c2.managementGroup},
          note = coalesce(note, '') || ${rcNote}::text,
          updated_at = now()
      WHERE id = ${r.id}
    `;
    changed++;
    console.log(`  ${key} #${r.id} ${Math.round(Number(r.amount)).toLocaleString("vi-VN").padStart(12)}  ${r.description}`);
  }
  console.log(`\nStats: ${changed} chuyển bucket, ${kept} giữ 242`);
  for (const [k, n] of stats) console.log(`  ${k}: ${n} rows`);

  // 3. Manual overrides
  console.log("\n━━━ Bước 3: Manual overrides ━━━");
  for (const o of MANUAL_OVERRIDES) {
    const [row] = await sql`SELECT id, amount, description, category_code FROM financial_transactions WHERE id = ${o.id}`;
    if (!row) {
      console.log(`  ⚠️  Skip #${o.id}: không tìm thấy`);
      continue;
    }
    if (row.category_code === o.categoryCode) {
      console.log(`  ⏩ #${o.id} đã là ${o.categoryCode}, skip`);
      continue;
    }
    const moNote = ` · Manual: ${o.note}`;
    await sql`
      UPDATE financial_transactions
      SET category_code = ${o.categoryCode},
          management_group = ${o.managementGroup},
          note = coalesce(note, '') || ${moNote}::text,
          updated_at = now()
      WHERE id = ${o.id}
    `;
    console.log(`  ✓ #${o.id} ${row.description} → ${o.categoryCode}`);
  }

  // 4. Verify final state
  console.log("\n━━━ Bước 4: Verify ━━━");
  const [totals] = await sql`
    SELECT
      count(*) filter (where category_code = '242')::int AS n_242,
      coalesce(sum(amount) filter (where category_code = '242'), 0)::float8 AS total_242
    FROM financial_transactions
  `;
  console.log(`  TSCĐ 242 sau fix: ${totals.n_242} row, tổng ${Math.round(Number(totals.total_242)).toLocaleString("vi-VN")} VND`);

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
