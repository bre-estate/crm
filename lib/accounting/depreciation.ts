/**
 * Khấu hao TSCĐ / CCDC — Simplified straight-line depreciation.
 *
 * Chuẩn kế toán VN (TT45/2013):
 *  - Thiết bị văn phòng, máy tính: 3-5 năm
 *  - Đồ nội thất: 5-10 năm
 *  - Xe cộ: 6-10 năm
 *
 * BRE mua chủ yếu máy quay/gimbal/camera/bàn ghế/thiết bị → dùng
 * DEFAULT 36 tháng (3 năm) blanket. Nếu cần custom per TSCĐ, thêm
 * bảng override sau.
 */

export const DEFAULT_LIFE_MONTHS = 36;

/** Số tháng giữa 2 tháng YYYY-MM. Trả về số dương nếu to > from. */
export function monthsBetween(from: string, to: string): number {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  if (!y1 || !y2) return 0;
  return (y2 - y1) * 12 + (m2 - m1);
}

/** Khấu hao tháng của 1 TSCĐ tại thời điểm `atMonth` (YYYY-MM).
 *  Nếu chưa tới ngày mua → 0.
 *  Nếu đã hết đời khấu hao → 0.
 *  Nếu đang khấu hao → cost / lifeMonths.
 */
export function monthlyDepreciation(
  purchaseMonth: string,
  cost: number,
  atMonth: string,
  lifeMonths = DEFAULT_LIFE_MONTHS,
): number {
  const elapsed = monthsBetween(purchaseMonth, atMonth);
  if (elapsed < 0) return 0;
  if (elapsed >= lifeMonths) return 0;
  return cost / lifeMonths;
}

/** Khấu hao lũy kế đến hết tháng `atMonth`. Capped tại `cost`. */
export function accumulatedDepreciation(
  purchaseMonth: string,
  cost: number,
  atMonth: string,
  lifeMonths = DEFAULT_LIFE_MONTHS,
): number {
  const elapsed = monthsBetween(purchaseMonth, atMonth);
  if (elapsed < 0) return 0;
  const perMonth = cost / lifeMonths;
  return Math.min(cost, perMonth * (elapsed + 1));
}

/** Giá trị net còn lại = cost − accumulated depreciation. */
export function netBookValue(
  purchaseMonth: string,
  cost: number,
  atMonth: string,
  lifeMonths = DEFAULT_LIFE_MONTHS,
): number {
  return Math.max(0, cost - accumulatedDepreciation(purchaseMonth, cost, atMonth, lifeMonths));
}

/** Tổng khấu hao / tháng cho tất cả TSCĐ tại `atMonth`.
 *  Dùng cho thêm vào OPEX trong reports.
 */
export function totalMonthlyDepreciation(
  assets: Array<{ purchaseMonth: string; cost: number; lifeMonths?: number }>,
  atMonth: string,
): number {
  return assets.reduce(
    (sum, a) => sum + monthlyDepreciation(a.purchaseMonth, a.cost, atMonth, a.lifeMonths),
    0,
  );
}
