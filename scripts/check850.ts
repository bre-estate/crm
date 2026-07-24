import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const [p] = await c<any[]>`
    SELECT id, unit_code, project_id, sales_person, dept_name,
      pmg_base_price, pmg_rate, pmg_sale_rate,
      admin_fee, admin_fee_sale, discount_ck,
      sale_commission_rate, kpi_ceo_rate, kpi_tpkd_rate, kpi_admin_rate,
      cdt_bonus_sale, cdt_bonus_manager,
      bonus_sale, bonus_manager,
      customer_support, other_cost,
      total_revenue, total_cost,
      sale_type, note
    FROM products WHERE unit_code = 'A-07-09'
  `;
  console.log("=== căn 850 ===");
  console.log(JSON.stringify(p, null, 2));

  const proj = await c<any[]>`SELECT id, name, bre_role, partner_id FROM projects WHERE id = ${p.project_id}`;
  console.log("Project:", proj[0]);

  // Cost reconciliations
  const costRecons = await c<any[]>`
    SELECT id, cost_type, employee_name, commission_rate, kpi_rate, kpi_amount,
      pmg_progress_amount, pmg_cumulative_pct_sale, admin_fee_sale, customer_support,
      pmg_reconciled_cumulative, pmg_this_time, pmg_payable, reconciliation_date
    FROM cost_reconciliations WHERE product_id = (SELECT id FROM products WHERE unit_code = 'A-07-09' LIMIT 1) ORDER BY id
  `;
  console.log("\n=== cost_reconciliations (giá vốn ĐC) ===");
  console.log(JSON.stringify(costRecons, null, 2));

  // Revenue reconciliations
  const revRecons = await c<any[]>`
    SELECT id, reconciliation_date, revenue_this_time, cdt_bonus_sale, cdt_bonus_manager,
      total_receivable_this_time, pmg_cumulative_pct
    FROM revenue_reconciliations WHERE product_id = (SELECT id FROM products WHERE unit_code = 'A-07-09' LIMIT 1) ORDER BY id
  `;
  console.log("\n=== revenue_reconciliations (DT ĐC) ===");
  console.log(JSON.stringify(revRecons, null, 2));

  // Product adjustments
  const adjs = await c<any[]>`
    SELECT * FROM product_adjustments WHERE product_id = (SELECT id FROM products WHERE unit_code = 'A-07-09' LIMIT 1) ORDER BY id
  `;
  console.log("\n=== product_adjustments ===");
  console.log(JSON.stringify(adjs, null, 2));

  // Manual profit calc
  const p2 = p as any;
  const pmgBase = Number(p2.pmg_base_price);
  const pmgRate = Number(p2.pmg_rate);
  const pmgSaleRate = Number(p2.pmg_sale_rate) || pmgRate;
  const adminFee = Number(p2.admin_fee);
  const adminSale = Number(p2.admin_fee_sale);
  const cdtSale = Number(p2.cdt_bonus_sale);
  const cdtMgr = Number(p2.cdt_bonus_manager);
  const hhRate = Number(p2.sale_commission_rate);
  const support = Number(p2.customer_support);
  const bonusSale = Number(p2.bonus_sale);
  const bonusMgr = Number(p2.bonus_manager);
  const otherCost = Number(p2.other_cost);

  const baseNet = (pmgBase * pmgSaleRate - adminSale) / 1.1 - support;
  const hhSaleBase = baseNet * hhRate;
  const cdtBonusNet = (cdtSale + cdtMgr) / 1.1;
  const hhSaleAmt = hhSaleBase + cdtBonusNet + bonusSale;
  const totalCost = hhSaleAmt + 0 + 0 + 0 + bonusMgr + otherCost;
  const dtThuanNoibo = pmgBase * pmgRate - adminFee + cdtSale + cdtMgr;
  const dtNetVat = dtThuanNoibo / 1.1;
  const loiNhuan = dtNetVat - totalCost;

  console.log("\n=== Manual calc ===");
  console.log("baseNet:", baseNet.toLocaleString("vi-VN"));
  console.log("hhSaleBase:", hhSaleBase.toLocaleString("vi-VN"));
  console.log("cdtBonusNet:", cdtBonusNet.toLocaleString("vi-VN"));
  console.log("hhSaleAmt:", hhSaleAmt.toLocaleString("vi-VN"));
  console.log("totalCost (Section 4):", totalCost.toLocaleString("vi-VN"));
  console.log("dtThuanNoibo:", dtThuanNoibo.toLocaleString("vi-VN"));
  console.log("dtNetVat:", dtNetVat.toLocaleString("vi-VN"));
  console.log("LỢI NHUẬN:", loiNhuan.toLocaleString("vi-VN"));

  // Recent activity for product 850 — ALL
  const logs = await c<any[]>`
    SELECT id, entity_type, entity_id, action, summary, changes, created_at
    FROM activity_logs WHERE product_id = (SELECT id FROM products WHERE unit_code = 'A-07-09' LIMIT 1)
    ORDER BY created_at ASC
  `;
  console.log("\n=== recent activity ===");
  for (const l of logs) {
    console.log(`[${l.created_at.toISOString().slice(0,19)}] ${l.action} ${l.entity_type}#${l.entity_id} — ${l.summary ?? ""}`);
    if (l.changes && Object.keys(l.changes).length > 0) {
      console.log("  changes:", JSON.stringify(l.changes));
    }
  }

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
