import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  const [p] = await sql`SELECT id, product_code FROM products WHERE product_code = 'ATSR_DXMD_A-05-07'`;
  console.log(`Product #${p.id} ${p.product_code}\n`);

  console.log("═══ Revenue recons ═══");
  const revs = await sql`
    SELECT id, reconciliation_date, minutes_number, revenue_this_time, cdt_bonus_sale,
           cdt_bonus_manager, total_receivable_this_time, invoice_id, note
    FROM revenue_reconciliations
    WHERE product_id = ${p.id}
    ORDER BY reconciliation_date NULLS LAST, id
  `;
  revs.forEach((r: any) => {
    console.log(`  #${r.id} ${r.reconciliation_date} BB=${r.minutes_number ?? "?"} inv=${r.invoice_id ?? "-"} rev=${Number(r.revenue_this_time).toLocaleString("vi-VN")} bonusSale=${Number(r.cdt_bonus_sale).toLocaleString("vi-VN")} bonusMgr=${Number(r.cdt_bonus_manager).toLocaleString("vi-VN")} total=${Number(r.total_receivable_this_time).toLocaleString("vi-VN")}`);
  });
  const totalRcv = revs.reduce((s: number, r: any) => s + Number(r.total_receivable_this_time), 0);
  console.log(`\n  TỔNG total_receivable = ${totalRcv.toLocaleString("vi-VN")}`);

  console.log("\n═══ Activity logs cho căn ═══");
  const logs = await sql`
    SELECT id, entity_type, entity_id, action, actor_email, created_at, summary
    FROM activity_logs
    WHERE (entity_type='product' AND entity_id=${p.id})
       OR (entity_type='revenue_reconciliation' AND entity_id IN (${sql(revs.map((r: any) => r.id))}))
       OR (entity_type='product_adjustment' AND product_id=${p.id})
    ORDER BY created_at
  `;
  logs.forEach((l: any) => {
    const t = l.created_at?.toISOString?.() ?? l.created_at;
    console.log(`  [${t}] ${l.actor_email ?? "?"} ${l.action} ${l.entity_type}#${l.entity_id}: ${l.summary?.slice(0, 100) ?? ""}`);
  });

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
