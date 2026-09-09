/**
 * Kỳ hoa hồng & thưởng (2 tháng) — phần PURE, không import DB.
 * Spec: docs/SPEC_KY_HOA_HONG.md. Test: tests/period-commission.test.ts.
 */
import {
  resolvePolicy,
  nvkdRate,
  tpkdManagerRate,
  nvkdBonus,
  tpkdSalary,
  type CommissionPolicy,
  type Role,
} from "@/lib/commission-policy";

// ───────────────────────── Kỳ ─────────────────────────

export type PeriodRef = { year: number; period: number };

export function parsePeriodKey(key: string): PeriodRef | null {
  const m = /^(\d{4})-P([1-6])$/.exec(key ?? "");
  if (!m) return null;
  return { year: Number(m[1]), period: Number(m[2]) };
}

export function periodKeyOf(year: number, period: number): string {
  return `${year}-P${period}`;
}

export function periodOfMonth(year: number, month: number): PeriodRef {
  return { year, period: Math.ceil(month / 2) };
}

export function periodMonths(p: PeriodRef): [number, number] {
  const m1 = (p.period - 1) * 2 + 1;
  return [m1, m1 + 1];
}

export function periodLabel(p: PeriodRef): string {
  const [m1, m2] = periodMonths(p);
  return `T${m1}-${m2}/${p.year}`;
}

