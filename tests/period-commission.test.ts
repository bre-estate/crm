import { describe, test, expect } from "vitest";
import {
  parsePeriodKey,
  periodEndDate,
  periodStartDate,
  periodLabel,
  computeProductPeriod,
  productRevenue,
  computeRetroDiff,
  summarizePeriod,
  type AllContext,
} from "@/lib/period-commission-core";
import {
  nvkdBonus,
  nvkdRate,
  tpkdManagerRate,
  resolvePolicy,
  type CommissionPolicy,
} from "@/lib/commission-policy";

// Chính sách mock — số liệu khớp docs/Chính Sách Lương + seed_commission_policies.ts
const P = (o: Partial<CommissionPolicy> & { role: string; effectiveFrom: string }): CommissionPolicy => ({
  id: 0,
  effectiveTo: null,
  cycleMonths: 2,
  baseRate: null,
  tiers: null,
  baseSalary: null,
  probationSalary: null,
  apprenticeSalary: null,
  bonusFloor: null,
  bonusStep: null,
  bonusStepAmount: null,
  bonusCycleMultiplier: null,
  bonusCapPerCycle: null,
  managerBonusTiers: null,
  managerSalaryTiers: null,
  managerProbationSalary: null,
  ...o,
});
const policies: CommissionPolicy[] = [
  P({ role: "nvkd", effectiveFrom: "2025-04-10", effectiveTo: "2026-04-30", baseRate: 0.5, tiers: [{ threshold: 200_000_000, rate: 0.55 }], bonusFloor: 60_000_000, bonusStep: 80_000_000, bonusStepAmount: 1_000_000, bonusCycleMultiplier: 2, bonusCapPerCycle: 30_000_000 }),
  P({ role: "nvkd", effectiveFrom: "2026-05-01", effectiveTo: "2026-06-30", baseRate: 0.5, tiers: [{ threshold: 400_000_000, rate: 0.55 }], bonusFloor: 60_000_000, bonusStep: 80_000_000, bonusStepAmount: 1_000_000, bonusCycleMultiplier: 2, bonusCapPerCycle: 30_000_000 }),
  P({ role: "nvkd", effectiveFrom: "2026-07-01", baseRate: 0.5, tiers: [{ threshold: 400_000_000, rate: 0.55 }], bonusFloor: 60_000_000, bonusStep: 100_000_000, bonusStepAmount: 1_000_000, bonusCycleMultiplier: 2, bonusCapPerCycle: 30_000_000 }),
  P({ role: "ctv", effectiveFrom: "2025-04-01", baseRate: 0.65 }),
  P({ role: "tpkd", effectiveFrom: "2025-04-01", managerBonusTiers: [{ threshold: 400_000_000, rate: 0.02 }, { threshold: 800_000_000, rate: 0.03 }, { threshold: 1_000_000_000, rate: 0.04 }, { threshold: 1_500_000_000, rate: 0.05 }], managerSalaryTiers: [{ minSubs: 4, salary: 10_000_000 }, { minSubs: 6, salary: 12_000_000 }], managerProbationSalary: 8_000_000 }),
  P({ role: "admin", effectiveFrom: "2025-04-01", effectiveTo: "2026-06-30", baseRate: 0.0025 }),
  P({ role: "admin", effectiveFrom: "2026-07-01", baseRate: 0.005 }),
];

describe("kỳ 2 tháng", () => {
  test("parse + ngày đầu/cuối kỳ", () => {
    expect(parsePeriodKey("2026-P3")).toEqual({ year: 2026, period: 3 });
    expect(parsePeriodKey("2026-P7")).toBeNull();
    expect(parsePeriodKey("abc")).toBeNull();
    expect(periodStartDate({ year: 2026, period: 3 })).toBe("2026-05-01");
    expect(periodEndDate({ year: 2026, period: 3 })).toBe("2026-06-30");
    expect(periodEndDate({ year: 2026, period: 1 })).toBe("2026-02-28");
    expect(periodEndDate({ year: 2028, period: 1 })).toBe("2028-02-29");
    expect(periodLabel({ year: 2026, period: 4 })).toBe("T7-8/2026");
  });

  test("căn thuộc kỳ: Tháng ghi nhận > ngày cọc > đợt doanh thu đầu", () => {
    // HR đưa căn cọc 28/04 vào kỳ T5-6 → điền Tháng ghi nhận 2026-05
    expect(computeProductPeriod({ recognitionMonth: "2026-05", depositDate: "2026-04-28" }, "2026-06-22")).toMatchObject({ key: "2026-P3", basis: "recognition" });
    // Mặc định theo ngày cọc dù doanh thu về tháng 6
    expect(computeProductPeriod({ recognitionMonth: null, depositDate: "2026-04-28" }, "2026-06-22")).toMatchObject({ key: "2026-P2", basis: "deposit" });
    expect(computeProductPeriod({ recognitionMonth: null, depositDate: null }, "2026-06-22")).toMatchObject({ key: "2026-P3", basis: "revenue" });
    expect(computeProductPeriod({ recognitionMonth: null, depositDate: null }, null)).toMatchObject({ key: null, basis: "none" });
  });
});

