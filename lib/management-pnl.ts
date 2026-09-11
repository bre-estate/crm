/**
 * Nạp dữ liệu từ DB rồi tính Lãi/lỗ quản trị. Toàn bộ công thức ở management-pnl-core.ts.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import {
  assemblePnl, computeCogs, computeOpex, computeRevenue, compareToReference, referenceMatchesPeriod,
  type AccrualLite, type CategoryAmount, type CostReconLite, type ManagementPnl, type Period, type PnlComparisonRow, type PnlReference,
} from "./management-pnl-core";
import { KIM_PNL_2025 } from "./reference/kim-pnl-2025";

export * from "./management-pnl-core";

export const PNL_REFERENCES: PnlReference[] = [KIM_PNL_2025];

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));

export async function loadManagementPnl(period: Period): Promise<ManagementPnl> {
  const [revRows, reconRows, accrualRows, otherAccrualRows, nkcRows, nkcAny] = await Promise.all([
    db.execute(sql`
      SELECT coalesce(sum(total_receivable_this_time),0)::float8 AS gross,
             coalesce(sum(cdt_bonus_sale),0)::float8 AS bs,
             coalesce(sum(cdt_bonus_manager),0)::float8 AS bm
      FROM revenue_reconciliations
      WHERE reconciliation_date BETWEEN ${period.start} AND ${period.end}
    `) as unknown as Row[],
    // Lấy cả đối chiếu trong kỳ và đối chiếu của căn đã trích trước (để hoàn nhập); lọc kỳ ở core.
    db.execute(sql`
      SELECT c.reconciliation_date AS date, p.unit_code, c.cost_type, coalesce(c.amount_payable_this_time,0)::float8 AS amount
      FROM cost_reconciliations c
      JOIN products p ON p.id = c.product_id
      WHERE c.reconciliation_date BETWEEN ${period.start} AND ${period.end}
    `) as unknown as Row[],
    db.execute(sql`
      SELECT accrual_date::text AS date, unit_code,
             coalesce(hh_sale,0)::float8 AS hh_sale, coalesce(cdt_bonus_sale,0)::float8 AS cdt_bonus_sale,
             coalesce(cty_bonus_ql,0)::float8 AS cty_bonus_ql, coalesce(kpi_ceo,0)::float8 AS kpi_ceo,
             coalesce(kpi_tpkd,0)::float8 AS kpi_tpkd, coalesce(bonus_admin,0)::float8 AS bonus_admin,
             coalesce(customer_support,0)::float8 AS customer_support
      FROM year_end_accruals
      WHERE accrual_date <= ${period.end}
    `) as unknown as Row[],
    db.execute(sql`
      SELECT category, coalesce(sum(amount),0)::float8 AS amount
      FROM year_end_other_accruals
      WHERE accrual_date BETWEEN ${period.start} AND ${period.end}
      GROUP BY category
    `) as unknown as Row[],
    db.execute(sql`
      SELECT category, coalesce(sum(amount),0)::float8 AS amount
      FROM accounting_journal
      WHERE entry_date BETWEEN ${period.start} AND ${period.end} AND credit_account <> '911'
      GROUP BY category
    `) as unknown as Row[],
    db.execute(sql`
      SELECT count(*)::int AS n FROM accounting_journal
      WHERE entry_date BETWEEN ${period.start} AND ${period.end}
    `) as unknown as Row[],
  ]);

  const revenue = computeRevenue({ gross: num(revRows[0]?.gross), bonusSale: num(revRows[0]?.bs), bonusMgr: num(revRows[0]?.bm) });

  const recons: CostReconLite[] = reconRows.map((r) => ({
    date: String(r.date), unitCode: String(r.unit_code), costType: String(r.cost_type), amount: num(r.amount),
  }));
  const accruals: AccrualLite[] = accrualRows.map((r) => ({
    date: String(r.date),
    unitCode: String(r.unit_code),
    amounts: {
      hh_sale: num(r.hh_sale), cdt_thuong_nvkd: num(r.cdt_bonus_sale), cty_thuong_ql: num(r.cty_bonus_ql),
      cty_thuong_ceo: num(r.kpi_ceo), cty_thuong_tpkd: num(r.kpi_tpkd), cty_thuong_admin: num(r.bonus_admin),
      ho_tro_khach: num(r.customer_support),
    },
  }));
  const cogs = computeCogs(recons, accruals, period);

  const opexRows: CategoryAmount[] = [
    ...nkcRows.map((r) => ({ category: r.category == null ? null : String(r.category), amount: num(r.amount) })),
    ...otherAccrualRows.map((r) => ({ category: String(r.category), amount: num(r.amount) })),
  ];
  const opex = computeOpex(opexRows);
  const opexAvailable = num(nkcAny[0]?.n) > 0;

  return assemblePnl(period, revenue, cogs, opex, opexAvailable);
}

export function findReference(period: Period): PnlReference | null {
  return PNL_REFERENCES.find((r) => referenceMatchesPeriod(r, period)) ?? null;
}

export function comparePnl(pnl: ManagementPnl, ref: PnlReference): PnlComparisonRow[] {
  return compareToReference(pnl, ref);
}