/** Ngày cuối kỳ YYYY-MM-DD (resolve chính sách áp cho kỳ). */
export function periodEndDate(p: PeriodRef): string {
  const [, m2] = periodMonths(p);
  const last = new Date(Date.UTC(p.year, m2, 0)).getUTCDate();
  return `${p.year}-${String(m2).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export function periodStartDate(p: PeriodRef): string {
  const [m1] = periodMonths(p);
  return `${p.year}-${String(m1).padStart(2, "0")}-01`;
}

export function currentPeriodKey(today = new Date()): string {
  const ref = periodOfMonth(today.getFullYear(), today.getMonth() + 1);
  return periodKeyOf(ref.year, ref.period);
}

// ───────────────────────── Căn thuộc kỳ ─────────────────────────

export type PeriodBasis = "recognition" | "revenue" | "deposit" | "none";

export const PERIOD_BASIS_LABEL: Record<PeriodBasis, string> = {
  recognition: "Tháng ghi nhận",
  revenue: "Đợt doanh thu đầu",
  deposit: "Ngày cọc",
  none: "Chưa xác định",
};

/**
 * Ưu tiên: Tháng ghi nhận > ngày cọc > đợt doanh thu đầu tiên (>0).
 * Chính sách nói "doanh thu sản phẩm đã cọc" nên mặc định theo ngày cọc; căn HR
 * muốn dời sang kỳ sau (VD cọc 28/04 tính vào T5-6) thì điền Tháng ghi nhận.
 */
export function computeProductPeriod(
  p: { recognitionMonth: string | null; depositDate: string | null },
  firstRevenueDate: string | null,
): { key: string | null; basis: PeriodBasis; ref: PeriodRef | null } {
  const pick = (ym: string | null, basis: PeriodBasis) => {
    if (!ym) return null;
    const m = /^(\d{4})-(\d{2})/.exec(ym);
    if (!m) return null;
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    const ref = periodOfMonth(Number(m[1]), month);
    return { key: periodKeyOf(ref.year, ref.period), basis, ref };
  };
  return (
    pick(p.recognitionMonth, "recognition") ??
    pick(p.depositDate, "deposit") ??
    pick(firstRevenueDate, "revenue") ?? { key: null, basis: "none" as PeriodBasis, ref: null }
  );
}

/** Doanh thu xét tier = PMG × %PMG_LK − phí admin (gross, không gồm CĐT thưởng nóng). */
export function productRevenue(p: {
  pmgBasePrice: number | string | null;
  pmgRate: number | string | null;
  adminFee: number | string | null;
}): number {
  const L = Number(p.pmgBasePrice ?? 0);
  const M = Number(p.pmgRate ?? 0);
  const Q = Number(p.adminFee ?? 0);
  return Math.max(0, Math.round(L * M - Q));
}

/** Vai trò xét HH sale theo position nhân viên. */
export function saleRoleFor(position: string | null | undefined): Role | null {
  switch (position) {
    case "nvkd":
    case "tpkd":
    case "ceo":
      return "nvkd";
    case "ctv":
      return "ctv";
    default:
      return null;
  }
}

/** chênh = amount × (expected / actual − 1). actual hoặc amount = 0 → 0. */
export function computeRetroDiff(amount: number, actualRate: number, expectedRate: number): number {
  if (!amount || !actualRate || actualRate <= 0) return 0;
  if (Math.abs(expectedRate - actualRate) < 1e-6) return 0;
  return Math.round(amount * (expectedRate / actualRate - 1));
}

// ───────────────────────── Types ─────────────────────────

export type EmpInfo = {
  id: number;
  name: string;
  position: string;
  departmentId: number | null;
  ownerName: string;
  ownerPosition: string;
  ownerDepartmentId: number | null;
};

export type ProductInPeriod = {
  id: number;
  productCode: string;
  unitCode: string;
  projectName: string | null;
  salesPerson: string | null;
  ownerName: string;
  ownerPosition: string | null;
  departmentId: number | null;
  deptName: string | null;
  depositDate: string | null;
  recognitionMonth: string | null;
  periodKey: string | null;
  periodBasis: PeriodBasis;
  revenue: number;
};

export type ReconLite = {
  id: number;
  productId: number;
  costType: string;
  employeeName: string;
  ownerName: string;
  reconciliationDate: string | null;
  commissionRate: number;
  kpiRate: number;
  amount: number;
  paymentProgressPct: number;
  pmgLkSaleRate: number;
  pmgBasePriceSale: number;
  adminFeeSale: number;
  customerSupport: number;
  note: string | null;
  paid: number;
};

export type RetroItem = {
  reconId: number;
  productId: number;
  productCode: string;
  unitCode: string;
  employeeName: string;
  costType: string;
  reconciliationDate: string | null;
  amount: number;
  actualRate: number;
  expectedRate: number;
  diff: number;
  alreadyRetro: boolean;
  retroReconId: number | null;
};

export type NvkdRow = {
  name: string;
  position: string;
  deptName: string | null;
  role: Role | null;
  unitCount: number;
  revenue: number;
  expectedRate: number | null;
  hhReconciled: number;
  hhExpected: number;
  diff: number;
  paid: number;
  bonus: number;
  units: { unitCode: string; productCode: string; revenue: number; rates: number[] }[];
};

export type DeptRow = {
  deptId: number;
  deptName: string;
  leaderName: string | null;
  unitCount: number;
  revenue: number;
  expectedRate: number;
  kpiReconciled: number;
  kpiExpected: number;
  diff: number;
  paid: number;
  leaderSalary: number | null;
  nvkdCount: number;
  units: {
    unitCode: string;
    productCode: string;
    ownerName: string;
    depositDate: string | null;
    projectName: string | null;
    revenue: number;
    kpiRate: number | null;
    kpiAmount: number;
    reconIds: number[];
  }[];
};

export type AdminUnitRow = {
  unitCode: string;
  productCode: string;
  productId: number;
  reconId: number | null;
  employeeName: string | null;
  actualRate: number | null;
  amount: number;
  diff: number;
};

export type PeriodSummary = {
  key: string;
  ref: PeriodRef;
  label: string;
  endDate: string;
  policies: Partial<Record<Role, CommissionPolicy | null>>;
  products: ProductInPeriod[];
  nvkd: NvkdRow[];
  depts: DeptRow[];
  adminExpectedRate: number | null;
  adminUnits: AdminUnitRow[];
  ceoUnits: AdminUnitRow[];
  retro: RetroItem[];
  totals: {
    revenue: number;
    unitCount: number;
    retroPlus: number;
    retroMinus: number;
    retroPending: number;
    bonusTotal: number;
  };
};

export type AllContext = {
  policies: CommissionPolicy[];
  empByName: Map<string, EmpInfo>;
  depts: Map<number, { id: number; name: string; leaderName: string | null }>;
  products: ProductInPeriod[];
  recons: ReconLite[];
};

export const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// ───────────────────────── Summarize ─────────────────────────

const RETRO_SRC_RE = /từ ĐC #(\d+)/;

export function summarizePeriod(ctx: AllContext, key: string): PeriodSummary | null {
  const ref = parsePeriodKey(key);
  if (!ref) return null;
  const endDate = periodEndDate(ref);
  const pol = {
    nvkd: resolvePolicy(ctx.policies, "nvkd", endDate),
    ctv: resolvePolicy(ctx.policies, "ctv", endDate),
    tpkd: resolvePolicy(ctx.policies, "tpkd", endDate),
    admin: resolvePolicy(ctx.policies, "admin", endDate),
  };

  const prods = ctx.products.filter((p) => p.periodKey === key);
  const prodById = new Map(prods.map((p) => [p.id, p]));
  const reconsInPeriod = ctx.recons.filter((r) => prodById.has(r.productId));

  const retroBySource = new Map<number, number>();
  for (const r of ctx.recons) {
    const m = RETRO_SRC_RE.exec(r.note ?? "");
    if (m) retroBySource.set(Number(m[1]), r.id);
  }

  // ── NVKD ──
  const byOwner = new Map<string, ProductInPeriod[]>();
  for (const p of prods) {
    const k = p.ownerName || "(trống)";
    if (!byOwner.has(k)) byOwner.set(k, []);
    byOwner.get(k)!.push(p);
  }
  const expectedSaleRateByOwner = new Map<string, number | null>();
  const nvkdRows: NvkdRow[] = [];
  for (const [owner, list] of byOwner) {
    const emp = ctx.empByName.get(norm(owner));
    const position = emp?.ownerPosition ?? emp?.position ?? "";
    const role = saleRoleFor(position);
    const revenue = list.reduce((s, p) => s + p.revenue, 0);
    let expectedRate: number | null = null;
    if (role === "ctv" && pol.ctv) expectedRate = Number(pol.ctv.baseRate ?? 0);
    else if (role === "nvkd" && pol.nvkd) expectedRate = nvkdRate(pol.nvkd, revenue);
    expectedSaleRateByOwner.set(owner, expectedRate);

    const saleRecons = reconsInPeriod.filter(
      (r) => r.costType === "sale_commission" && r.ownerName === owner,
    );
    const hhReconciled = saleRecons.reduce((s, r) => s + r.amount, 0);
    const paid = saleRecons.reduce((s, r) => s + r.paid, 0);
    const diff =
      expectedRate == null
        ? 0
        : saleRecons.reduce((s, r) => s + computeRetroDiff(r.amount, r.commissionRate, expectedRate), 0);
    const bonus = position === "nvkd" && pol.nvkd ? nvkdBonus(pol.nvkd, revenue) : 0;
    const deptId = emp?.ownerDepartmentId ?? list[0]?.departmentId ?? null;
    nvkdRows.push({
      name: owner,
      position,
      deptName: deptId != null ? (ctx.depts.get(deptId)?.name ?? null) : null,
      role,
      unitCount: list.length,
      revenue,
      expectedRate,
      hhReconciled,
      hhExpected: hhReconciled + diff,
      diff,
      paid,
      bonus,
      units: list.map((p) => ({
        unitCode: p.unitCode,
        productCode: p.productCode,
        revenue: p.revenue,
        rates: saleRecons.filter((r) => r.productId === p.id).map((r) => r.commissionRate),
      })),
    });
  }
  nvkdRows.sort((a, b) => b.revenue - a.revenue);

  // ── Phòng / TPKD ──
  const byDept = new Map<number, ProductInPeriod[]>();
  for (const p of prods) {
    if (p.departmentId == null) continue;
    if (!byDept.has(p.departmentId)) byDept.set(p.departmentId, []);
    byDept.get(p.departmentId)!.push(p);
  }
  const expectedTpkdRateByDept = new Map<number, number>();
  const deptRows: DeptRow[] = [];
  for (const [deptId, list] of byDept) {
    const d = ctx.depts.get(deptId);
    // Chỉ phòng kinh doanh có TPKD mới xét KPI TPKD (bỏ BLĐ, CTV, Hành chính...)
    let hasTpkd = false;
    for (const e of ctx.empByName.values()) {
      if (e.ownerName === e.name && e.position === "tpkd" && e.departmentId === deptId) hasTpkd = true;
    }
    if (!hasTpkd) continue;
    const revenue = list.reduce((s, p) => s + p.revenue, 0);
    const expectedRate = pol.tpkd ? tpkdManagerRate(pol.tpkd, revenue) : 0;
    expectedTpkdRateByDept.set(deptId, expectedRate);
    const ids = new Set(list.map((p) => p.id));
    const kpiRecons = reconsInPeriod.filter((r) => r.costType === "kpi_tpkd" && ids.has(r.productId));
    const kpiReconciled = kpiRecons.reduce((s, r) => s + r.amount, 0);
    const paid = kpiRecons.reduce((s, r) => s + r.paid, 0);
    const diff = kpiRecons.reduce((s, r) => s + computeRetroDiff(r.amount, r.kpiRate, expectedRate), 0);
    let nvkdCount = 0;
    for (const e of ctx.empByName.values()) {
      if (e.ownerName === e.name && e.position === "nvkd" && e.departmentId === deptId) nvkdCount++;
    }
    deptRows.push({
      deptId,
      deptName: d?.name ?? `Phòng #${deptId}`,
      leaderName: d?.leaderName ?? null,
      unitCount: list.length,
      revenue,
      expectedRate,
      kpiReconciled,
      kpiExpected: kpiReconciled + diff,
      diff,
      paid,
      leaderSalary: pol.tpkd ? tpkdSalary(pol.tpkd, nvkdCount) : null,
      nvkdCount,
      units: list.map((p) => {
        const rs = kpiRecons.filter((r) => r.productId === p.id);
        return {
          unitCode: p.unitCode,
          productCode: p.productCode,
          ownerName: p.ownerName,
          depositDate: p.depositDate,
          projectName: p.projectName,
          revenue: p.revenue,
          kpiRate: rs.length ? rs[rs.length - 1].kpiRate : null,
          kpiAmount: rs.reduce((s, r) => s + r.amount, 0),
          reconIds: rs.map((r) => r.id),
        };
      }),
    });
  }
  deptRows.sort((a, b) => b.revenue - a.revenue);

  // ── Admin / CEO ──
  const adminExpectedRate = pol.admin ? Number(pol.admin.baseRate ?? 0) : null;
  const unitRows = (costType: "kpi_admin" | "kpi_ceo", expected: number | null): AdminUnitRow[] =>
    prods.map((p) => {
      const rs = reconsInPeriod.filter((r) => r.costType === costType && r.productId === p.id);
      const last = rs[rs.length - 1];
      const amount = rs.reduce((s, r) => s + r.amount, 0);
      const diff =
        expected == null ? 0 : rs.reduce((s, r) => s + computeRetroDiff(r.amount, r.kpiRate, expected), 0);
      return {
        unitCode: p.unitCode,
        productCode: p.productCode,
        productId: p.id,
        reconId: last?.id ?? null,
        employeeName: last?.employeeName ?? null,
        actualRate: last ? last.kpiRate : null,
        amount,
        diff,
      };
    });
  const adminUnits = unitRows("kpi_admin", adminExpectedRate);
  const ceoUnits = unitRows("kpi_ceo", null);

  // ── Retro ──
  const retro: RetroItem[] = [];
  for (const r of reconsInPeriod) {
    const p = prodById.get(r.productId)!;
    let expected: number | null = null;
    let actual = 0;
    if (r.costType === "sale_commission") {
      expected = expectedSaleRateByOwner.get(r.ownerName) ?? null;
      actual = r.commissionRate;
    } else if (r.costType === "kpi_tpkd") {
      expected = p.departmentId != null ? (expectedTpkdRateByDept.get(p.departmentId) ?? null) : null;
      actual = r.kpiRate;
    } else if (r.costType === "kpi_admin") {
      expected = adminExpectedRate;
      actual = r.kpiRate;
    } else continue;
    if (expected == null) continue;
    const diff = computeRetroDiff(r.amount, actual, expected);
    if (diff === 0) continue;
    const retroId = retroBySource.get(r.id) ?? null;
    retro.push({
      reconId: r.id,
      productId: r.productId,
      productCode: p.productCode,
      unitCode: p.unitCode,
      employeeName: r.employeeName,
      costType: r.costType,
      reconciliationDate: r.reconciliationDate,
      amount: r.amount,
      actualRate: actual,
      expectedRate: expected,
      diff,
      alreadyRetro: retroId != null,
      retroReconId: retroId,
    });
  }
  retro.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const pending = retro.filter((r) => !r.alreadyRetro);
  return {
    key,
    ref,
    label: periodLabel(ref),
    endDate,
    policies: pol,
    products: prods,
    nvkd: nvkdRows,
    depts: deptRows,
    adminExpectedRate,
    adminUnits,
    ceoUnits,
    retro,
    totals: {
      revenue: prods.reduce((s, p) => s + p.revenue, 0),
      unitCount: prods.length,
      retroPlus: pending.filter((r) => r.diff > 0).reduce((s, r) => s + r.diff, 0),
      retroMinus: pending.filter((r) => r.diff < 0).reduce((s, r) => s + r.diff, 0),
      retroPending: pending.length,
      bonusTotal: nvkdRows.reduce((s, r) => s + r.bonus, 0),
    },
  };
}

/** Danh sách kỳ có căn, mới nhất trước. */
export function listPeriodKeys(ctx: AllContext): string[] {
  const keys = new Set<string>();
  for (const p of ctx.products) if (p.periodKey) keys.add(p.periodKey);
  return [...keys].sort((a, b) => b.localeCompare(a));
}
