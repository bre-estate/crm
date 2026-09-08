/**
 * Utilities cho commission policies:
 * - Resolve policy hiện hành theo (role, date)
 * - Compute rate theo tier (NVKD lũy kế cá nhân, TPKD tier phòng)
 * - Compute thưởng doanh số NVKD (floor((doanh_thu − sàn) / step) × 1tr × 2)
 * - Compute kỳ 2 tháng (period) từ date
 *
 * KHÔNG query DB trực tiếp — nhận policies/data từ caller. Cho phép server
 * component + client component đều dùng chung logic.
 */
export type Role = "nvkd" | "ctv" | "tpkd" | "admin";

export type Tier = { threshold: number; rate: number };
export type SalaryTier = { minSubs: number; salary: number };

export type CommissionPolicy = {
  id: number;
  role: string;
  effectiveFrom: string | Date;
  effectiveTo: string | Date | null;
  cycleMonths: number;
  baseRate: number | string | null;
  tiers: Tier[] | null;
  baseSalary: number | string | null;
  probationSalary: number | string | null;
  apprenticeSalary: number | string | null;
  bonusFloor: number | string | null;
  bonusStep: number | string | null;
  bonusStepAmount: number | string | null;
  bonusCycleMultiplier: number | string | null;
  bonusCapPerCycle: number | string | null;
  managerBonusTiers: Tier[] | null;
  managerSalaryTiers: SalaryTier[] | null;
  managerProbationSalary: number | string | null;
  note?: string | null;
};

/** Normalize date to YYYY-MM-DD string for comparison. */
export function toYmd(d: string | Date | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve policy hiện hành cho (role, date). Return null nếu không tìm thấy.
 * date default = today (ISO YYYY-MM-DD).
 */
export function resolvePolicy(
  policies: CommissionPolicy[],
  role: Role,
  date: string,
): CommissionPolicy | null {
  const ymd = toYmd(date);
  const matches = policies.filter((p) => {
    if (p.role !== role) return false;
    const from = toYmd(p.effectiveFrom);
    const to = p.effectiveTo ? toYmd(p.effectiveTo) : null;
    return from <= ymd && (to === null || ymd <= to);
  });
  if (matches.length === 0) return null;
  // Nếu nhiều policy overlap, chọn cái có effective_from mới nhất
  return matches.sort((a, b) => toYmd(b.effectiveFrom).localeCompare(toYmd(a.effectiveFrom)))[0];
}

/**
 * Kỳ 2 tháng (period) từ date. Cặp 1-2, 3-4, 5-6, ...
 * Return { year, period, startDate, endDate }.
 */
export function periodOf(date: string): {
  year: number;
  period: number;
  startMonth: number;
  endMonth: number;
  key: string;
} {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1..12
  const period = Math.ceil(m / 2); // 1..6
  const startMonth = (period - 1) * 2 + 1;
  const endMonth = startMonth + 1;
  return {
    year: y,
    period,
    startMonth,
    endMonth,
    key: `${y}-P${period}`,
  };
}

/** All month strings YYYY-MM within period. VD period 2 → ["2026-03", "2026-04"]. */
export function periodMonths(year: number, period: number): string[] {
  const startMonth = (period - 1) * 2 + 1;
  return [
    `${year}-${String(startMonth).padStart(2, "0")}`,
    `${year}-${String(startMonth + 1).padStart(2, "0")}`,
  ];
}

/**
 * Tier rate cho NVKD dựa vào tổng doanh số cá nhân trong kỳ.
 * Return rate percentage (VD 0.55 = 55%).
 */
export function nvkdRate(policy: CommissionPolicy, personalRevenue: number): number {
  const base = num(policy.baseRate) ?? 0;
  const tiers = policy.tiers ?? [];
  // Sort tiers ascending threshold
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  let rate = base;
  for (const t of sorted) {
    if (personalRevenue >= t.threshold) rate = t.rate;
  }
  return rate;
}

/**
 * Tier rate cho TPKD (HH quản lý) dựa vào doanh số phòng trong kỳ.
 * Return rate (VD 0.02 = 2%).
 */
export function tpkdManagerRate(policy: CommissionPolicy, deptRevenue: number): number {
  const tiers = policy.managerBonusTiers ?? [];
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  let rate = 0;
  for (const t of sorted) {
    if (deptRevenue >= t.threshold) rate = t.rate;
  }
  return rate;
}

/**
 * Thưởng doanh số NVKD:
 *   thưởng = floor(max(0, doanh_thu − sàn) / step) × step_amount × cycle_multiplier
 *   cap: bonus_cap_per_cycle
 */
export function nvkdBonus(policy: CommissionPolicy, personalRevenue: number): number {
  const floor = num(policy.bonusFloor) ?? 0;
  const step = num(policy.bonusStep) ?? 0;
  const stepAmount = num(policy.bonusStepAmount) ?? 0;
  const mult = num(policy.bonusCycleMultiplier) ?? 1;
  const cap = num(policy.bonusCapPerCycle);
  if (step <= 0 || stepAmount <= 0) return 0;
  const excess = Math.max(0, personalRevenue - floor);
  const tiers = Math.floor(excess / step);
  const bonus = tiers * stepAmount * mult;
  if (cap != null) return Math.min(bonus, cap);
  return bonus;
}

/**
 * Lương TPKD dựa vào số NVKD phòng.
 * Tier "minSubs" ≥ N → salary. Ngược lại (tập sự <4) → manager_probation_salary.
 */
export function tpkdSalary(policy: CommissionPolicy, subCount: number): number {
  const tiers = policy.managerSalaryTiers ?? [];
  const sorted = [...tiers].sort((a, b) => a.minSubs - b.minSubs);
  let salary = num(policy.managerProbationSalary) ?? num(policy.baseSalary) ?? 0;
  for (const t of sorted) {
    if (subCount >= t.minSubs) salary = t.salary;
  }
  return salary;
}

/** Numeric coercion (handle PG numeric string). */
function num(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
export { num };
