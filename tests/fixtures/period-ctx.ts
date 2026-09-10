import type { CommissionPolicy } from "@/lib/commission-policy";
import type { AllContext, ProductInPeriod, ReconLite } from "@/lib/period-commission-core";

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

export const policies: CommissionPolicy[] = [
  P({ role: "nvkd", effectiveFrom: "2026-05-01", effectiveTo: "2026-06-30", baseRate: 0.5, tiers: [{ threshold: 400_000_000, rate: 0.55 }], bonusFloor: 60_000_000, bonusStep: 80_000_000, bonusStepAmount: 1_000_000, bonusCycleMultiplier: 2, bonusCapPerCycle: 30_000_000 }),
  P({ role: "ctv", effectiveFrom: "2026-05-01", baseRate: 0.65 }),
  P({ role: "tpkd", effectiveFrom: "2025-04-01", managerBonusTiers: [{ threshold: 400_000_000, rate: 0.02 }, { threshold: 800_000_000, rate: 0.03 }, { threshold: 1_000_000_000, rate: 0.04 }, { threshold: 1_500_000_000, rate: 0.05 }], managerSalaryTiers: [{ minSubs: 4, salary: 10_000_000 }], managerProbationSalary: 8_000_000 }),
  P({ role: "admin", effectiveFrom: "2025-04-01", effectiveTo: "2026-06-30", baseRate: 0.0025 }),
];

const prod = (o: Partial<ProductInPeriod> & { id: number; unitCode: string; ownerName: string; revenue: number }): ProductInPeriod => ({
  productCode: `X_${o.unitCode}`,
  projectName: "The Emerald Garden View",
  salesPerson: o.ownerName,
  ownerPosition: "nvkd",
  departmentId: 14,
  deptName: "Kinh doanh - Hồ Gia",
  depositDate: "2026-05-02",
  recognitionMonth: null,
  periodKey: "2026-P3",
  periodBasis: "deposit",
  ...o,
});

const recon = (o: Partial<ReconLite> & { id: number; productId: number; costType: string; employeeName: string; amount: number }): ReconLite => ({
  ownerName: o.employeeName,
  reconciliationDate: "2026-05-30",
  commissionRate: 0,
  kpiRate: 0,
  paymentProgressPct: 0.7,
  pmgLkSaleRate: 0.07,
  pmgBasePriceSale: 2_000_000_000,
  adminFeeSale: 3_850_000,
  customerSupport: 0,
  note: null,
  paid: 0,
  ...o,
});

/** Kỳ 2026-P3: Nhật 2 căn 450tr (vượt mốc 400tr), Thành TPKD phòng 14, Admin. */
export function makeCtx(): AllContext {
  return {
    policies,
    empByName: new Map([
      ["trần minh nhật", { id: 10, name: "Trần Minh Nhật", position: "nvkd", departmentId: 14, ownerName: "Trần Minh Nhật", ownerPosition: "nvkd", ownerDepartmentId: 14 }],
      ["hồ nguyễn công thành", { id: 3, name: "Hồ Nguyễn Công Thành", position: "tpkd", departmentId: 14, ownerName: "Hồ Nguyễn Công Thành", ownerPosition: "tpkd", ownerDepartmentId: 14 }],
      ["hồ thị lan viên", { id: 43, name: "Hồ Thị Lan Viên", position: "admin", departmentId: null, ownerName: "Hồ Thị Lan Viên", ownerPosition: "admin", ownerDepartmentId: null }],
    ]),
    depts: new Map([[14, { id: 14, name: "Kinh doanh - Hồ Gia", leaderName: "Hồ Nguyễn Công Thành" }]]),
    products: [
      prod({ id: 1, unitCode: "A", ownerName: "Trần Minh Nhật", revenue: 250_000_000 }),
      prod({ id: 2, unitCode: "B", ownerName: "Trần Minh Nhật", revenue: 200_000_000, depositDate: "2026-06-10" }),
    ],
    recons: [
      recon({ id: 101, productId: 1, costType: "sale_commission", employeeName: "Trần Minh Nhật", commissionRate: 0.5, amount: 50_000_000, paid: 50_000_000 }),
      recon({ id: 102, productId: 1, costType: "kpi_tpkd", employeeName: "Hồ Nguyễn Công Thành", kpiRate: 0.03, amount: 3_000_000 }),
      recon({ id: 103, productId: 2, costType: "kpi_admin", employeeName: "Hồ Thị Lan Viên", kpiRate: 0.0025, amount: 300_000, paymentProgressPct: 0 }),
    ],
  };
}
