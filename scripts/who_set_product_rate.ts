/**
 * 5 căn có recon lệch. Xem RATE HIỆN TẠI của căn có sửa lần nào không, hay
 * là mức ORIGINAL từ khi import product.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const PRODUCT_IDS = [884, 885, 891, 902, 922];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("\n═══ Product created_at + rate hiện tại ═══");
  const products = await sql`
    SELECT id, product_code, created_at, sale_commission_rate, kpi_ceo_rate, kpi_tpkd_rate, kpi_admin_rate, pmg_rate, pmg_sale_rate
    FROM products WHERE id = ANY(${PRODUCT_IDS}) ORDER BY id
  `;
  products.forEach((p: any) => {
    console.log(`\n  #${p.id} ${p.product_code}`);
    console.log(`     created_at: ${p.created_at?.toISOString?.()}`);
    console.log(`     sale_commission_rate: ${p.sale_commission_rate}`);
    console.log(`     kpi_ceo_rate: ${p.kpi_ceo_rate}, kpi_tpkd_rate: ${p.kpi_tpkd_rate}, kpi_admin_rate: ${p.kpi_admin_rate}`);
    console.log(`     pmg_rate (LK): ${p.pmg_rate}, pmg_sale_rate: ${p.pmg_sale_rate}`);
  });

  console.log("\n\n═══ TẤT CẢ activity_logs cho 5 căn (kể cả không liên quan rate) ═══");
  const logs = await sql`
    SELECT entity_id, action, actor_email, created_at, summary, changes
    FROM activity_logs
    WHERE entity_type = 'product' AND entity_id = ANY(${PRODUCT_IDS})
    ORDER BY entity_id, created_at
  `;
  console.log(`  Total ${logs.length} logs`);
  logs.forEach((l: any) => {
    const keys = l.changes && typeof l.changes === "object" ? Object.keys(l.changes).join(", ") : "";
    console.log(`    p#${l.entity_id} [${l.created_at?.toISOString?.()}] ${l.actor_email ?? "?"} ${l.action}: ${keys}`);
  });

  console.log("\n\n═══ product_adjustments cho 5 căn (nếu có bảng history riêng) ═══");
  const adj = await sql`
    SELECT product_id, effective_date, pmg_rate, note, created_at
    FROM product_adjustments
    WHERE product_id = ANY(${PRODUCT_IDS})
    ORDER BY product_id, effective_date
  `;
  console.log(`  ${adj.length} adjustment rows`);
  adj.forEach((a: any) => console.log(`    p#${a.product_id} eff=${a.effective_date} pmg_rate=${a.pmg_rate} note="${a.note}" created=${a.created_at?.toISOString?.()}`));

  console.log("\n\n═══ pmg_rate_history text của 5 căn (nếu có) ═══");
  const hist = await sql`
    SELECT id, pmg_rate_history
    FROM products
    WHERE id = ANY(${PRODUCT_IDS}) AND pmg_rate_history IS NOT NULL AND pmg_rate_history != ''
  `;
  hist.forEach((h: any) => console.log(`  #${h.id}: ${h.pmg_rate_history}`));

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
