import { describe, test, expect } from "vitest";

// Reproduce công thức recomputeDerived để test standalone (không cần DB).
// Sync với lib/actions/products.ts:recomputeDerived — nếu formula đổi, cập nhật cả 2.

type Config = {
  pmgBasePrice: number;
  pmgRate: number;
  otherFeePct?: number;
  otherRevenue?: number;
  revenueReduction?: number;
  adminFee: number;
  cdtBonusSale?: number;
  cdtBonusManager?: number;
  pmgSaleRate?: number;
  adminFeeSale?: number;
  customerSupport?: number;
  bonusSale?: number;
  bonusManager?: number;
  otherCost?: number;
  saleCommissionRate?: number;
  kpiCeoRate?: number;
  kpiTpkdRate?: number;
  kpiAdminRate?: number;
};

function computeTotals(c: Config): { totalRevenue: number; totalCost: number } {
  const pmgBase = c.pmgBasePrice;
  const rate = c.pmgRate;
  const admin = c.adminFee;
  const cdtSale = c.cdtBonusSale ?? 0;
  const cdtMgr = c.cdtBonusManager ?? 0;
  const otherFeePct = c.otherFeePct ?? 0;
  const otherRev = c.otherRevenue ?? 0;
  const revRed = c.revenueReduction ?? 0;
  const pmgSaleRate = (c.pmgSaleRate ?? 0) || rate;
  const adminSale = c.adminFeeSale ?? 0;
  const support = c.customerSupport ?? 0;
  const bonusSale = c.bonusSale ?? 0;
  const bonusMgr = c.bonusManager ?? 0;
  const otherCost = c.otherCost ?? 0;
  const hhRate = c.saleCommissionRate ?? 0;
  const kpiCeo = c.kpiCeoRate ?? 0;
  const kpiTpkd = c.kpiTpkdRate ?? 0;
  const kpiAdmin = c.kpiAdminRate ?? 0;

  const totalRevenue = Math.round(
    pmgBase * (rate + otherFeePct) + otherRev - revRed - admin + cdtSale + cdtMgr,
  );
  const baseNet = (pmgBase * pmgSaleRate - adminSale) / 1.1 - support;
  const cdtBonusNet = (cdtSale + cdtMgr) / 1.1;
  const totalCost = Math.round(
    baseNet * (hhRate + kpiCeo + kpiTpkd + kpiAdmin) +
      cdtBonusNet +
      bonusSale +
      bonusMgr +
      otherCost,
  );
  return { totalRevenue, totalCost };
}

describe("recomputeDerived formula (khớp Excel sheet 2.1 col P + col R)", () => {
  test("căn B1-09-22 (id=643) — canonical case", () => {
    // Config từ Excel row 43 sau khi sửa kpi_tpkd = 4%
    const cfg: Config = {
      pmgBasePrice: 1_834_415_215,
      pmgRate: 0.07,
      adminFee: 3_850_000,
      cdtBonusSale: 22_000_000,
      cdtBonusManager: 0,
      pmgSaleRate: 0.07,
      adminFeeSale: 3_850_000,
      customerSupport: 10_000_000,
      saleCommissionRate: 0.5,
      kpiCeoRate: 0.035,
      kpiTpkdRate: 0.04,
      kpiAdminRate: 0.0025,
    };
    const { totalRevenue, totalCost } = computeTotals(cfg);
    expect(totalRevenue).toBe(146_559_065); // Excel col P
    expect(totalCost).toBe(79_618_509); // Excel col R (sau khi add KPI TPKD)
  });

  test("căn B1-14-10 (id=655) — sau khi fix pmg_rate = 7%", () => {
    const cfg: Config = {
      pmgBasePrice: 1_993_053_847,
      pmgRate: 0.07,
      adminFee: 3_850_000,
      cdtBonusSale: 22_000_000,
      pmgSaleRate: 0.07,
      adminFeeSale: 3_850_000,
      customerSupport: 0,
      saleCommissionRate: 0.55,
      kpiCeoRate: 0.035,
      kpiTpkdRate: 0.04,
      kpiAdminRate: 0.0025,
    };
    const { totalRevenue, totalCost } = computeTotals(cfg);
    expect(totalRevenue).toBe(157_663_769);
    // baseNet = (1993053847*0.07 - 3850000)/1.1 - 0 = (139513769 - 3850000)/1.1 = 123330699.09
    // cost = 123330699.09 * (0.55+0.035+0.04+0.0025) + 22M/1.1 + 0 + 0 + 0
    //      = 123330699.09 * 0.6275 + 20_000_000
    //      = 77390013.68 + 20000000
    //      = 97,390,014
    expect(totalCost).toBe(97_390_014);
  });

  test("bug: %PMG_LK = 0 (autofill fail) → revenue collapse âm", () => {
    // Reproduce bug: pmg_rate = 0 → revenue = -admin + cdt = âm gần
    const cfg: Config = {
      pmgBasePrice: 1_993_053_847,
      pmgRate: 0, // ← bug
      adminFee: 3_850_000,
      cdtBonusSale: 22_000_000,
      pmgSaleRate: 0.07,
      adminFeeSale: 3_850_000,
      saleCommissionRate: 0.55,
      kpiCeoRate: 0.035,
      kpiTpkdRate: 0.04,
      kpiAdminRate: 0.0025,
    };
    const { totalRevenue } = computeTotals(cfg);
    // revenue = 0 - 3.85M + 22M = 18.15M (rất thấp so với 157M bình thường)
    expect(totalRevenue).toBe(18_150_000);
    // Lợi nhuận = revenue/1.1 - cost = 16.5M - 97.4M = -80.9M
    const profit = Math.round(totalRevenue / 1.1) - 97_390_014;
    expect(profit).toBeLessThan(-80_000_000);
  });

  test("với pmg_sale_rate < pmg_rate (BRE giữ thặng dư)", () => {
    const cfg: Config = {
      pmgBasePrice: 2_000_000_000,
      pmgRate: 0.08, // CĐT trả 8%
      pmgSaleRate: 0.07, // BRE base HH chỉ 7%
      adminFee: 4_000_000,
      adminFeeSale: 4_000_000,
      saleCommissionRate: 0.5,
    };
    const { totalRevenue, totalCost } = computeTotals(cfg);
    // rev = 2B * 0.08 - 4M = 156M
    expect(totalRevenue).toBe(156_000_000);
    // baseNet = (2B * 0.07 - 4M)/1.1 = 136M/1.1 = 123,636,364
    // cost = 123,636,364 * 0.5 = 61,818,182
    expect(totalCost).toBe(61_818_182);
  });

  test("otherFeePct + otherRevenue + revenueReduction cùng có mặt", () => {
    const cfg: Config = {
      pmgBasePrice: 1_000_000_000,
      pmgRate: 0.05,
      otherFeePct: 0.005,
      otherRevenue: 5_000_000,
      revenueReduction: 2_000_000,
      adminFee: 1_000_000,
      cdtBonusSale: 10_000_000,
    };
    const { totalRevenue } = computeTotals(cfg);
    // = 1B * 0.055 + 5M - 2M - 1M + 10M = 55M + 12M = 67M
    expect(totalRevenue).toBe(67_000_000);
  });
});