describe("doanh thu + rate + thưởng theo chính sách", () => {
  test("doanh thu xét tier = PMG × %PMG_LK − phí admin (A1-21-17 = 149.186.720 như bảng HR)", () => {
    expect(productRevenue({ pmgBasePrice: 2_186_238_857, pmgRate: 0.07, adminFee: 3_850_000 })).toBe(149_186_720);
    expect(productRevenue({ pmgBasePrice: 2_276_890_823, pmgRate: 0.07, adminFee: 3_850_000 })).toBe(155_532_358);
  });

  test("NVKD: mốc 200tr đến 30/04/2026, 400tr từ 01/05/2026", () => {
    const old = resolvePolicy(policies, "nvkd", "2026-04-30")!;
    const cur = resolvePolicy(policies, "nvkd", "2026-06-30")!;
    expect(nvkdRate(old, 250_000_000)).toBe(0.55);
    expect(nvkdRate(cur, 250_000_000)).toBe(0.5);
    expect(nvkdRate(cur, 400_000_000)).toBe(0.55);
  });

  test("thưởng doanh số: Trần Minh Nhật 147tr kỳ T5-6/2026 → 2tr (khớp bảng HR)", () => {
    const cur = resolvePolicy(policies, "nvkd", "2026-06-30")!;
    expect(nvkdBonus(cur, 147_430_263)).toBe(2_000_000);
    expect(nvkdBonus(cur, 59_000_000)).toBe(0);
    expect(nvkdBonus(cur, 300_000_000)).toBe(6_000_000); // (300−60)/80 = 3 mốc × 1tr × 2
    expect(nvkdBonus(cur, 5_000_000_000)).toBe(30_000_000); // trần 30tr/kỳ
    const next = resolvePolicy(policies, "nvkd", "2026-08-31")!;
    expect(nvkdBonus(next, 147_430_263)).toBe(0); // step 100tr: (147−60)/100 = 0 mốc
    expect(nvkdBonus(next, 260_000_000)).toBe(4_000_000);
  });

  test("KPI TPKD theo doanh số phòng: Hồ Gia 401,8tr → 2% (khớp QĐ KPI T5-6)", () => {
    const tpkd = resolvePolicy(policies, "tpkd", "2026-06-30")!;
    expect(tpkdManagerRate(tpkd, 401_810_764)).toBe(0.02);
    expect(tpkdManagerRate(tpkd, 300_000_000)).toBe(0);
    expect(tpkdManagerRate(tpkd, 900_000_000)).toBe(0.03);
    expect(tpkdManagerRate(tpkd, 1_200_000_000)).toBe(0.04);
    expect(tpkdManagerRate(tpkd, 2_000_000_000)).toBe(0.05);
  });

  test("chênh hồi tố = amount × (expected/actual − 1)", () => {
    expect(computeRetroDiff(65_212_352, 0.5, 0.55)).toBe(6_521_235);
    expect(computeRetroDiff(3_000_000, 0.03, 0.02)).toBe(-1_000_000);
    expect(computeRetroDiff(3_000_000, 0.03, 0.03)).toBe(0);
    expect(computeRetroDiff(3_000_000, 0, 0.03)).toBe(0);
    expect(computeRetroDiff(0, 0.5, 0.55)).toBe(0);
  });
});

