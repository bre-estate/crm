import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("═══ Products có unit_code chứa A2-06-17 ═══");
  const prods = await sql`
    SELECT id, product_code, unit_code, cdt_bonus_sale, cdt_bonus_manager
    FROM products WHERE unit_code LIKE '%A2-06-17%' OR product_code LIKE '%A2-06-17%'
  `;
  prods.forEach((p: any) => console.log(`  #${p.id} ${p.product_code} cdt_bonus_sale=${p.cdt_bonus_sale} cdt_bonus_mgr=${p.cdt_bonus_manager}`));
  if (prods.length === 0) return;

  const pid = prods[0].id;

  console.log(`\n═══ Revenue reconciliations cho #${pid} ═══`);
  const revs = await sql`
    SELECT id, reconciliation_date, minutes_number, revenue_this_time, revenue_receivable,
           cdt_bonus_sale, cdt_bonus_manager, invoice_id
    FROM revenue_reconciliations WHERE product_id = ${pid}
    ORDER BY reconciliation_date, id
  `;
  revs.forEach((r: any) => {
    console.log(`  #${r.id} ${r.reconciliation_date} HĐ=${r.minutes_number} inv=${r.invoice_id} rev=${r.revenue_this_time} rcv=${r.revenue_receivable} bonusSale=${r.cdt_bonus_sale} bonusMgr=${r.cdt_bonus_manager}`);
  });

  console.log(`\n═══ Cost reconciliations cho #${pid} ═══`);
  const costs = await sql`
    SELECT id, reconciliation_date, cost_type, employee_name, amount_payable_this_time
    FROM cost_reconciliations WHERE product_id = ${pid}
    ORDER BY reconciliation_date, id
  `;
  costs.forEach((r: any) => console.log(`  #${r.id} ${r.reconciliation_date} ${r.cost_type} (${r.employee_name}) amt=${r.amount_payable_this_time}`));

  console.log(`\n═══ Payments cho căn #${pid} ═══`);
  const pays = await sql`
    SELECT id, revenue_reconciliation_id, payment_date, amount, category
    FROM payments_in
    WHERE revenue_reconciliation_id IN (SELECT id FROM revenue_reconciliations WHERE product_id = ${pid})
    ORDER BY payment_date
  `;
  pays.forEach((r: any) => console.log(`  #${r.id} rec=${r.revenue_reconciliation_id} ${r.payment_date} ${r.category ?? "-"} amt=${r.amount}`));

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
