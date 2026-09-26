/**
 * Verify state data đối chiếu chi phí sau các fix gần đây:
 * 1. Không còn recon nào pmg_lk_sale_rate bị chia dư (< 0.1%).
 * 2. Không còn recon %HH sale lệch với căn.
 * 3. Không còn recon KPI (CEO/TPKD/Admin) lệch với căn.
 * 4. Không còn recon %PMG_LK_sale vượt trần căn.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  // 1. pmg_lk_sale_rate bị chia dư
  const tiny = await sql`
    SELECT cr.id, cr.pmg_lk_sale_rate, p.product_code
    FROM cost_reconciliations cr
    JOIN products p ON p.id = cr.product_id
    WHERE cr.pmg_lk_sale_rate IS NOT NULL AND cr.pmg_lk_sale_rate > 0 AND cr.pmg_lk_sale_rate < 0.001
  `;
  console.log(`\n[1] Recons pmg_lk_sale_rate bị chia dư (< 0.1%): ${tiny.length}`);
  tiny.forEach((r: any) => console.log(`    #${r.id} ${r.product_code}: ${r.pmg_lk_sale_rate}`));

  // 2. %HH sale lệch với căn
  const mismatch = await sql`
    SELECT cr.id, cr.commission_rate AS recon_rate, p.sale_commission_rate AS product_rate, p.product_code, cr.employee_name, cr.created_at
    FROM cost_reconciliations cr
    JOIN products p ON p.id = cr.product_id
    WHERE cr.cost_type = 'sale_commission'
      AND cr.commission_rate IS NOT NULL AND cr.commission_rate > 0
      AND p.sale_commission_rate IS NOT NULL AND p.sale_commission_rate > 0
      AND ABS(cr.commission_rate - p.sale_commission_rate) > 0.0001
    ORDER BY cr.id DESC
  `;
  console.log(`\n[2] Recons %HH sale lệch với căn: ${mismatch.length}`);
  mismatch.forEach((r: any) =>
    console.log(`    #${r.id} ${r.product_code} (${r.employee_name}): recon=${(Number(r.recon_rate) * 100).toFixed(2)}% vs căn=${(Number(r.product_rate) * 100).toFixed(2)}%`)
  );

  // 3. KPI CEO/TPKD/Admin lệch
  const kpiCases = [
    { type: "kpi_ceo", col: "kpi_ceo_rate", label: "KPI CEO" },
    { type: "kpi_tpkd", col: "kpi_tpkd_rate", label: "KPI TPKD" },
    { type: "kpi_admin", col: "kpi_admin_rate", label: "KPI Admin" },
  ] as const;
  let kpiTotal = 0;
  for (const c of kpiCases) {
    const rows = await sql`
      SELECT cr.id, cr.kpi_rate AS recon_rate, p.${sql(c.col)} AS product_rate, p.product_code, cr.employee_name
      FROM cost_reconciliations cr
      JOIN products p ON p.id = cr.product_id
      WHERE cr.cost_type = ${c.type}
        AND cr.kpi_rate IS NOT NULL AND cr.kpi_rate > 0
        AND p.${sql(c.col)} IS NOT NULL AND p.${sql(c.col)} > 0
        AND ABS(cr.kpi_rate - p.${sql(c.col)}) > 0.0001
      ORDER BY cr.id DESC LIMIT 10
    `;
    kpiTotal += rows.length;
    if (rows.length > 0) {
      console.log(`\n    ${c.label}: ${rows.length}`);
      rows.forEach((r: any) =>
        console.log(`      #${r.id} ${r.product_code} (${r.employee_name}): recon=${(Number(r.recon_rate) * 100).toFixed(2)}% vs căn=${(Number(r.product_rate) * 100).toFixed(2)}%`)
      );
    }
  }
  console.log(`\n[3] Recons KPI lệch với căn: ${kpiTotal}`);

  // 4. pmg_lk_sale_rate vượt trần pmg_sale_rate của căn
  const pmgOver = await sql`
    SELECT cr.id, cr.pmg_lk_sale_rate AS recon_rate, p.pmg_sale_rate AS product_rate, p.product_code
    FROM cost_reconciliations cr
    JOIN products p ON p.id = cr.product_id
    WHERE cr.pmg_lk_sale_rate IS NOT NULL AND cr.pmg_lk_sale_rate > 0.001
      AND p.pmg_sale_rate IS NOT NULL AND p.pmg_sale_rate > 0
      AND cr.pmg_lk_sale_rate > p.pmg_sale_rate + 0.0001
    ORDER BY cr.id DESC LIMIT 20
  `;
  console.log(`\n[4] Recons %PMG_LK_sale vượt trần căn: ${pmgOver.length}`);
  pmgOver.forEach((r: any) =>
    console.log(`    #${r.id} ${r.product_code}: recon=${(Number(r.recon_rate) * 100).toFixed(2)}% vs căn=${(Number(r.product_rate) * 100).toFixed(2)}%`)
  );

  await sql.end();
  console.log("\n✅ Verify xong.\n");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
