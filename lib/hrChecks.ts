/**
 * HR check metrics — 13 chỉ số per căn để HR kiểm tra hàng tháng.
 * Map theo cột W → AI trong sheet Excel "3_BC DOANH THU - GIA VON".
 *
 * Threshold: |value| > 1000 VND cho tiền, > 0.001 (0.1%) cho %.
 * Chốt 2026-07-29.
 */

import { computeLuyKe, type ProductConfig, type CostType } from "./costCalc";

export type HrCheckField =
  | "W" | "X" | "Y" | "Z" | "AA"
  | "AB" | "AC" | "AD" | "AE" | "AF"
  | "AG" | "AH" | "AI";

export const HR_CHECK_LABELS: Record<HrCheckField, string> = {
  W: "Đã ĐC chưa xuất HĐ",
  X: "Đã ĐC chưa thu tiền",
  Y: "DT còn lại chưa ĐC",
  Z: "Tiến độ phải ĐC đợt này (%) với sale",
  AA: "Số tiền phải ĐC đợt này với sale",
  AB: "CĐT thưởng sale chưa chi",
  AC: "CĐT thưởng QL chưa chi",
  AD: "Cty thưởng sale chưa chi",
  AE: "Cty thưởng QL chưa chi",
  AF: "Hỗ trợ khách chưa chi",
  AG: "KPI CEO chưa ĐC",
  AH: "KPI TPKD chưa ĐC",
  AI: "Thưởng Admin chưa ĐC",
};

export const HR_CHECK_DESCRIPTIONS: Record<HrCheckField, string> = {
  W: "Doanh thu đã đối chiếu (ĐC) nhưng chưa lập hóa đơn cho CĐT.",
  X: "Doanh thu đã ĐC nhưng chưa nhận đủ tiền từ CĐT.",
  Y: "Doanh thu còn lại chưa được đối chiếu (tổng expected − đã ĐC).",
  Z: "Chênh lệch % giữa tiến độ khách trả CĐT và tiến độ đã đối chiếu HH sale.",
  AA: "Số tiền HH sale còn phải đối chiếu theo tiến độ N hiện tại.",
  AB: "Thưởng nóng CĐT trả sale, chưa được chi. (Đã trừ VAT 10%)",
  AC: "Thưởng nóng CĐT trả quản lý, chưa được chi. (Đã trừ VAT 10%)",
  AD: "Thưởng nóng công ty trả sale, chưa được chi.",
  AE: "Thưởng nóng công ty trả quản lý, chưa được chi.",
  AF: "Hỗ trợ khách chưa được chi.",
  AG: "KPI CEO còn phải đối chiếu (theo N hiện tại).",
  AH: "KPI TPKD còn phải đối chiếu (theo N hiện tại).",
  AI: "Thưởng KPI Admin còn phải đối chiếu.",
};

// Field nào là % (còn lại là VND)
export const PERCENT_FIELDS: Set<HrCheckField> = new Set(["Z"]);

// Cost type ứng với từng field (để link đến /costs/new?costType=...)
export const FIELD_TO_COST_TYPE: Partial<Record<HrCheckField, CostType>> = {
  AA: "sale_commission",
  AB: "cdt_bonus_sale",
  AC: "cdt_bonus_manager",
  AD: "bonus_sale",
  AE: "bonus_manager",
  AF: "customer_support",
  AG: "kpi_ceo",
  AH: "kpi_tpkd",
  AI: "kpi_admin",
};

export type HrCheckRow = {
  productId: number;
  productCode: string;
  unitCode: string;
  projectName: string | null;
  partnerName: string | null;
  salesPerson: string | null;
  deptLeaderName: string | null;
  values: Record<HrCheckField, number>;
};

export type ProductInput = {
  id: number;
  productCode: string;
  unitCode: string;
  projectName: string | null;
  partnerName: string | null;
  salesPerson: string | null;
  deptLeaderName: string | null;
  totalRevenue: number | null; // Excel col F (gồm VAT + cdt bonuses)
  pmgBasePrice: number | null;
  pmgSaleRate: number | null;
  pmgRate: number | null;
  adminFeeSale: number | null;
  customerSupport: number | null;
  saleCommissionRate: number | null;
  kpiCeoRate: number | null;
  kpiTpkdRate: number | null;
  kpiAdminRate: number | null;
  bonusSale: number | null;
  bonusManager: number | null;
  cdtBonusSale: number | null;
  cdtBonusManager: number | null;
};

export type RevReconInput = {
  productId: number;
  invoiceId: number | null;
  totalReceivableThisTime: number; // gồm cdtBonus
  revenueThisTime: number; // chỉ phần PMG (để compute N)
  pmgCumulativePct: number;
};

export type CostReconInput = {
  productId: number;
  costType: string;
  amountPayableThisTime: number;
};

export type PaymentInInput = {
  reconciliationId: number;
  amount: number;
};

export type RevReconWithId = RevReconInput & { id: number };

