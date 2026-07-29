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
  otherCosts: number | null; // Excel sheet 2.1 col AL — CP giá vốn khác
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
  revenueThisTime: number;
  paymentProgressPct: number; // N — tiến độ khách trả CĐT (cột P sheet 2.2)
  pmgCumulativePct: number;
  cdtBonusSale: number; // CĐT thưởng sale thực nhận từ CĐT (cột Y sheet 2.2)
  cdtBonusManager: number; // CĐT thưởng QL thực nhận (cột Z sheet 2.2)
};

export type CostReconInput = {
  productId: number;
  costType: string;
  amountPayableThisTime: number;
  paymentProgressPct: number; // dùng để compute T (tiến độ đã ĐC sale)
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
  const costByProduct = new Map<number, number>(); // tổng đã ĐC per căn (all costType)
  // MAX N cost recon (chỉ từ sale_commission — khớp Excel filter "U > 0"
  // trong công thức T = MAXIFS N sheet 2.3 với U > 0).
  const maxNSaleCommByProduct = new Map<number, number>();
  for (const c of costRecons) {
    const key = `${c.productId}|${c.costType}`;
    const amt = Number(c.amountPayableThisTime ?? 0);
    costByProductType.set(key, (costByProductType.get(key) ?? 0) + amt);
    costByProduct.set(c.productId, (costByProduct.get(c.productId) ?? 0) + amt);
    if (c.costType === "sale_commission") {
      const n = Number(c.paymentProgressPct ?? 0);
      maxNSaleCommByProduct.set(
        c.productId,
        Math.max(maxNSaleCommByProduct.get(c.productId) ?? 0, n),
      );
    }
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

    // === Z + AA: replicate Excel R formula exact ===
    // N = MAX(paymentProgressPct) từ revenue recons (cột P sheet 2.2)
    const maxN = recs.reduce(
      (mx, r) => Math.max(mx, Number(r.paymentProgressPct ?? 0)),
      0,
    );
    // T = MAX(paymentProgressPct) từ cost recons SALE_COMMISSION only.
    // Khớp Excel: MAXIFS N sheet 2.3 với U (PMG LK dot nay) > 0 — chỉ HH sale
    // có PMG progress, các loại flat (thưởng, KPI) không tính.
    const maxNCost = maxNSaleCommByProduct.get(p.id) ?? 0;
    // Z = N - T (Excel formula)
    const Z = maxN - maxNCost;

    // Excel R (Giá vốn tương ứng) — công thức exact từ Excel:
    // R = ((AJ*AM*N - AO)/1.1 - AP)*AN           # HH sale
    //   + SUM(AK:AL)/1.1                          # CĐT bonus sale+mgr / 1.1
    //   + AP                                      # customer support
    //   + AQ + AR                                 # cty bonus sale+mgr
    //   + AV                                      # CP giá vốn khác (chưa có trong app)
    //   + ((AJ*AM*N - AO)/1.1 - AP)*(AS+AT)      # KPI CEO + TPKD (theo N)
    //   + ((AJ*AM - AO)/1.1 - AP)*AU             # KPI Admin (không N)
    const AJ_ = pmgBase; // pmgBasePrice
    const AM_ = Number(p.pmgSaleRate ?? p.pmgRate ?? 0); // pmgSaleRate
    const AO_ = Number(p.adminFeeSale ?? 0); // adminFeeSale
    const AP_ = Number(p.customerSupport ?? 0); // customerSupport
    const AN_ = Number(p.saleCommissionRate ?? 0); // saleCommissionRate
    const AK_ = Number(p.cdtBonusSale ?? 0); // CĐT bonus sale (gồm VAT)
    const AL_ = Number(p.cdtBonusManager ?? 0); // CĐT bonus manager (gồm VAT)
    const AQ_ = Number(p.bonusSale ?? 0);
    const AR_ = Number(p.bonusManager ?? 0);
    const AV_ = Number(p.otherCosts ?? 0); // CP giá vốn khác (sheet 2.1 col AL)
    const AS_ = Number(p.kpiCeoRate ?? 0);
    const AT_ = Number(p.kpiTpkdRate ?? 0);
    const AU_ = Number(p.kpiAdminRate ?? 0);

    // Chỉ tính R nếu có ĐC (O > 0) — như Excel `if(O>0, ...)`
    const hasRecon = totalReceivable > 0;
    const baseAtN = (AJ_ * AM_ * maxN - AO_) / 1.1 - AP_;
    const baseAtFull = (AJ_ * AM_ - AO_) / 1.1 - AP_;
    const R = hasRecon
      ? baseAtN * AN_
        + (AK_ + AL_) / 1.1
        + AP_
        + AQ_ + AR_
        + AV_
        + baseAtN * (AS_ + AT_)
        + baseAtFull * AU_
      : 0;

    // U = SUM all cost recons cho căn (mọi costType)
    const U = costByProduct.get(p.id) ?? 0;
    const AA = R - U;

    // === AB → AI (breakdown per loại) — giữ compute độc lập, không phải R-U ===
    const cfg: ProductConfig = {
      pmgBasePrice: AJ_,
      pmgSaleRate: AM_,
      adminFeeSale: AO_,
      customerSupport: AP_,
      saleCommissionRate: AN_,
      kpiCeoRate: AS_,
      kpiTpkdRate: AT_,
      kpiAdminRate: AU_,
      bonusSale: AQ_,
      bonusManager: AR_,
      cdtBonusSale: AK_,
      cdtBonusManager: AL_,
    };
    // AB/AC: Excel dùng CĐT thưởng thực nhận từ revenue recon (không phải config)
    // AB = SUMIF sheet 2.2 col Y / 1.1 - SUMIF sheet 2.3 col Y
    const cdtSaleReceived = recs.reduce((s, r) => s + Number(r.cdtBonusSale ?? 0), 0);
    const cdtMgrReceived = recs.reduce((s, r) => s + Number(r.cdtBonusManager ?? 0), 0);
    const AB = cdtSaleReceived / 1.1 - costSum(p.id, "cdt_bonus_sale");
    const AC = cdtMgrReceived / 1.1 - costSum(p.id, "cdt_bonus_manager");
    const AD = computeLuyKe(cfg, "bonus_sale", 1) - costSum(p.id, "bonus_sale");
    const AE = computeLuyKe(cfg, "bonus_manager", 1) - costSum(p.id, "bonus_manager");
    const AF = computeLuyKe(cfg, "customer_support", 1) - costSum(p.id, "customer_support");
    // KPI CEO / TPKD / Admin: Excel formula dùng FULL target (không nhân N):
    // AG = ((AJ*AM - AO)/1.1 - AP)*AS - SUM cost recon kpi_ceo (mỗi đợt tính theo N)
    // Ý nghĩa: target FULL cho tới khi khách trả 100%, trừ đã ĐC lũy kế.
    const AG = baseAtFull * AS_ - costSum(p.id, "kpi_ceo");
    const AH = AT_ > 0
      ? baseAtFull * AT_ - costSum(p.id, "kpi_tpkd")
      : 0;
    const AI = AU_ > 0 ? baseAtFull * AU_ - costSum(p.id, "kpi_admin") : 0;

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
