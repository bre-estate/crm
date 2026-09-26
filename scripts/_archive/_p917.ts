import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: any) => Math.round(Number(n)).toLocaleString("vi-VN");
async function main() {
  const [p] = await sql`SELECT unit_code, product_code, total_revenue FROM products WHERE id=917`;
  console.log(`Product 917: ${p.unit_code} · ${p.product_code} · totalRev=${fmt(p.total_revenue)}`);

  console.log("\n═══ payments_in cho product 917 ═══");
  const pi = await sql`
    SELECT pi.id, pi.payment_date, pi.amount, pi.note, rr.id as rr_id, rr.reconciliation_date, rr.total_receivable_this_time
    FROM payments_in pi
    LEFT JOIN revenue_reconciliations rr ON rr.id = pi.revenue_reconciliation_id
    WHERE rr.product_id = 917
    ORDER BY pi.payment_date`;
  let sumIn = 0;
  for (const r of pi) { console.log(`  ${r.payment_date} · ${fmt(r.amount).padStart(12)} · rr#${r.rr_id} · ${r.note?.slice(0,50) || ''}`); sumIn += Number(r.amount); }
  console.log(`  → sum payments_in: ${fmt(sumIn)}`);

  console.log("\n═══ revenue_reconciliations cho product 917 ═══");
  const rr = await sql`SELECT id, reconciliation_date, total_receivable_this_time, note
    FROM revenue_reconciliations WHERE product_id=917 ORDER BY reconciliation_date`;
  for (const r of rr) console.log(`  ${r.reconciliation_date} · rr#${r.id} · rec_this_time=${fmt(r.total_receivable_this_time)}`);
  await sql.end();
}
main();
