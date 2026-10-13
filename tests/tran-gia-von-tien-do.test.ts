import { describe, it, expect } from "vitest";
import { computeLuyKe, usesProgressN } from "@/lib/costCalc";

/**
 * Căn A.05.09 thật, HR Nga phát hiện 13/10/2026.
 * Trần phải nhân tiến độ, nếu không sẽ bỏ lọt chi vượt.
 */
const A0509 = {
  pmgBasePrice: 5_992_067_643,
  pmgSaleRate: 0.045,
  adminFeeSale: 3_300_000,
  customerSupport: 27_236_671,
  saleCommissionRate: 0,
  kpiCeoRate: 0.035,
  kpiTpkdRate: 0,
  kpiAdminRate: 0.0025,
  bonusSale: 0,
  bonusManager: 0,
  cdtBonusSale: 0,
  cdtBonusManager: 0,
};

describe("trần giá vốn phải theo tiến độ", () => {
  it("KPI CEO ở 90% ra đúng số kế toán tính", () => {
    expect(computeLuyKe(A0509, "kpi_ceo", 0.9)).toBe(6_663_313);
  });

  it("KPI CEO ở 100% cao hơn, nên truyền cứng 1 là bỏ lọt chi vượt", () => {
    const o90 = computeLuyKe(A0509, "kpi_ceo", 0.9);
    const o100 = computeLuyKe(A0509, "kpi_ceo", 1);
    expect(o100).toBe(7_521_268);
    // Đã chi 7.616.596: ở 90% lố 953.283, ở 100% chỉ lố 95.328.
    expect(7_616_596 - o90).toBe(953_283);
    expect(7_616_596 - o100).toBe(95_328);
  });

  it("KPI Admin KHÔNG nhân tiến độ, chốt với HR ngày 13/10/2026", () => {
    expect(usesProgressN("kpi_admin")).toBe(false);
    expect(computeLuyKe(A0509, "kpi_admin", 0.5)).toBe(
      computeLuyKe(A0509, "kpi_admin", 1),
    );
  });

  it("loại nào nhân tiến độ, loại nào không", () => {
    expect(usesProgressN("sale_commission")).toBe(true);
    expect(usesProgressN("kpi_ceo")).toBe(true);
    expect(usesProgressN("kpi_tpkd")).toBe(true);
    expect(usesProgressN("kpi_admin")).toBe(false);
    expect(usesProgressN("cdt_bonus_sale")).toBe(false);
  });
});
