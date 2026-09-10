/**
 * Sửa 3 dòng sau import-fresh 2026-09-11 (Excel "Tổng phải trả" là số đã đối chiếu):
 * - B.31.20 + B.31.12A KPI Admin (Tường Vi, ĐC 2026-02-04): amount theo cột 38 (231.559 / 240.918)
 * - B.16.11 KPI TPKD (Thành, ĐC 2026-08-29): hoàn chi dư −400.000 (không có cột thành phần)
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!);
const APPLY = process.argv.includes("--apply");
async function main() {
  const fixes = [
    { code: "AVIO_BAML_B.31.20", type: "kpi_admin", emp: "Danh Hoàng Thị Tường Vi", amount: 231559 },
    { code: "AVIO_BAML_B.31.12A", type: "kpi_admin", emp: "Danh Hoàng Thị Tường Vi", amount: 240918 },
  ];
  for (const f of fixes) {
    const rows = await sql`SELECT cr.id, cr.amount_payable_this_time::bigint amt, cr.reconciliation_date FROM cost_reconciliations cr JOIN products p ON p.id = cr.product_id WHERE p.product_code = ${f.code} AND cr.cost_type = ${f.type} AND cr.employee_name = ${f.emp}`;
    console.log(f.code, f.type, rows.map(r => `#${r.id} ${r.amt} ${r.reconciliation_date}`).join(", "), "→", f.amount);
    if (APPLY && rows.length === 1) {
      await sql`UPDATE cost_reconciliations SET amount_payable_this_time = ${f.amount}, kpi_amount = ${f.amount} WHERE id = ${rows[0].id}`;
      await sql`UPDATE payments_out SET amount = ${f.amount} WHERE cost_reconciliation_id = ${rows[0].id}`;
    }
  }
  const [p] = await sql`SELECT id FROM products WHERE product_code = 'AVIO_BAML_B.16.11'`;
  const [src] = await sql`SELECT * FROM cost_reconciliations WHERE product_id = ${p.id} AND cost_type = 'kpi_tpkd' ORDER BY reconciliation_date DESC LIMIT 1`;
  const exists = await sql`SELECT id FROM cost_reconciliations WHERE product_id = ${p.id} AND cost_type = 'kpi_tpkd' AND amount_payable_this_time = -400000`;
  console.log("B.16.11 kpi_tpkd −400.000:", exists.length ? `đã có #${exists[0].id}` : `sẽ tạo (copy rate ${src?.kpi_rate} từ #${src?.id})`);
  if (APPLY && !exists.length) {
    const [ins] = await sql`INSERT INTO cost_reconciliations (product_id, reconciliation_date, employee_name, cost_type, pmg_base_price_sale, pmg_lk_sale_rate, kpi_rate, kpi_amount, amount_payable_this_time, fiscal_year, note)
      VALUES (${p.id}, '2026-08-29', 'Hồ Nguyễn Công Thành', 'kpi_tpkd', ${src?.pmg_base_price_sale ?? 0}, ${src?.pmg_lk_sale_rate ?? 0}, ${src?.kpi_rate ?? 0}, -400000, -400000, 2026, 'Hoàn chi dư KPI TPKD (Excel 2.3 row 445, cột Tổng phải trả)') RETURNING id`;
    await sql`INSERT INTO payments_out (cost_reconciliation_id, payment_date, amount) VALUES (${ins.id}, '2026-08-29', -400000)`;
    console.log("  tạo #" + ins.id);
  }
  const [t] = await sql`SELECT count(*) n, sum(amount_payable_this_time)::bigint s FROM cost_reconciliations`;
  console.log(`cost_reconciliations: ${t.n} dòng, tổng ${Number(t.s).toLocaleString("vi-VN")} (Excel 6.296.791.163)`);
  await sql.end();
}
main();
