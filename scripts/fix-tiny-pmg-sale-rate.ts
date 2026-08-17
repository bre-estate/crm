/**
 * Fix 7 cost_reconciliations có pmg_lk_sale_rate < 0.1% (chia dư 100/10000 khi lưu).
 * Đồng bộ về pmg_sale_rate hiện tại của căn.
 * amount_payable_this_time không đổi (được nhập tay/tính riêng, không phụ thuộc field này).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT cr.id, cr.product_id, cr.pmg_lk_sale_rate AS old_rate, p.pmg_sale_rate AS correct_rate, p.product_code
    FROM cost_reconciliations cr
    JOIN products p ON p.id = cr.product_id
    WHERE cr.pmg_lk_sale_rate IS NOT NULL AND cr.pmg_lk_sale_rate > 0 AND cr.pmg_lk_sale_rate < 0.001
    ORDER BY cr.id
  `;
  console.log(`Sắp fix ${rows.length} recons:\n`);
  for (const r of rows) {
    const oldR = Number(r.old_rate);
    const newR = Number(r.correct_rate);
    if (newR === 0) {
      console.log(`  ⚠️  #${r.id} ${r.product_code}: căn không có pmg_sale_rate — skip`);
      continue;
    }
    await sql`UPDATE cost_reconciliations SET pmg_lk_sale_rate = ${newR} WHERE id = ${r.id}`;
    console.log(`  ✓ #${r.id} ${r.product_code}: ${oldR} → ${newR} (${(newR*100).toFixed(2)}%)`);
  }
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
