/**
 * Fix 2 việc liên quan Hồ Gia = Hồ Nguyễn Công Thành:
 *   1. Xoá alias employee #31 "Hồ Gia" (canonical là #3 "Hồ Nguyễn Công Thành")
 *   2. Reclassify 3 row "Lương Hồ Gia (Marketing)" 3M/tháng từ 6421 (lương) → 6417 (marketing)
 *      per Triết 2026-08-12: đây là budget marketing gửi cho Công Thành chạy quảng cáo bán hàng, không phải lương admin.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("━━━ Bước 1: Verify alias #31 an toàn xóa ━━━");
  const [alias] = await sql`SELECT id, name, alias_of_id FROM employees WHERE id = 31`;
  if (!alias) {
    console.log("  ⚠️  #31 không tồn tại, skip.");
  } else {
    console.log(`  Alias record: #${alias.id} "${alias.name}" → alias_of_id=${alias.alias_of_id}`);
    const children = await sql`SELECT id, name FROM employees WHERE alias_of_id = 31`;
    if (children.length > 0) {
      console.log(`  ⚠️  ${children.length} employee khác trỏ alias_of_id đến #31 — cần xử lý trước.`);
      for (const c of children) console.log(`    #${c.id} ${c.name}`);
      process.exit(1);
    }
    console.log(`  ✅ Không có employee nào tham chiếu #31.`);
  }

  console.log("\n━━━ Bước 2: Xóa alias #31 ━━━");
  if (alias) {
    const del = await sql`DELETE FROM employees WHERE id = 31 RETURNING id, name`;
    console.log(`  ✓ Xóa #${del[0]?.id} "${del[0]?.name}"`);
  }

  console.log("\n━━━ Bước 3: Reclassify 3 row 'Lương Hồ Gia (Marketing)' 6421 → 6417 ━━━");
  const marketingIds = [1362, 1443, 1446];
  const marketingNote = " · Reclass 6421 → 6417: chi phí marketing gửi cho Hồ Gia (Công Thành) chạy quảng cáo bán hàng, không phải lương admin (per Triết 2026-08-12)";
  const rows = await sql`SELECT id, transaction_date, description, amount, category_code FROM financial_transactions WHERE id IN ${sql(marketingIds)}`;
  for (const r of rows) {
    console.log(`  ${r.category_code} → 6417 #${r.id} ${r.transaction_date} ${Math.round(Number(r.amount)).toLocaleString('vi-VN')} — ${r.description}`);
    await sql`
      UPDATE financial_transactions
      SET category_code = '6417',
          management_group = '1b. HH sale + Marketing + Thưởng doanh số',
          note = coalesce(note, '') || ${marketingNote}::text,
          updated_at = now()
      WHERE id = ${r.id}
    `;
  }
  console.log(`  ✓ Updated ${rows.length} rows`);

  console.log("\n━━━ Bước 4: Verify ━━━");
  const empsLeft = await sql`SELECT id, name, position, alias_of_id FROM employees WHERE name ILIKE '%hồ gia%' OR name ILIKE '%công thành%'`;
  console.log("  Employees còn:");
  for (const e of empsLeft) console.log(`    #${e.id} "${e.name}" pos=${e.position} alias_of=${e.alias_of_id ?? '-'}`);
  const finLeft = await sql`SELECT id, category_code FROM financial_transactions WHERE id IN ${sql(marketingIds)}`;
  console.log("  Financial txns:");
  for (const r of finLeft) console.log(`    #${r.id} category=${r.category_code}`);

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
