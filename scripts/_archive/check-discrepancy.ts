/**
 * So sánh amount_payable_this_time hiện tại (từ Excel gõ tay) với công thức chuẩn.
 * Log recon nào lệch để admin review.
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import { computeLuyKe, type ProductConfig, type CostType } from "../lib/costCalc";
dotenv.config({ path: ".env.local" });

const c = postgres(process.env.DATABASE_URL!, { prepare: false });
const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

async function main() {
  const recons = await c`
    SELECT
      cr.id, cr.reconciliation_date, cr.employee_name, cr.cost_type,
      cr.amount_payable_this_time::float AS amt,
      cr.payment_progress_pct::float AS n,
      p.id AS pid, p.unit_code AS unit,
      p.pmg_base_price::float AS l,
      p.pmg_sale_rate::float AS m,
      p.admin_fee_sale::float AS q,
      p.customer_support::float AS r,
      p.sale_commission_rate::float AS commRate,
      p.kpi_ceo_rate::float AS kpiCeo,
      p.kpi_tpkd_rate::float AS kpiTpkd,
      p.kpi_admin_rate::float AS kpiAdm,
      p.bonus_sale::float AS bs,
      p.bonus_manager::float AS bm,
      p.cdt_bonus_sale::float AS cbs,
      p.cdt_bonus_manager::float AS cbm
    FROM cost_reconciliations cr
    JOIN products p ON p.id = cr.product_id
    ORDER BY cr.id
  `;

  // Group by product+costType to compute delta (this-time = luy_ke_new - paid_before)
  type Row = (typeof recons)[number];
  const groupBy = new Map<string, Row[]>();
  for (const r of recons) {
    const key = `${r.pid}|${r.cost_type}`;
    if (!groupBy.has(key)) groupBy.set(key, [] as Row[]);
    groupBy.get(key)!.push(r);
  }

  type Mismatch = {
    id: number; unit: string; costType: string; emp: string; date: string;
    excelAmt: number; formulaAmt: number; diff: number; N: number;
  };
  const mismatches: Mismatch[] = [];
  let checked = 0;
  let matchExact = 0;
  let matchClose = 0; // within 1%

  for (const [key, group] of groupBy) {
    group.sort((a, b) => (a.reconciliation_date ?? "").localeCompare(b.reconciliation_date ?? ""));
    let paidBefore = 0;
    for (const r of group) {
      const cfg: ProductConfig = {
        pmgBasePrice: Number(r.l ?? 0),
        pmgSaleRate: Number(r.m ?? 0),
        adminFeeSale: Number(r.q ?? 0),
        customerSupport: Number(r.r ?? 0),
        saleCommissionRate: Number(r.commrate ?? 0),
        kpiCeoRate: Number(r.kpiceo ?? 0),
        kpiTpkdRate: Number(r.kpitpkd ?? 0),
        kpiAdminRate: Number(r.kpiadm ?? 0),
        bonusSale: Number(r.bs ?? 0),
        bonusManager: Number(r.bm ?? 0),
        cdtBonusSale: Number(r.cbs ?? 0),
        cdtBonusManager: Number(r.cbm ?? 0),
      };
      const luyKeNew = computeLuyKe(cfg, r.cost_type as CostType, Number(r.n ?? 0));
      // For flat types: amount = config value directly. For formula types: amount = luy_ke_new - paid_before
      const flatTypes = new Set(["customer_support", "bonus_sale", "bonus_manager", "cdt_bonus_sale", "cdt_bonus_manager", "kpi_admin"]);
      const formulaAmt = flatTypes.has(r.cost_type)
        ? luyKeNew // flat = full config value (paid once, no delta)
        : Math.max(0, luyKeNew - paidBefore);
      const excelAmt = Number(r.amt ?? 0);
      const diff = excelAmt - formulaAmt;
      checked++;
      if (Math.abs(diff) < 1000) matchExact++;
      else if (excelAmt > 0 && Math.abs(diff / excelAmt) < 0.01) matchClose++;
      else if (Math.abs(diff) >= 1000) {
        mismatches.push({
          id: r.id,
          unit: r.unit,
          costType: r.cost_type,
          emp: r.employee_name,
          date: r.reconciliation_date,
          excelAmt,
          formulaAmt,
          diff,
          N: Number(r.n ?? 0),
        });
      }
      paidBefore += excelAmt;
    }
  }

  console.log(`\n=== Discrepancy Check ===`);
  console.log(`Total recons checked: ${checked}`);
  console.log(`  Match exact (<1k): ${matchExact}`);
  console.log(`  Match close (<1%): ${matchClose}`);
  console.log(`  Mismatch: ${mismatches.length}`);

  // Sort by |diff| desc
  mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // Group mismatches by cost type
  const byType = new Map<string, Mismatch[]>();
  for (const m of mismatches) {
    if (!byType.has(m.costType)) byType.set(m.costType, []);
    byType.get(m.costType)!.push(m);
  }
  console.log(`\nMismatch breakdown by cost type:`);
  for (const [t, list] of byType) {
    const totalDiff = list.reduce((s, m) => s + m.diff, 0);
    console.log(`  ${t}: ${list.length} recons · tổng chênh ${fmt(totalDiff)}`);
  }

  // Top 20 mismatches
  console.log(`\nTop 20 mismatches (biggest |diff|):`);
  for (const m of mismatches.slice(0, 20)) {
    const sign = m.diff > 0 ? "+" : "";
    console.log(`  #${m.id} ${m.unit} · ${m.costType} · ${m.emp} · ${m.date} · N=${(m.N*100).toFixed(0)}% · Excel ${fmt(m.excelAmt)} vs Formula ${fmt(m.formulaAmt)} · chênh ${sign}${fmt(m.diff)}`);
  }

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
