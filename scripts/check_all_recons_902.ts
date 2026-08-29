import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("\n═══ TẤT CẢ recon của căn #902 (EMGV_DT25_A1-12-17), sort theo ngày ═══");
  const rows = await sql`
    SELECT id, reconciliation_date, cost_type, employee_name, commission_rate, kpi_rate, pmg_lk_sale_rate,
           amount_payable_this_time, created_at
    FROM cost_reconciliations
    WHERE product_id = 902
    ORDER BY reconciliation_date, id
  `;
  console.log(`  Total ${rows.length} recons\n`);
  rows.forEach((r: any) => {
    const rate = r.commission_rate ?? r.kpi_rate ?? r.pmg_lk_sale_rate;
    const ratePct = rate ? `${(Number(rate) * 100).toFixed(2)}%` : "-";
    console.log(`  #${r.id} ${r.reconciliation_date} ${r.cost_type.padEnd(20)} ${(r.employee_name ?? "").padEnd(25)} rate=${ratePct.padEnd(8)} amt=${Number(r.amount_payable_this_time).toLocaleString("vi-VN")}`);
  });

  console.log("\n\n═══ Chỉ HH sale (sale_commission) của căn #902 ═══");
  const hhRows = rows.filter((r: any) => r.cost_type === "sale_commission");
  hhRows.forEach((r: any) => {
    console.log(`  #${r.id} ${r.reconciliation_date} rate=${(Number(r.commission_rate) * 100).toFixed(2)}% amt=${Number(r.amount_payable_this_time).toLocaleString("vi-VN")}`);
  });

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