describe("summarizePeriod", () => {
  const emp = (id: number, name: string, position: string, departmentId: number | null, owner?: { name: string; position: string; departmentId: number | null }) => ({
    id, name, position, departmentId,
    ownerName: owner?.name ?? name,
    ownerPosition: owner?.position ?? position,
    ownerDepartmentId: owner?.departmentId ?? departmentId,
  });
  const ctx: AllContext = {
    policies,
    empByName: new Map([
      ["trần minh nhật", emp(10, "Trần Minh Nhật", "nvkd", 14)],
      ["hồ nguyễn công thành", emp(3, "Hồ Nguyễn Công Thành", "tpkd", 14)],
      ["đoàn lê bách", emp(1, "Đoàn Lê Bách", "ceo", 13)],
      ["võ thị thu thảo", emp(16, "Võ Thị Thu Thảo", "nvkd", 13, { name: "Đoàn Lê Bách", position: "ceo", departmentId: 13 })],
      ["hồ thị lan viên", emp(43, "Hồ Thị Lan Viên", "admin", null)],
    ]),
    depts: new Map([
      [13, { id: 13, name: "BLĐ", leaderName: "Đoàn Lê Bách" }],
      [14, { id: 14, name: "Kinh doanh - Hồ Gia", leaderName: "Hồ Nguyễn Công Thành" }],
    ]),
    products: [
      { id: 1, productCode: "X_A", unitCode: "A", projectName: "P", salesPerson: "Trần Minh Nhật", ownerName: "Trần Minh Nhật", ownerPosition: "nvkd", departmentId: 14, deptName: "Kinh doanh - Hồ Gia", depositDate: "2026-05-02", recognitionMonth: null, periodKey: "2026-P3", periodBasis: "deposit", revenue: 250_000_000 },
      { id: 2, productCode: "X_B", unitCode: "B", projectName: "P", salesPerson: "Trần Minh Nhật", ownerName: "Trần Minh Nhật", ownerPosition: "nvkd", departmentId: 14, deptName: "Kinh doanh - Hồ Gia", depositDate: "2026-06-10", recognitionMonth: null, periodKey: "2026-P3", periodBasis: "deposit", revenue: 200_000_000 },
      { id: 3, productCode: "X_C", unitCode: "C", projectName: "P", salesPerson: "Võ Thị Thu Thảo", ownerName: "Đoàn Lê Bách", ownerPosition: "ceo", departmentId: 13, deptName: "BLĐ", depositDate: "2026-05-20", recognitionMonth: null, periodKey: "2026-P3", periodBasis: "deposit", revenue: 450_000_000 },
      { id: 4, productCode: "X_D", unitCode: "D", projectName: "P", salesPerson: "Trần Minh Nhật", ownerName: "Trần Minh Nhật", ownerPosition: "nvkd", departmentId: 14, deptName: "Kinh doanh - Hồ Gia", depositDate: "2026-07-05", recognitionMonth: null, periodKey: "2026-P4", periodBasis: "deposit", revenue: 500_000_000 },
    ],
    recons: [
      { id: 101, productId: 1, costType: "sale_commission", employeeName: "Trần Minh Nhật", ownerName: "Trần Minh Nhật", reconciliationDate: "2026-05-30", commissionRate: 0.5, kpiRate: 0, amount: 50_000_000, paymentProgressPct: 0.7, pmgLkSaleRate: 0.07, pmgBasePriceSale: 0, adminFeeSale: 3_850_000, customerSupport: 0, note: null, paid: 50_000_000 },
      { id: 102, productId: 1, costType: "kpi_tpkd", employeeName: "Hồ Nguyễn Công Thành", ownerName: "Hồ Nguyễn Công Thành", reconciliationDate: "2026-05-30", commissionRate: 0, kpiRate: 0.03, amount: 3_000_000, paymentProgressPct: 0.7, pmgLkSaleRate: 0.07, pmgBasePriceSale: 0, adminFeeSale: 0, customerSupport: 0, note: null, paid: 0 },
      { id: 103, productId: 2, costType: "kpi_admin", employeeName: "Hồ Thị Lan Viên", ownerName: "Hồ Thị Lan Viên", reconciliationDate: "2026-06-30", commissionRate: 0, kpiRate: 0.0025, amount: 300_000, paymentProgressPct: 0, pmgLkSaleRate: 0.07, pmgBasePriceSale: 0, adminFeeSale: 0, customerSupport: 0, note: null, paid: 300_000 },
      { id: 104, productId: 3, costType: "sale_commission", employeeName: "Võ Thị Thu Thảo", ownerName: "Đoàn Lê Bách", reconciliationDate: "2026-06-01", commissionRate: 0.5, kpiRate: 0, amount: 10_000_000, paymentProgressPct: 1, pmgLkSaleRate: 0.07, pmgBasePriceSale: 0, adminFeeSale: 0, customerSupport: 0, note: null, paid: 0 },
      // Hồi tố đã tạo cho #104 → không đề xuất lại
      { id: 105, productId: 3, costType: "sale_commission", employeeName: "Võ Thị Thu Thảo", ownerName: "Đoàn Lê Bách", reconciliationDate: "2026-07-02", commissionRate: 0.55, kpiRate: 0, amount: 1_000_000, paymentProgressPct: 1, pmgLkSaleRate: 0.07, pmgBasePriceSale: 0, adminFeeSale: 0, customerSupport: 0, note: "Hồi tố kỳ 2026-P3: 50% → 55% (từ ĐC #104)", paid: 0 },
    ],
  };

  test("NVKD vượt mốc 400tr → 55%, chênh 10% trên HH đã ĐC 50%", () => {
    const s = summarizePeriod(ctx, "2026-P3")!;
    const nhat = s.nvkd.find((r) => r.name === "Trần Minh Nhật")!;
    expect(nhat.revenue).toBe(450_000_000);
    expect(nhat.expectedRate).toBe(0.55);
    expect(nhat.hhReconciled).toBe(50_000_000);
    expect(nhat.diff).toBe(5_000_000);
    expect(nhat.hhExpected).toBe(55_000_000);
    expect(nhat.bonus).toBe(8_000_000); // (450−60)/80 = 4 mốc × 1tr × 2
    expect(s.totals.unitCount).toBe(3);
  });

  test("alias gộp về owner, CEO không thưởng doanh số", () => {
    const s = summarizePeriod(ctx, "2026-P3")!;
    const bach = s.nvkd.find((r) => r.name === "Đoàn Lê Bách")!;
    expect(bach.revenue).toBe(450_000_000);
    expect(bach.expectedRate).toBe(0.55);
    expect(bach.bonus).toBe(0);
    expect(s.nvkd.find((r) => r.name === "Võ Thị Thu Thảo")).toBeUndefined();
  });

  test("phòng Hồ Gia 450tr → tier 2%, KPI đã ĐC 3% → chi dư −1tr", () => {
    const s = summarizePeriod(ctx, "2026-P3")!;
    const hoGia = s.depts.find((d) => d.deptId === 14)!;
    expect(hoGia.revenue).toBe(450_000_000);
    expect(hoGia.expectedRate).toBe(0.02);
    expect(hoGia.diff).toBe(-1_000_000);
    expect(hoGia.nvkdCount).toBe(1);
    expect(hoGia.leaderSalary).toBe(8_000_000); // tập sự <4 NVKD
    // BLĐ không có TPKD → không xét KPI TPKD
    expect(s.depts.find((d) => d.deptId === 13)).toBeUndefined();
  });

  test("retro items: hồi tố +, chi dư −, bỏ qua ĐC đã có hồi tố, admin đúng rate không chênh", () => {
    const s = summarizePeriod(ctx, "2026-P3")!;
    const byId = Object.fromEntries(s.retro.map((r) => [r.reconId, r]));
    expect(byId[101]).toMatchObject({ diff: 5_000_000, actualRate: 0.5, expectedRate: 0.55, alreadyRetro: false });
    expect(byId[102]).toMatchObject({ diff: -1_000_000, alreadyRetro: false });
    expect(byId[104]).toMatchObject({ diff: 1_000_000, alreadyRetro: true, retroReconId: 105 });
    expect(byId[103]).toBeUndefined();
    expect(byId[105]).toBeUndefined(); // rate 0.55 = mong đợi → không chênh
    expect(s.totals.retroPlus).toBe(5_000_000);
    expect(s.totals.retroMinus).toBe(-1_000_000);
    expect(s.totals.retroPending).toBe(2);
  });

  test("kỳ T7-8/2026 dùng chính sách 260701 (step thưởng 100tr, admin 0,5%)", () => {
    const s = summarizePeriod(ctx, "2026-P4")!;
    const nhat = s.nvkd.find((r) => r.name === "Trần Minh Nhật")!;
    expect(nhat.revenue).toBe(500_000_000);
    expect(nhat.expectedRate).toBe(0.55);
    expect(nhat.bonus).toBe(8_000_000); // (500−60)/100 = 4 mốc × 2
    expect(s.adminExpectedRate).toBe(0.005);
  });
});
