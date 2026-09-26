/**
 * Điều tra: tại sao 6 recon nhập sai rate từ đầu?
 * - Import bulk hay nhập tay?
 * - Cùng batch không?
 * - Có gì đặc biệt về pattern rate sai?
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const IDS = [5430, 5431, 5492, 5505, 5633, 5647];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("\n═══ 1. Toàn bộ metadata 6 recons ═══");
  const recons = await sql`
    SELECT * FROM cost_reconciliations WHERE id = ANY(${IDS}) ORDER BY id
  `;
  for (const r of recons) {
    console.log(`\n  #${r.id} product #${r.product_id} type=${r.cost_type}`);
    for (const [k, v] of Object.entries(r)) {
      if (v !== null && v !== 0 && v !== "" && v !== false && !["id", "product_id", "cost_type"].includes(k)) {
        const val = typeof v === "string" && v.length > 60 ? v.slice(0, 57) + "..." : v;
        console.log(`     ${k}: ${JSON.stringify(val)}`);
      }
    }
  }

  console.log("\n\n═══ 2. Activity logs cho 6 recons (ai/khi/action gì) ═══");
  const logs = await sql`
    SELECT id, entity_id, action, actor_email, created_at, summary
    FROM activity_logs
    WHERE entity_type = 'cost_reconciliation' AND entity_id = ANY(${IDS})
    ORDER BY entity_id, created_at
  `;
  console.log(`  Total ${logs.length} logs`);
  logs.forEach((l: any) => console.log(`    recon#${l.entity_id} [${l.created_at?.toISOString?.()}] ${l.actor_email} ${l.action}: ${l.summary?.slice(0, 80) ?? ""}`));

  console.log("\n\n═══ 3. Activity logs quanh 08:01-08:02 ngày 07/08 (mọi entity, tìm import event) ═══");
  const surrounding = await sql`
    SELECT id, entity_type, entity_id, action, actor_email, created_at, summary
    FROM activity_logs
    WHERE created_at BETWEEN '2026-08-07 08:00:00' AND '2026-08-07 08:05:00'
    ORDER BY created_at
    LIMIT 30
  `;
  console.log(`  ${surrounding.length} logs trong window 08:00-08:05:`);
  surrounding.forEach((l: any) => console.log(`    [${l.created_at?.toISOString?.()}] ${l.actor_email} ${l.action} ${l.entity_type}#${l.entity_id}: ${l.summary?.slice(0, 60) ?? ""}`));

  console.log("\n\n═══ 4. Count recons tạo trong window 08:01-08:02 ═══");
  const [{ count: batchCount }] = await sql`
    SELECT COUNT(*)::int AS count FROM cost_reconciliations
    WHERE created_at BETWEEN '2026-08-07 08:01:00' AND '2026-08-07 08:02:59'
  `;
  console.log(`  ${batchCount} recons tạo trong window`);

  const batchRecons = await sql`
    SELECT id, product_id, cost_type, commission_rate, kpi_rate, pmg_lk_sale_rate, amount_payable_this_time, employee_name, created_at
    FROM cost_reconciliations
    WHERE created_at BETWEEN '2026-08-07 08:01:00' AND '2026-08-07 08:02:59'
    ORDER BY created_at
  `;
  console.log(`  Chi tiết batch (${batchRecons.length} rows):`);
  batchRecons.forEach((r: any) => {
    const rate = r.commission_rate ?? r.kpi_rate ?? r.pmg_lk_sale_rate;
    const bad = IDS.includes(r.id) ? " ❌" : "";
    console.log(`    #${r.id} p#${r.product_id} ${r.cost_type} rate=${rate} amt=${Number(r.amount_payable_this_time).toLocaleString("vi-VN")} (${r.employee_name})${bad}`);
  });

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
