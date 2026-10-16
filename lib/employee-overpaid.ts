/**
 * Dò chênh lệch thưởng nóng per (căn × NV): BRE đã trả NV bao nhiêu so với
 * số chủ đầu tư thật sự cấp về.
 *
 * Chênh lệch có hai nguyên nhân hoàn toàn khác nhau, và chỉ một trong hai là
 * nợ của nhân viên:
 *
 *   hoan_lai  CĐT đã cấp rồi thu lại (có dòng cdt_bonus_* ÂM phía doanh thu).
 *             Nhân viên đã cầm tiền mà công ty thì mất, nên NV nợ công ty,
 *             khấu trừ vào hoa hồng đợt sau.
 *
 *   cap_thieu CĐT chưa bao giờ cấp tới mức đó, không có dòng âm nào. Công ty
 *             tự chọn trả NV theo quy ước của mình, cao hơn số nhận về. Đây
 *             là chi phí của công ty, NV KHÔNG nợ gì.
 *
 * Gộp hai loại làm một đã suýt trừ oan 1.090.909 của NVKD căn B-09-11A: Opus
 * quy đổi thưởng nóng 10tr bằng cách nhân 0,8 ra 8.000.000, còn BRE bóc VAT
 * ra 9.090.909. Không ai thu lại đồng nào, chỉ là hai cách tính khác nhau.
 *
 * Không cover sale_commission (rate/progress phức tạp).
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
  /** Xem chú thích đầu file. Chỉ hoan_lai mới là nợ của nhân viên. */
  loai: "hoan_lai" | "cap_thieu";
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
        COALESCE(SUM(cdt_bonus_manager), 0)::float8 AS bonus_manager,
        COALESCE(MIN(cdt_bonus_sale), 0)::float8 AS min_bonus_sale,
        COALESCE(MIN(cdt_bonus_manager), 0)::float8 AS min_bonus_manager
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
      CASE
        WHEN ep.cost_type = 'cdt_bonus_sale' THEN COALESCE(pr.min_bonus_sale, 0)
        WHEN ep.cost_type = 'cdt_bonus_manager' THEN COALESCE(pr.min_bonus_manager, 0)
      END AS "minRevenue",
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
    minRevenue: number;
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
        loai: Number(r.minRevenue ?? 0) < 0 ? "hoan_lai" : "cap_thieu",
      });
    }
  }
  return result;
}

/**
 * Chỉ những khoản nhân viên thật sự nợ công ty, tức CĐT đã cấp rồi thu lại.
 * Mọi nơi hiện cảnh báo "NV nợ, khấu trừ đợt sau" phải gọi hàm này, không gọi
 * getEmployeeOverpaid, nếu không sẽ trừ oan phần công ty tự chịu.
 */
export async function getEmployeeClawback(productId?: number): Promise<OverpaidRow[]> {
  return (await getEmployeeOverpaid(productId)).filter((r) => r.loai === "hoan_lai");
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
  const rows = await getEmployeeClawback();
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
