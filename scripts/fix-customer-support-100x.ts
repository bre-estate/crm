/**
 * Fix 6 căn có customer_support bị nhân 100 lần (bug import: Excel value
 * '37414177.31' bị strip dấu '.' → concat digits → '3741417731').
 *
 * Run: npx tsx scripts/fix-customer-support-100x.ts            # dry-run
 *      npx tsx scripts/fix-customer-support-100x.ts --apply    # execute
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  // Tìm căn có customer_support > 10% pmg_base_price — bất thường.
  const bad = await c<{ id: number; code: string; pmg_base: string; support: string }[]>`
    SELECT id, product_code AS code, pmg_base_price::bigint AS pmg_base, customer_support::bigint AS support
    FROM products
    WHERE customer_support > pmg_base_price * 0.1 AND pmg_base_price > 0
    ORDER BY customer_support DESC
  `;

  console.log(`Tìm ${bad.length} căn có customer_support > 10% pmg_base:\n`);

  const toFix: { id: number; oldValue: number; newValue: number }[] = [];
  for (const r of bad) {
    const support = Number(r.support);
    const pmgBase = Number(r.pmg_base);
    const supportDiv100 = Math.round(support / 100);
    const ratio = support / pmgBase;
    const newRatio = supportDiv100 / pmgBase;

    // Chỉ fix nếu chia 100 ra số hợp lý (< 10% pmg_base) — tránh false positive
    const shouldFix = newRatio < 0.1;
    const flag = shouldFix ? "✅ FIX" : "⚠️ SKIP";
    console.log(
      `${flag} #${r.id} ${r.code}: ${support.toLocaleString("vi-VN")} → ${supportDiv100.toLocaleString("vi-VN")} (${(ratio * 100).toFixed(1)}% → ${(newRatio * 100).toFixed(2)}%)`,
    );
    if (shouldFix) toFix.push({ id: r.id, oldValue: support, newValue: supportDiv100 });
  }

  if (!APPLY) {
    console.log(`\n(dry-run — ${toFix.length} căn sẽ fix. Chạy với --apply)`);
    await c.end();
    return;
  }

  console.log(`\nApplying fix for ${toFix.length} căn...`);
  for (const f of toFix) {
    await c`UPDATE products SET customer_support = ${f.newValue} WHERE id = ${f.id}`;
    // Log activity
    await c`
      INSERT INTO activity_logs (entity_type, entity_id, product_id, action, changes, summary, actor_email)
      VALUES ('product', ${f.id}, ${f.id}, 'update',
        ${JSON.stringify({ customerSupport: { from: f.oldValue, to: f.newValue } })}::jsonb,
        ${`Fix customer_support ×100 bug: ${f.oldValue.toLocaleString("vi-VN")} → ${f.newValue.toLocaleString("vi-VN")}`},
        'script:fix-customer-support-100x')
    `;
    console.log(`  ✅ Updated #${f.id}`);
  }

  // Recompute total_cost cho các căn đã fix
  console.log("\nRecomputing total_cost...");
  for (const f of toFix) {
    // Query product config
    const [p] = await c<any[]>`SELECT * FROM products WHERE id = ${f.id}`;
    if (!p) continue;
    const pmgBase = Number(p.pmg_base_price ?? 0);
    const pmgSaleRate = Number(p.pmg_sale_rate ?? 0) || Number(p.pmg_rate ?? 0);
    const adminSale = Number(p.admin_fee_sale ?? 0);
    const support = Number(p.customer_support ?? 0);
    const baseNet = (pmgBase * pmgSaleRate - adminSale) / 1.1 - support;
    const hhRate = Number(p.sale_commission_rate ?? 0);
    const kpiCeo = Number(p.kpi_ceo_rate ?? 0);
    const kpiTpkd = Number(p.kpi_tpkd_rate ?? 0);
    const kpiAdmin = Number(p.kpi_admin_rate ?? 0);
    const cdtSale = Number(p.cdt_bonus_sale ?? 0);
    const cdtMgr = Number(p.cdt_bonus_manager ?? 0);
    const bonusSale = Number(p.bonus_sale ?? 0);
    const bonusMgr = Number(p.bonus_manager ?? 0);
    const otherCost = Number(p.other_cost ?? 0);
    const totalCost = Math.round(
      baseNet * (hhRate + kpiCeo + kpiTpkd + kpiAdmin) + (cdtSale + cdtMgr) / 1.1 + bonusSale + bonusMgr + otherCost,
    );
    await c`UPDATE products SET total_cost = ${totalCost} WHERE id = ${f.id}`;
    console.log(`  ✅ #${f.id} total_cost → ${totalCost.toLocaleString("vi-VN")}`);
  }

  console.log("\n✅ Done.");
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
