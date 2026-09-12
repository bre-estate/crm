/**
 * Nạp dữ liệu thô từ DB cho Lãi/lỗ dồn tích. Toàn bộ công thức ở management-pnl-core.ts.
 * Nạp một lần cho cả kỳ, rồi core cắt theo tháng.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import {
  buildManagementPnl, buildManagementMonthly, compareToReference, referenceMatchesPeriod,
  type AccrualLite, type CostReconLite, type DatedCategoryAmount, type ManagementPnl, type ManagementRaw, type Period, type PnlComparisonRow, type PnlReference, type RevenueRow,
} from "./management-pnl-core";
import { KIM_PNL_2025 } from "./reference/kim-pnl-2025";

export * from "./management-pnl-core";

export const PNL_REFERENCES: PnlReference[] = [KIM_PNL_2025];

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));

export async function loadManagementRaw(period: Period): Promise<ManagementRaw> {
  const [revRows, reconRows, accrualRows, otherAccrualRows, nkcRows] = await Promise.all([
    db.execute(sql`
      SELECT reconciliation_date AS date, coalesce(total_receivable_this_time,0)::float8 AS gross,
             coalesce(cdt_bonus_sale,0)::float8 AS bs, coalesce(cdt_bonus_manager,0)::float8 AS bm
      FROM revenue_reconciliations
      WHERE reconciliation_date BETWEEN ${period.start} AND ${period.end}
    `) as unknown as Row[],
    // Lấy cả đối chiếu trước kỳ để biết khoản trích trước đã hoàn nhập bao nhiêu.
    db.execute(sql`
      SELECT c.reconciliation_date AS date, p.unit_code, c.cost_type, coalesce(c.amount_payable_this_time,0)::float8 AS amount
      FROM cost_reconciliations c
      JOIN products p ON p.id = c.product_id
      WHERE c.reconciliation_date <= ${period.end}
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
      SELECT accrual_date::text AS date, category, coalesce(amount,0)::float8 AS amount
      FROM year_end_other_accruals
      WHERE accrual_date BETWEEN ${period.start} AND ${period.end}
    `) as unknown as Row[],
    db.execute(sql`
      SELECT entry_date AS date, category, coalesce(amount,0)::float8 AS amount
      FROM accounting_journal
      WHERE entry_date BETWEEN ${period.start} AND ${period.end} AND credit_account <> '911'
    `) as unknown as Row[],
  ]);

  const revenue: RevenueRow[] = revRows.map((r) => ({ date: String(r.date), gross: num(r.gross), bonusSale: num(r.bs), bonusMgr: num(r.bm) }));
  const recons: CostReconLite[] = reconRows.map((r) => ({ date: String(r.date), unitCode: String(r.unit_code), costType: String(r.cost_type), amount: num(r.amount) }));
  const accruals: AccrualLite[] = accrualRows.map((r) => ({
    date: String(r.date), unitCode: String(r.unit_code),
    amounts: {
      hh_sale: num(r.hh_sale), cdt_thuong_nvkd: num(r.cdt_bonus_sale), cty_thuong_ql: num(r.cty_bonus_ql),
      cty_thuong_ceo: num(r.kpi_ceo), cty_thuong_tpkd: num(r.kpi_tpkd), cty_thuong_admin: num(r.bonus_admin), ho_tro_khach: num(r.customer_support),
    },
  }));
  const dated = (rows: Row[]): DatedCategoryAmount[] => rows.map((r) => ({ date: String(r.date), category: r.category == null ? null : String(r.category), amount: num(r.amount) }));
  return { revenue, recons, accruals, nkc: dated(nkcRows), otherAccruals: dated(otherAccrualRows) };
}

export async function loadManagementPnl(period: Period): Promise<{ pnl: ManagementPnl; monthly: ReturnType<typeof buildManagementMonthly> }> {
  const raw = await loadManagementRaw(period);
  return { pnl: buildManagementPnl(raw, period), monthly: buildManagementMonthly(raw, period) };
}

export function findReference(period: Period): PnlReference | null {
  return PNL_REFERENCES.find((r) => referenceMatchesPeriod(r, period)) ?? null;
}

export function comparePnl(pnl: ManagementPnl, ref: PnlReference): PnlComparisonRow[] {
  return compareToReference(pnl, ref);
}
