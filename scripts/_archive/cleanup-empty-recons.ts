/**
 * Xoá revenue_reconciliations rỗng (date=NULL, revenue=0, receivable=0,
 * không có payments_in). Được tạo do form submit double / bug.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const orphan = await sql`
    SELECT r.id, r.product_id, p.product_code
    FROM revenue_reconciliations r
    JOIN products p ON p.id = r.product_id
    WHERE r.reconciliation_date IS NULL
      AND COALESCE(r.revenue_this_time, 0) = 0
      AND COALESCE(r.total_receivable_this_time, 0) = 0
      AND COALESCE(r.cdt_bonus_sale, 0) = 0
      AND COALESCE(r.cdt_bonus_manager, 0) = 0
      AND NOT EXISTS (SELECT 1 FROM payments_in pi WHERE pi.reconciliation_id = r.id)
    ORDER BY r.id
  `;
  console.log(`Sắp xoá ${orphan.length} recon rỗng:`);
  for (const r of orphan) console.log(`  #${r.id} ${r.product_code}`);
  if (orphan.length === 0) {
    console.log("Không có gì để xoá.");
    await sql.end();
    return;
  }
  const ids = orphan.map((r) => r.id);
  await sql`DELETE FROM revenue_reconciliations WHERE id IN ${sql(ids)}`;
  console.log(`\n✅ Đã xoá ${orphan.length} recon.`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