export function computeHrChecks(
  products: ProductInput[],
  revRecons: RevReconWithId[],
  costRecons: CostReconInput[],
  paymentsIn: PaymentInInput[],
): HrCheckRow[] {
  // Group indices for O(1) lookup
  const revByProduct = new Map<number, RevReconWithId[]>();
  for (const r of revRecons) {
    const arr = revByProduct.get(r.productId) ?? [];
    arr.push(r);
    revByProduct.set(r.productId, arr);
  }

  const costByProductType = new Map<string, number>();
  for (const c of costRecons) {
    const key = `${c.productId}|${c.costType}`;
    costByProductType.set(key, (costByProductType.get(key) ?? 0) + Number(c.amountPayableThisTime ?? 0));
  }
  const costSum = (productId: number, costType: CostType) =>
    costByProductType.get(`${productId}|${costType}`) ?? 0;

  const paidByRecon = new Map<number, number>();
  for (const p of paymentsIn) {
    paidByRecon.set(p.reconciliationId, (paidByRecon.get(p.reconciliationId) ?? 0) + Number(p.amount ?? 0));
  }

  return products.map((p): HrCheckRow => {
    const recs = revByProduct.get(p.id) ?? [];

    // === W: Đã ĐC chưa xuất HĐ ===
    const W = recs
      .filter((r) => r.invoiceId == null)
      .reduce((s, r) => s + Number(r.totalReceivableThisTime ?? 0), 0);

    // === X: Đã ĐC chưa thu tiền ===
    const totalReceivable = recs.reduce((s, r) => s + Number(r.totalReceivableThisTime ?? 0), 0);
    const totalPaid = recs.reduce((s, r) => s + (paidByRecon.get(r.id) ?? 0), 0);
    const X = totalReceivable - totalPaid;

    // === Y: DT còn lại chưa ĐC ===
    // Dùng product.totalRevenue (khớp Excel col F: đã cộng cdtBonus + adminFee)
    // thay pmgBase × pmgRate (chỉ là PMG_LK component, thiếu bonuses).
    const pmgBase = Number(p.pmgBasePrice ?? 0);
    const targetRev = Number(p.totalRevenue ?? 0);
    const Y = targetRev - totalReceivable;

    // === Z + AA: % và tiền HH sale còn phải ĐC ===
    // N = tiến độ khách trả CĐT theo PMG = SUM(revenueThisTime — chỉ phần PMG,
    // KHÔNG gồm cdtBonus) / (pmgBase × pmgRate — target PMG thuần).
    // Không dùng totalReceivable / totalRevenue vì cả 2 gồm cdtBonus → sai N.
    const pmgTargetOnly = pmgBase * Number(p.pmgRate ?? 0);
    const revPmgOnly = recs.reduce((s, r) => s + Number(r.revenueThisTime ?? 0), 0);
    const maxN = pmgTargetOnly > 0 ? Math.min(1, revPmgOnly / pmgTargetOnly) : 0;

    const cfg: ProductConfig = {
      pmgBasePrice: pmgBase,
      pmgSaleRate: Number(p.pmgSaleRate ?? p.pmgRate ?? 0),
      adminFeeSale: Number(p.adminFeeSale ?? 0),
      customerSupport: Number(p.customerSupport ?? 0),
      saleCommissionRate: Number(p.saleCommissionRate ?? 0),
      kpiCeoRate: Number(p.kpiCeoRate ?? 0),
      kpiTpkdRate: Number(p.kpiTpkdRate ?? 0),
      kpiAdminRate: Number(p.kpiAdminRate ?? 0),
      bonusSale: Number(p.bonusSale ?? 0),
      bonusManager: Number(p.bonusManager ?? 0),
      cdtBonusSale: Number(p.cdtBonusSale ?? 0),
      cdtBonusManager: Number(p.cdtBonusManager ?? 0),
    };

    // HH sale target đến N hiện tại
    const salesCommTargetAtN = computeLuyKe(cfg, "sale_commission", maxN);
    const salesCommDone = costSum(p.id, "sale_commission");
    const AA = salesCommTargetAtN - salesCommDone;
    // Z = tiến độ % (N) − tiến độ % đã ĐC. Tính % đã ĐC = salesCommDone / salesCommFull.
    const salesCommFull = computeLuyKe(cfg, "sale_commission", 1);
    const doneProgress = salesCommFull > 0 ? salesCommDone / salesCommFull : 0;
    const Z = maxN - doneProgress;

    // === AB → AI ===
    // Target: computeLuyKe với N=1 (đủ). Với các loại flat (bonus, support),
    // computeLuyKe trả về giá trị flat trực tiếp.
    const AB = computeLuyKe(cfg, "cdt_bonus_sale", 1) - costSum(p.id, "cdt_bonus_sale");
    const AC = computeLuyKe(cfg, "cdt_bonus_manager", 1) - costSum(p.id, "cdt_bonus_manager");
    const AD = computeLuyKe(cfg, "bonus_sale", 1) - costSum(p.id, "bonus_sale");
    const AE = computeLuyKe(cfg, "bonus_manager", 1) - costSum(p.id, "bonus_manager");
    const AF = computeLuyKe(cfg, "customer_support", 1) - costSum(p.id, "customer_support");
    // KPI: dùng N hiện tại (theo tiến độ khách trả)
    const AG = computeLuyKe(cfg, "kpi_ceo", maxN) - costSum(p.id, "kpi_ceo");
    const AH = computeLuyKe(cfg, "kpi_tpkd", maxN) - costSum(p.id, "kpi_tpkd");
    // KPI Admin: full (N=1) — chi 1 lần/căn
    const AI = computeLuyKe(cfg, "kpi_admin", 1) - costSum(p.id, "kpi_admin");

    return {
      productId: p.id,
      productCode: p.productCode,
      unitCode: p.unitCode,
      projectName: p.projectName,
      partnerName: p.partnerName,
      salesPerson: p.salesPerson,
      deptLeaderName: p.deptLeaderName,
      values: { W, X, Y, Z, AA, AB, AC, AD, AE, AF, AG, AH, AI },
    };
  });
}

/**
 * Filter rows theo threshold cho 1 field cụ thể.
 * Tiền: |value| > 1000; % (Z): |value| > 0.001 (0.1%).
 */
export function filterByField(rows: HrCheckRow[], field: HrCheckField): HrCheckRow[] {
  const isPct = PERCENT_FIELDS.has(field);
  const threshold = isPct ? 0.001 : 1000;
  return rows.filter((r) => Math.abs(r.values[field]) > threshold);
}
