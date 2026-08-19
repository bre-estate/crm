/**
 * Detect "chi dư thưởng nóng" per (căn × NV):
 * - BRE đã trả NV thưởng nóng (payments_out cho cost_reconciliation type=cdt_bonus_*)
 * - CĐT hoàn thưởng nóng (revenue_reconciliations.cdt_bonus_* âm) → revenue net < paid
 * - Chênh = NV nợ công ty, sẽ khấu trừ vào HH sale đợt sau.
 *
 * Không cover sale_commission (rate/progress phức tạp — sẽ có phase 2 nếu cần).
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type OverpaidRow = {
  productId: number;
  productCode: string;
  unitCode: string;
  employeeName: string;
  costType: "cdt_bonus_sale" | "cdt_bonus_manager";
  paid: number;
  revenueTotal: number;
  overpaid: number;
};

const CENT_THRESHOLD = 1000; // <1k VND coi như noise (rounding)

/**
 * Nếu productId → chỉ căn đó. Nếu bỏ trống → mọi căn.
 */
export async function getEmployeeOverpaid(productId?: number): Promise<OverpaidRow[]> {
  const rows = (await db.execute(sql`
    WITH emp_paid AS (
      SELECT
        c.product_id,
        c.employee_name,
        c.cost_type,
        COALESCE(SUM(po.amount), 0)::float8 AS paid
      FROM cost_reconciliations c
      LEFT JOIN payments_out po ON po.cost_reconciliation_id = c.id
      WHERE c.cost_type IN ('cdt_bonus_sale', 'cdt_bonus_manager')
        ${productId ? sql`AND c.product_id = ${productId}` : sql``}
      GROUP BY c.product_id, c.employee_name, c.cost_type
    ),
    product_paid AS (
      SELECT product_id, cost_type, SUM(paid)::float8 AS total_paid
      FROM emp_paid
      GROUP BY product_id, cost_type
    ),
    product_rev AS (
      SELECT
        product_id,
        COALESCE(SUM(cdt_bonus_sale), 0)::float8 AS bonus_sale,
        COALESCE(SUM(cdt_bonus_manager), 0)::float8 AS bonus_manager
      FROM revenue_reconciliations
      ${productId ? sql`WHERE product_id = ${productId}` : sql``}
      GROUP BY product_id
    )
    SELECT
      ep.product_id AS "productId",
      ep.employee_name AS "employeeName",
      ep.cost_type AS "costType",
      ep.paid,
      pp.total_paid AS "totalPaid",
      CASE
        WHEN ep.cost_type = 'cdt_bonus_sale' THEN COALESCE(pr.bonus_sale, 0)
        WHEN ep.cost_type = 'cdt_bonus_manager' THEN COALESCE(pr.bonus_manager, 0)
      END AS "revenueTotal",
      p.product_code AS "productCode",
      p.unit_code AS "unitCode"
    FROM emp_paid ep
    JOIN product_paid pp ON pp.product_id = ep.product_id AND pp.cost_type = ep.cost_type
    LEFT JOIN product_rev pr ON pr.product_id = ep.product_id
    LEFT JOIN products p ON p.id = ep.product_id
    WHERE ep.paid > 0
  `)) as unknown as Array<{
    productId: number;
    productCode: string;
    unitCode: string;
    employeeName: string;
    costType: OverpaidRow["costType"];
    paid: number;
    totalPaid: number;
    revenueTotal: number;
  }>;

  const result: OverpaidRow[] = [];
  for (const r of rows) {
    const paid = Number(r.paid ?? 0);
    const totalPaid = Number(r.totalPaid ?? 0);
    const revenueTotal = Number(r.revenueTotal ?? 0);
    // Emp's share of revenue = tỷ lệ paid của emp trên tổng paid loại đó ở căn
    const empShare = totalPaid > 0 ? paid / totalPaid : 0;
    const allocatedRevenue = Math.max(0, revenueTotal) * empShare;
    const overpaid = paid - allocatedRevenue;
    if (overpaid > CENT_THRESHOLD) {
      result.push({
        productId: r.productId,
        productCode: r.productCode,
        unitCode: r.unitCode,
        employeeName: r.employeeName,
        costType: r.costType,
        paid,
        revenueTotal,
        overpaid,
      });
    }
  }
  return result;
}

/**
 * Aggregate per product — dùng cho list căn / badge.
 */
export type ProductOverpaidSummary = {
  productId: number;
  totalOverpaid: number;
  employees: string[]; // unique names
};

export async function getProductOverpaidSummary(): Promise<Map<number, ProductOverpaidSummary>> {
  const rows = await getEmployeeOverpaid();
  const byProduct = new Map<number, ProductOverpaidSummary>();
  for (const r of rows) {
    const cur = byProduct.get(r.productId) ?? {
      productId: r.productId,
      totalOverpaid: 0,
      employees: [],
    };
    cur.totalOverpaid += r.overpaid;
    if (!cur.employees.includes(r.employeeName)) cur.employees.push(r.employeeName);
    byProduct.set(r.productId, cur);
  }
  return byProduct;
}
