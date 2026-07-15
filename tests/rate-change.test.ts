import { describe, test, expect } from "vitest";
import { computeLuyKe, type ProductConfig } from "@/lib/costCalc";

/**
 * Tests cho scenario user hỏi (2026-07-15):
 * - Tháng 1: %PMG_LK = 5%
 * - Tháng 2: khách trả 60% tiến độ → BRE thu 60% × 5% × pmgBase (đợt 2)
 * - Tháng 3: %PMG_LK tăng 6% (đạt doanh số) — HỒI TỐ toàn phần
 * - Còn phải thu = pmgBase × 6% × 60% − đã ĐC đợt 2
 */

// Reproduce revenue formula (từ RevenueForm suggest logic + createRevenue action)
// Excel col P: gross = pmgBase × pmgLk × phasePct − admin
// amount đợt này = gross_thisTime − sum(prev revenue_this_time)
function computeRevenueThisTime(
  pmgBase: number,
  pmgLk: number,
  phasePct: number,
  adminFee: number,
  prevRevenueCumulative: number,
): number {
  const gross = pmgBase * pmgLk * phasePct - adminFee;
  return Math.max(0, Math.round(gross - prevRevenueCumulative));
}

// Reproduce recomputeDerived formula cho total_revenue
function computeTotalRevenue(cfg: {
  pmgBase: number;
  pmgRate: number;
  adminFee: number;
  cdtBonusSale?: number;
  cdtBonusManager?: number;
  otherFeePct?: number;
  otherRevenue?: number;
  revenueReduction?: number;
}): number {
  const pmgBase = cfg.pmgBase;
  const rate = cfg.pmgRate;
  const otherFeePct = cfg.otherFeePct ?? 0;
  const otherRev = cfg.otherRevenue ?? 0;
  const revRed = cfg.revenueReduction ?? 0;
  const admin = cfg.adminFee;
  const cdtSale = cfg.cdtBonusSale ?? 0;
  const cdtMgr = cfg.cdtBonusManager ?? 0;
  return Math.round(
    pmgBase * (rate + otherFeePct) + otherRev - revRed - admin + cdtSale + cdtMgr,
  );
}

describe("Revenue: %PMG_LK thay đổi giữa chừng (hồi tố)", () => {
  const pmgBase = 1_000_000_000; // 1 tỷ
  const admin = 3_850_000;

  test("Đợt 1: %PMG=5%, khách trả 60% → BRE thu = giá×5%×60% − admin", () => {
    const revenue = computeRevenueThisTime(pmgBase, 0.05, 0.6, admin, 0);
    // = 1B × 0.05 × 0.6 − 3.85M = 30M − 3.85M = 26.15M
    expect(revenue).toBe(26_150_000);
  });

  test("Đợt 2: %PMG tăng 6% (hồi tố), khách vẫn 60% → còn thu = giá×6%×60% − prev", () => {
    const prev = 26_150_000; // đã ĐC đợt 1
    const revenue = computeRevenueThisTime(pmgBase, 0.06, 0.6, admin, prev);
    // gross đợt 2 (hồi tố) = 1B × 0.06 × 0.6 − 3.85M = 36M − 3.85M = 32.15M
    // amount đợt 2 = 32.15M − 26.15M = 6M
    // = giá × (6% − 5%) × 60% = 1B × 0.01 × 0.6 = 6M ✓
    expect(revenue).toBe(6_000_000);
  });

  test("Đợt 3: khách trả thêm lên 90%, %PMG vẫn 6%", () => {
    const prevCumulative = 26_150_000 + 6_000_000; // = 32.15M
    const revenue = computeRevenueThisTime(pmgBase, 0.06, 0.9, admin, prevCumulative);
    // gross đợt 3 = 1B × 0.06 × 0.9 − 3.85M = 54M − 3.85M = 50.15M
    // amount = 50.15M − 32.15M = 18M
    // = giá × 6% × (90% − 60%) = 1B × 0.06 × 0.3 = 18M ✓
    expect(revenue).toBe(18_000_000);
  });

  test("Trường hợp cực: khách trả từ 60% lên 90% VÀ rate cùng lúc tăng 5% → 7%", () => {
    const prev = 30_000_000; // đợt 1: 1B × 5% × 60% − admin = 26.15M, nhưng test giả sử prev tròn
    const revenue = computeRevenueThisTime(pmgBase, 0.07, 0.9, admin, prev);
    // gross = 1B × 0.07 × 0.9 − 3.85M = 63M − 3.85M = 59.15M
    // amount = 59.15M − 30M = 29.15M
    expect(revenue).toBe(29_150_000);
  });

  test("Rate giảm (hiếm) → còn thu = 0 (không âm)", () => {
    // Đã ĐC 40M (đợt trước). Giờ rate giảm 5% → 4% → gross mới < prev
    const revenue = computeRevenueThisTime(pmgBase, 0.04, 0.6, admin, 40_000_000);
    // gross mới = 1B × 0.04 × 0.6 − 3.85M = 24M − 3.85M = 20.15M
    // amount = max(0, 20.15M − 40M) = 0
    expect(revenue).toBe(0);
  });
});

