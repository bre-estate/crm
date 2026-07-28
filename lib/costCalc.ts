/**
 * Công thức tính giá vốn (HH sale + KPI) theo Excel sheet 2.3.
 *
 * Formula chung cho HH sale + KPI CEO/TPKD:
 *   Lũy kế đến đợt này = ((L × M × N − Q) / 1.1 − R) × P
 * KPI Admin (không có N, trả full 1 lần):
 *   Lũy kế = ((L × M − Q) / 1.1 − R) × P
 *
 * Trong đó:
 *   L = Giá tính PMG (product.pmgBasePrice)
 *   M = %PMG_LK_sale (product.pmgSaleRate) — "PMG Sale rate"
 *   N = Tiến độ PMG đã thu tiền (payment_progress_pct) — 0..1
 *   Q = Phí admin sale (product.adminFeeSale) — VAT gộp
 *   R = Hỗ trợ khách (product.customerSupport)
 *   P = %HH sale / %KPI CEO / %KPI TPKD / %KPI Admin (tuỳ costType)
 *   /1.1 = trừ VAT 10%
 */
export type CostType =
  | "sale_commission"
  | "customer_support"
  | "bonus_sale"
  | "bonus_manager"
  | "cdt_bonus_sale"
  | "cdt_bonus_manager"
  | "kpi_ceo"
  | "kpi_tpkd"
  | "kpi_admin";

export type ProductConfig = {
  pmgBasePrice: number; // L
  pmgSaleRate: number; // M
  adminFeeSale: number; // Q
  customerSupport: number; // R
  saleCommissionRate: number; // P for HH sale
  kpiCeoRate: number;
  kpiTpkdRate: number;
  kpiAdminRate: number;
  bonusSale: number;
  bonusManager: number;
  cdtBonusSale: number;
  cdtBonusManager: number;
};

/** Rate P tương ứng cost type. */
export function getRate(p: ProductConfig, costType: CostType): number {
  switch (costType) {
    case "sale_commission":
      return p.saleCommissionRate;
    case "kpi_ceo":
      return p.kpiCeoRate;
    case "kpi_tpkd":
      return p.kpiTpkdRate;
    case "kpi_admin":
      return p.kpiAdminRate;
    default:
      return 0;
  }
}

/** Cost type có dùng biến N hay không (KPI Admin không dùng). */
export function usesProgressN(costType: CostType): boolean {
  return (
    costType === "sale_commission" ||
    costType === "kpi_ceo" ||
    costType === "kpi_tpkd"
  );
}

/** Cost type flat (không dùng công thức, lấy trực tiếp từ product config).
 * Thưởng nóng CĐT (cdt_bonus_*) đã gồm VAT 10% → mức chi thực tế = flat / 1.1
 * (BRE giữ 10% VAT nộp NN, chỉ chi net cho NVKD/quản lý). */
export function flatAmount(p: ProductConfig, costType: CostType): number | null {
  switch (costType) {
    case "customer_support":
      return p.customerSupport;
    case "bonus_sale":
      return p.bonusSale;
    case "bonus_manager":
      return p.bonusManager;
    case "cdt_bonus_sale":
      return p.cdtBonusSale != null ? p.cdtBonusSale / 1.1 : null;
    case "cdt_bonus_manager":
      return p.cdtBonusManager != null ? p.cdtBonusManager / 1.1 : null;
    default:
      return null;
  }
}

/**
 * Tính lũy kế theo công thức Excel.
 * @param progressN 0..1 (tiến độ PMG đã thu tiền). Nếu costType không dùng N, bỏ qua.
 */
export function computeLuyKe(
  p: ProductConfig,
  costType: CostType,
  progressN: number,
): number {
  // Flat cost types (bonus / support / cdt_bonus): amount = config
  const flat = flatAmount(p, costType);
  if (flat !== null) return flat;

  const rate = getRate(p, costType);
  if (rate === 0) return 0;

  const useN = usesProgressN(costType);
  const N = useN ? Math.max(0, Math.min(1, progressN)) : 1;

  const base = p.pmgBasePrice * p.pmgSaleRate * N;
  const afterAdmin = base - p.adminFeeSale;
  const afterVat = afterAdmin / 1.1;
  const afterSupport = afterVat - p.customerSupport;
  return Math.round(afterSupport * rate);
}

/**
 * Tính target đủ khi khách hàng thanh toán 100% (N=1).
 * Dùng để hiển thị "còn phải trả" preview trên detail page.
 */
export function computeTargetFull(p: ProductConfig, costType: CostType): number {
  return computeLuyKe(p, costType, 1);
}

/**
 * Số tiền cần trả đợt này = Lũy kế mới − Đã trả các đợt trước.
 */
export function computeThisTime(
  luyKeNew: number,
  paidBefore: number,
): number {
  return Math.max(0, luyKeNew - paidBefore);
}
