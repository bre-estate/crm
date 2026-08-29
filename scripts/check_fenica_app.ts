import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("═══ Products Fenica ═══");
  const prods = await sql`
    SELECT p.id, p.product_code, p.unit_code, p.pmg_base_price, p.pmg_rate, p.pmg_sale_rate,
           p.sale_commission_rate, p.admin_fee, p.cdt_bonus_sale, p.deposit_date,
           p.customer_name, pr.name AS project_name
    FROM products p
    JOIN projects pr ON pr.id = p.project_id
    WHERE pr.name ILIKE '%fenica%'
    ORDER BY p.unit_code
  `;
  prods.forEach((r: any) => {
    console.log(`  #${r.id} ${r.product_code}: giá ${Number(r.pmg_base_price).toLocaleString("vi-VN")}, %PMG ${(Number(r.pmg_rate)*100).toFixed(2)}%, %PMG_sale ${(Number(r.pmg_sale_rate)*100).toFixed(2)}%, %HH ${(Number(r.sale_commission_rate)*100).toFixed(2)}%, thưởng nóng ${Number(r.cdt_bonus_sale).toLocaleString("vi-VN")}, cọc ${r.deposit_date}`);
  });

  console.log(`\n═══ Revenue reconciliations Fenica (mọi thời điểm) ═══`);
  const revs = await sql`
    SELECT rr.id, rr.product_id, p.unit_code, rr.reconciliation_date, rr.minutes_number,
           rr.phase_pct_this_time, rr.pmg_cumulative_pct, rr.pmg_base_price,
           rr.revenue_this_time, rr.cdt_bonus_sale, rr.cdt_bonus_manager,
           rr.total_receivable_this_time, rr.admin_fee_vat, rr.invoice_id,
           i.invoice_number
    FROM revenue_reconciliations rr
    JOIN products p ON p.id = rr.product_id
    JOIN projects pr ON pr.id = p.project_id
    LEFT JOIN invoices i ON i.id = rr.invoice_id
    WHERE pr.name ILIKE '%fenica%'
    ORDER BY p.unit_code, rr.reconciliation_date
  `;
  console.log(`  Total ${revs.length} recons\n`);
  const byUnit = new Map<string, any[]>();
  revs.forEach((r: any) => {
    const key = r.unit_code;
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key)!.push(r);
  });
  for (const [unit, rows] of byUnit) {
    console.log(`  ▸ ${unit} (${rows.length} recon):`);
    rows.forEach((r: any) =>
      console.log(`    #${r.id} ${r.reconciliation_date} HĐ=${r.minutes_number ?? "?"} inv=${r.invoice_number ?? "-"} rev=${Number(r.revenue_this_time).toLocaleString("vi-VN")} bonusSale=${Number(r.cdt_bonus_sale).toLocaleString("vi-VN")} bonusMgr=${Number(r.cdt_bonus_manager).toLocaleString("vi-VN")} total=${Number(r.total_receivable_this_time).toLocaleString("vi-VN")} pmgCum=${(Number(r.pmg_cumulative_pct)*100).toFixed(2)}%`),
    );
  }

  const totalReceivable = revs.reduce((s: number, r: any) => s + Number(r.total_receivable_this_time), 0);
  console.log(`\n  ▸ TỔNG total_receivable_this_time: ${totalReceivable.toLocaleString("vi-VN")} VND`);

  console.log(`\n═══ Payments in cho Fenica ═══`);
  const pays = await sql`
    SELECT pi.id, pi.reconciliation_id, pi.payment_date, pi.amount, pi.note,
           p.unit_code
    FROM payments_in pi
    JOIN revenue_reconciliations rr ON rr.id = pi.reconciliation_id
    JOIN products p ON p.id = rr.product_id
    JOIN projects pr ON pr.id = p.project_id
    WHERE pr.name ILIKE '%fenica%'
    ORDER BY pi.payment_date DESC
  `;
  pays.forEach((r: any) =>
    console.log(`  ${r.unit_code} ${r.payment_date} ${Number(r.amount).toLocaleString("vi-VN")} note=${r.note ?? ""}`),
  );

  const totalPaid = pays.reduce((s: number, r: any) => s + Number(r.amount), 0);
  console.log(`\n  ▸ TỔNG payments_in: ${totalPaid.toLocaleString("vi-VN")} VND`);

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