describe("Total revenue recompute khi %PMG_LK / admin thay đổi", () => {
  const base = {
    pmgBase: 1_000_000_000,
    pmgRate: 0.05,
    adminFee: 3_850_000,
    cdtBonusSale: 22_000_000,
  };

  test("%PMG_LK tăng 5% → 6% → total_revenue tăng đúng 10M", () => {
    const before = computeTotalRevenue(base);
    const after = computeTotalRevenue({ ...base, pmgRate: 0.06 });
    // Diff = 1B × (0.06 − 0.05) = 10M
    expect(after - before).toBe(10_000_000);
    // Verify absolute values
    // before = 1B × 0.05 − 3.85M + 22M = 50M − 3.85M + 22M = 68.15M
    // after  = 1B × 0.06 − 3.85M + 22M = 60M − 3.85M + 22M = 78.15M
    expect(before).toBe(68_150_000);
    expect(after).toBe(78_150_000);
  });

  test("Admin fee tăng 3.85M → 8.8M → total_revenue giảm đúng chênh", () => {
    const before = computeTotalRevenue(base);
    const after = computeTotalRevenue({ ...base, adminFee: 8_800_000 });
    // Diff = -(8.8M − 3.85M) = -4.95M
    expect(after - before).toBe(-4_950_000);
  });

  test("Đổi cả rate + admin cùng lúc (adjustment 2 field)", () => {
    const after = computeTotalRevenue({
      ...base,
      pmgRate: 0.07,
      adminFee: 5_500_000,
    });
    // = 1B × 0.07 − 5.5M + 22M = 70M − 5.5M + 22M = 86.5M
    expect(after).toBe(86_500_000);
  });

  test("Rate = 0 (bug căn 655) → collapse: chỉ còn cdt − admin", () => {
    const collapsed = computeTotalRevenue({ ...base, pmgRate: 0 });
    // = 0 − 3.85M + 22M = 18.15M
    expect(collapsed).toBe(18_150_000);
  });
});

describe("Cost formula: rate thay đổi tác động HH/KPI amount", () => {
  const baseCfg: ProductConfig = {
    pmgBasePrice: 1_000_000_000,
    pmgSaleRate: 0.05,
    adminFeeSale: 3_850_000,
    customerSupport: 0,
    saleCommissionRate: 0.5, // 50% HH sale
    kpiCeoRate: 0.035,
    kpiTpkdRate: 0.04,
    kpiAdminRate: 0.0025,
    bonusSale: 0,
    bonusManager: 0,
    cdtBonusSale: 0,
    cdtBonusManager: 0,
  };

  test("HH sale tại N=100% (thu đủ): baseNet × 50%", () => {
    const hh = computeLuyKe(baseCfg, "sale_commission", 1);
    // baseNet = (1B × 0.05 − 3.85M)/1.1 − 0 = 46.15M/1.1 = 41,954,545
    // HH = 41,954,545 × 0.5 = 20,977,273
    expect(hh).toBe(20_977_273);
  });

  test("HH sale tại N=60%: nhỏ hơn tương ứng", () => {
    const hh = computeLuyKe(baseCfg, "sale_commission", 0.6);
    // baseNet = (1B × 0.05 × 0.6 − 3.85M)/1.1 = (30M − 3.85M)/1.1 = 26.15M/1.1 = 23,772,727
    // HH = 23,772,727 × 0.5 = 11,886,364
    expect(hh).toBe(11_886_364);
  });

  test("Đổi pmgSaleRate 5% → 7% → HH tăng tương ứng", () => {
    const before = computeLuyKe(baseCfg, "sale_commission", 1);
    const after = computeLuyKe({ ...baseCfg, pmgSaleRate: 0.07 }, "sale_commission", 1);
    // before = 20,977,273
    // after: baseNet = (1B × 0.07 − 3.85M)/1.1 = 66.15M/1.1 = 60,136,364
    //        HH = 60,136,364 × 0.5 = 30,068,182
    expect(after).toBe(30_068_182);
    expect(after - before).toBe(9_090_909);
  });

  test("Đổi adminFeeSale 3.85M → 8.8M → HH giảm (base thấp hơn)", () => {
    const before = computeLuyKe(baseCfg, "sale_commission", 1);
    const after = computeLuyKe({ ...baseCfg, adminFeeSale: 8_800_000 }, "sale_commission", 1);
    // after: baseNet = (50M − 8.8M)/1.1 = 41.2M/1.1 = 37,454,545
    //        HH = × 0.5 = 18,727,273
    expect(after).toBe(18_727_273);
    expect(after).toBeLessThan(before);
  });

  test("KPI Admin không dùng N (progress) → luôn tính full", () => {
    const kpiAtN30 = computeLuyKe(baseCfg, "kpi_admin", 0.3);
    const kpiAtN100 = computeLuyKe(baseCfg, "kpi_admin", 1);
    expect(kpiAtN30).toBe(kpiAtN100);
    // baseNet = 46.15M/1.1 = 41,954,545 × 0.0025 = 104,886
    expect(kpiAtN100).toBe(104_886);
  });

  test("Đổi %HH sale 50% → 55% → HH tăng đúng 10%", () => {
    const before = computeLuyKe(baseCfg, "sale_commission", 1);
    const after = computeLuyKe({ ...baseCfg, saleCommissionRate: 0.55 }, "sale_commission", 1);
    // Ratio 0.55 / 0.5 = 1.1
    expect(after / before).toBeCloseTo(1.1, 2);
  });
});

describe("Adjustment chain (multi-step config changes)", () => {
  test("Tuần tự 3 adjustment: giá tăng → rate tăng → admin đổi", () => {
    // Bắt đầu: pmgBase=1B, rate=5%, admin=3.85M → total_revenue = 68.15M
    const step0 = computeTotalRevenue({
      pmgBase: 1_000_000_000,
      pmgRate: 0.05,
      adminFee: 3_850_000,
      cdtBonusSale: 22_000_000,
    });
    expect(step0).toBe(68_150_000);

    // Adjustment 1: giá lên 1.2B
    const step1 = computeTotalRevenue({
      pmgBase: 1_200_000_000,
      pmgRate: 0.05,
      adminFee: 3_850_000,
      cdtBonusSale: 22_000_000,
    });
    // = 1.2B × 5% − 3.85M + 22M = 60M − 3.85M + 22M = 78.15M
    expect(step1).toBe(78_150_000);

    // Adjustment 2: rate lên 6%
    const step2 = computeTotalRevenue({
      pmgBase: 1_200_000_000,
      pmgRate: 0.06,
      adminFee: 3_850_000,
      cdtBonusSale: 22_000_000,
    });
    // = 1.2B × 6% − 3.85M + 22M = 72M − 3.85M + 22M = 90.15M
    expect(step2).toBe(90_150_000);

    // Adjustment 3: admin xuống 2M
    const step3 = computeTotalRevenue({
      pmgBase: 1_200_000_000,
      pmgRate: 0.06,
      adminFee: 2_000_000,
      cdtBonusSale: 22_000_000,
    });
    // = 72M − 2M + 22M = 92M
    expect(step3).toBe(92_000_000);

    // Verify chain monotonic (tăng dần vì mỗi step làm cải thiện)
    expect(step0).toBeLessThan(step1);
    expect(step1).toBeLessThan(step2);
    expect(step2).toBeLessThan(step3);
  });
});
