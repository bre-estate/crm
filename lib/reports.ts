import "server-only";

import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  departments,
  revenueReconciliations,
  costReconciliations,
  paymentsIn,
  paymentsOut,
  companyInvestments,
  companyExpenses,
  companySettings,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getOwnerEmail } from "@/lib/auth";

export type RangeKey = "full" | "q1" | "q2" | "q3" | "q4" | "h1" | "h2";

export const RANGE_MONTHS: Record<RangeKey, [number, number]> = {
  full: [1, 12],
  q1: [1, 3],
  q2: [4, 6],
  q3: [7, 9],
  q4: [10, 12],
  h1: [1, 6],
  h2: [7, 12],
};

export const RANGE_LABEL: Record<RangeKey, string> = {
  full: "Cả năm",
  q1: "Q1 (T1–T3)",
  q2: "Q2 (T4–T6)",
  q3: "Q3 (T7–T9)",
  q4: "Q4 (T10–T12)",
  h1: "Nửa đầu năm (T1–T6)",
  h2: "Nửa cuối năm (T7–T12)",
};

// Ưu tiên recognition_month, fallback deposit_date.
export function effectiveYM(
  recognitionMonth: string | null,
  depositDate: string | null,
): { y: number; mo: number } | null {
  const src = recognitionMonth || depositDate;
  if (!src) return null;
  const m = src.match(/^(\d{4})-(\d{2})/);
  return m ? { y: Number(m[1]), mo: Number(m[2]) } : null;
}

function inRange(
  recognitionMonth: string | null,
  depositDate: string | null,
  year: number | null,
  range: RangeKey,
): boolean {
  if (!year) return true;
  const ym = effectiveYM(recognitionMonth, depositDate);
  if (!ym) return false;
  if (ym.y !== year) return false;
  const [lo, hi] = RANGE_MONTHS[range];
  return ym.mo >= lo && ym.mo <= hi;
}

export type ReportFilters = {
  year: number | null;
  range: RangeKey;
};

export function parseFilters(sp: { year?: string; range?: string }): ReportFilters {
  const year = sp.year && sp.year !== "all" ? Number(sp.year) : null;
  const range: RangeKey = (sp.range as RangeKey) in RANGE_MONTHS
    ? (sp.range as RangeKey)
    : "full";
  return { year, range };
}

export type ProjectAgg = {
  id: number;
  code: string;
  name: string;
  partnerName: string | null;
  breRole: string;
  numProducts: number;
  totalSellPrice: number;
  totalRevenueExpected: number;
  totalCostExpected: number;
  totalRevReconciled: number;
  totalCostReconciled: number;
  totalPaidIn: number;
  totalPaidOut: number;
  cdtBonusReduction: number;
};

export type ProductRow = {
  id: number;
  projectId: number;
  sellPrice: number | null;
  totalRevenue: number | null;
  totalCost: number | null;
  cdtBonusSale: number | null;
  cdtBonusManager: number | null;
  departmentId: number | null;
  departmentName: string | null;
  salesPerson: string | null;
  recognitionMonth: string | null;
  depositDate: string | null;
  saleType: string | null;
  pmgBasePrice: number | null;
  pmgRate: number | null;
  pmgSaleRate: number | null;
  unitType: string | null;
  bedrooms: number | null;
  hasBonusRoom: boolean | null;
  areaM2Net: number | null;
  areaM2Gross: number | null;
  parseNote: string | null;
};

export type RevReconRow = {
  id: number;
  productId: number;
  projectId: number;
  partnerId: number | null;
  partnerName: string | null;
  productCode: string;
  projectName: string | null;
  reconDate: string | null;
  receivable: number;
  paid: number;
  firstPaidDate: string | null; // ngày payment sớm nhất (nếu có)
  employeeName: string | null;
};

export type CostReconRow = {
  id: number;
  productId: number;
  projectId: number;
  productCode: string;
  reconDate: string | null;
  costType: string;
  employeeName: string;
  payable: number;
  paid: number;
};

export type ReportData = {
  filters: ReportFilters;
  filterLabel: string;
  yearOptions: number[];
  prodRows: ProductRow[];
  prodRowsAll: ProductRow[];
  aggregatedProjects: ProjectAgg[];
  revReconsAll: RevReconRow[]; // cross-year for cashflow
  costReconsAll: CostReconRow[]; // cross-year for cashflow
  partnerNames: Map<number, string>; // partnerId → name
  grandTotals: {
    products: number;
    sellPrice: number;
    revenueExp: number;
    costExp: number;
    revRec: number;
    costRec: number;
    paidIn: number;
    paidOut: number;
  };
  profitExpected: number;
  profitRealized: number;
  // Financial (owner-only) — undefined nếu không phải owner
  financial?: {
    totalInvestment: number;
    totalExpense: number;
    monthsInPeriod: number;
    preTaxExpected: number;
    preTaxRealized: number;
    netExpected: number;
    netRealized: number;
    netMarginExpected: number;
    roiExpected: number | null;
    paybackMonths: number | null;
    taxRate: number;
    invRows: Array<{ id: number; amount: number }>;
    filteredExpensesCount: number;
    monthlyNet: number;
  };
};

export async function loadReportData(filters: ReportFilters): Promise<ReportData> {
  const { year, range } = filters;

  const allProjects = await db
    .select({
      id: projects.id,
      code: projects.fullCode,
      name: projects.name,
      partnerName: partners.name,
      breRole: projects.breRole,
    })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id));

  const prodRowsAllRaw = await db
    .select({
      id: products.id,
      projectId: products.projectId,
      sellPrice: products.sellPrice,
      totalRevenue: products.totalRevenue,
      totalCost: products.totalCost,
      cdtBonusSale: products.cdtBonusSale,
      cdtBonusManager: products.cdtBonusManager,
      departmentId: products.departmentId,
      departmentName: departments.name,
      salesPerson: products.salesPerson,
      recognitionMonth: products.recognitionMonth,
      depositDate: products.depositDate,
      saleType: products.saleType,
      pmgBasePrice: products.pmgBasePrice,
      pmgRate: products.pmgRate,
      pmgSaleRate: products.pmgSaleRate,
      unitType: products.unitType,
      bedrooms: products.bedrooms,
      hasBonusRoom: products.hasBonusRoom,
      areaM2Net: products.areaM2Net,
      areaM2Gross: products.areaM2Gross,
      parseNote: products.parseNote,
    })
    .from(products)
    .leftJoin(departments, eq(products.departmentId, departments.id));

  const prodRowsAll: ProductRow[] = prodRowsAllRaw.map((p) => ({
    id: p.id,
    projectId: p.projectId,
    sellPrice: p.sellPrice,
    totalRevenue: p.totalRevenue,
    totalCost: p.totalCost,
    cdtBonusSale: p.cdtBonusSale,
    cdtBonusManager: p.cdtBonusManager,
    departmentId: p.departmentId,
    departmentName: p.departmentName,
    salesPerson: p.salesPerson,
    recognitionMonth: p.recognitionMonth,
    depositDate: p.depositDate,
    saleType: p.saleType,
    pmgBasePrice: p.pmgBasePrice,
    pmgRate: p.pmgRate,
    pmgSaleRate: p.pmgSaleRate,
    unitType: p.unitType,
    bedrooms: p.bedrooms,
    hasBonusRoom: p.hasBonusRoom,
    areaM2Net: p.areaM2Net,
    areaM2Gross: p.areaM2Gross,
    parseNote: p.parseNote,
  }));

  const yearSet = new Set<number>();
  for (const p of prodRowsAll) {
    const ym = effectiveYM(p.recognitionMonth, p.depositDate);
    if (ym) yearSet.add(ym.y);
  }
  const yearOptions = Array.from(yearSet).sort((a, b) => b - a);

  const prodRows = prodRowsAll.filter((p) =>
    inRange(p.recognitionMonth, p.depositDate, year, range),
  );
  const filteredProductIds = new Set(prodRows.map((p) => p.id));

  const revRowsAll = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      receivable: revenueReconciliations.totalReceivableThisTime,
    })
    .from(revenueReconciliations);
  const revRows = revRowsAll.filter((r) => filteredProductIds.has(r.productId));

  const costRowsAll = await db
    .select({
      id: costReconciliations.id,
      productId: costReconciliations.productId,
      payable: costReconciliations.amountPayableThisTime,
    })
    .from(costReconciliations);
  const costRows = costRowsAll.filter((r) => filteredProductIds.has(r.productId));

  const paymentInRows = await db
    .select({
      recId: paymentsIn.reconciliationId,
      amount: paymentsIn.amount,
      paymentDate: paymentsIn.paymentDate,
    })
    .from(paymentsIn);
  const paymentOutRows = await db
    .select({ recId: paymentsOut.costReconciliationId, amount: paymentsOut.amount })
    .from(paymentsOut);

  const revRecPayMap = new Map<number, number>();
  const revRecFirstPayDate = new Map<number, string>();
  for (const p of paymentInRows) {
    if (p.recId === null) continue;
    revRecPayMap.set(p.recId, (revRecPayMap.get(p.recId) ?? 0) + Number(p.amount ?? 0));
    if (p.paymentDate) {
      const cur = revRecFirstPayDate.get(p.recId);
      if (!cur || p.paymentDate < cur) revRecFirstPayDate.set(p.recId, p.paymentDate);
    }
  }
  const costRecPayMap = new Map<number, number>();
  for (const p of paymentOutRows) {
    if (p.recId === null) continue;
    costRecPayMap.set(p.recId, (costRecPayMap.get(p.recId) ?? 0) + Number(p.amount ?? 0));
  }

  const projMap = new Map<number, ProjectAgg>();
  for (const p of allProjects) {
    projMap.set(p.id, {
      id: p.id,
      code: p.code,
      name: p.name,
      partnerName: p.partnerName,
      breRole: p.breRole,
      numProducts: 0,
      totalSellPrice: 0,
      totalRevenueExpected: 0,
      totalCostExpected: 0,
      totalRevReconciled: 0,
      totalCostReconciled: 0,
      totalPaidIn: 0,
      totalPaidOut: 0,
      cdtBonusReduction: 0,
    });
  }

  for (const p of prodRows) {
    const pj = projMap.get(p.projectId);
    if (!pj) continue;
    pj.numProducts++;
    pj.totalSellPrice += Number(p.sellPrice ?? 0);
    pj.totalRevenueExpected += Number(p.totalRevenue ?? 0);
    pj.totalCostExpected += Number(p.totalCost ?? 0);
    pj.cdtBonusReduction += Number(p.cdtBonusSale ?? 0) + Number(p.cdtBonusManager ?? 0);
  }

  const productToProject = new Map<number, number>();
  for (const p of prodRows) productToProject.set(p.id, p.projectId);

  for (const r of revRows) {
    const pjId = productToProject.get(r.productId);
    if (!pjId) continue;
    const pj = projMap.get(pjId);
    if (!pj) continue;
    pj.totalRevReconciled += Number(r.receivable ?? 0);
    pj.totalPaidIn += revRecPayMap.get(r.id) ?? 0;
  }
  for (const r of costRows) {
    const pjId = productToProject.get(r.productId);
    if (!pjId) continue;
    const pj = projMap.get(pjId);
    if (!pj) continue;
    pj.totalCostReconciled += Number(r.payable ?? 0);
    pj.totalPaidOut += costRecPayMap.get(r.id) ?? 0;
  }

  const aggregatedProjects = Array.from(projMap.values()).filter((p) => p.numProducts > 0);

  // ===== Cross-year data cho cashflow/partners/staff (không bị filter period ảnh hưởng) =====
  const partnerNames = new Map<number, string>();
  const allPartnersRaw = await db.select({ id: partners.id, name: partners.name }).from(partners);
  for (const p of allPartnersRaw) partnerNames.set(p.id, p.name);

  // Product → (projectId, partnerId, productCode, projectName)
  const productMeta = new Map<
    number,
    { projectId: number; partnerId: number | null; productCode: string; projectName: string | null; salesPerson: string | null }
  >();
  const productMetaRaw = await db
    .select({
      id: products.id,
      projectId: products.projectId,
      partnerId: projects.partnerId,
      productCode: products.productCode,
      projectName: projects.name,
      salesPerson: products.salesPerson,
    })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id));
  for (const p of productMetaRaw) {
    productMeta.set(p.id, {
      projectId: p.projectId,
      partnerId: p.partnerId,
      productCode: p.productCode,
      projectName: p.projectName,
      salesPerson: p.salesPerson,
    });
  }

  // Revenue recons full with dates + paid — cross-year
  const revReconsRaw = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      reconDate: revenueReconciliations.reconciliationDate,
      receivable: revenueReconciliations.totalReceivableThisTime,
    })
    .from(revenueReconciliations);

  const revReconsAll: RevReconRow[] = revReconsRaw.map((r) => {
    const meta = productMeta.get(r.productId);
    return {
      id: r.id,
      productId: r.productId,
      projectId: meta?.projectId ?? 0,
      partnerId: meta?.partnerId ?? null,
      partnerName: meta?.partnerId ? partnerNames.get(meta.partnerId) ?? null : null,
      productCode: meta?.productCode ?? "",
      projectName: meta?.projectName ?? null,
      reconDate: r.reconDate,
      receivable: Number(r.receivable ?? 0),
      paid: revRecPayMap.get(r.id) ?? 0,
      firstPaidDate: revRecFirstPayDate.get(r.id) ?? null,
      employeeName: meta?.salesPerson ?? null,
    };
  });

  const costReconsRaw = await db
    .select({
      id: costReconciliations.id,
      productId: costReconciliations.productId,
      reconDate: costReconciliations.reconciliationDate,
      costType: costReconciliations.costType,
      employeeName: costReconciliations.employeeName,
      payable: costReconciliations.amountPayableThisTime,
    })
    .from(costReconciliations);

  const costReconsAll: CostReconRow[] = costReconsRaw.map((r) => {
    const meta = productMeta.get(r.productId);
    return {
      id: r.id,
      productId: r.productId,
      projectId: meta?.projectId ?? 0,
      productCode: meta?.productCode ?? "",
      reconDate: r.reconDate,
      costType: r.costType,
      employeeName: r.employeeName,
      payable: Number(r.payable ?? 0),
      paid: costRecPayMap.get(r.id) ?? 0,
    };
  });

  const grandTotals = aggregatedProjects.reduce(
    (s, p) => ({
      products: s.products + p.numProducts,
      sellPrice: s.sellPrice + p.totalSellPrice,
      revenueExp: s.revenueExp + p.totalRevenueExpected,
      costExp: s.costExp + p.totalCostExpected,
      revRec: s.revRec + p.totalRevReconciled,
      costRec: s.costRec + p.totalCostReconciled,
      paidIn: s.paidIn + p.totalPaidIn,
      paidOut: s.paidOut + p.totalPaidOut,
    }),
    { products: 0, sellPrice: 0, revenueExp: 0, costExp: 0, revRec: 0, costRec: 0, paidIn: 0, paidOut: 0 },
  );

  const profitExpected = grandTotals.revenueExp / 1.1 - grandTotals.costExp;
  const profitRealized = grandTotals.revRec / 1.1 - grandTotals.costRec;

  const filterLabel = year ? `${RANGE_LABEL[range]} ${year}` : "Tất cả thời gian";

  // Financial (owner-only)
  const showFinance = (await getOwnerEmail()) !== null;
  let financial: ReportData["financial"] | undefined;
  if (showFinance) {
    const [invRows, expRows, settingsRows] = await Promise.all([
      db.select().from(companyInvestments),
      db.select().from(companyExpenses),
      db.select().from(companySettings),
    ]);
    const settings = settingsRows[0] ?? {
      taxRate: 0.2,
      businessStartDate: null as string | null,
    };
    const totalInvestment = invRows.reduce((s, i) => s + Number(i.amount), 0);
    const filteredExpenses = year
      ? expRows.filter((e) => {
          const m = e.expenseMonth?.match(/^(\d{4})-(\d{2})/);
          if (!m) return false;
          const y = Number(m[1]);
          const mo = Number(m[2]);
          const [minMo, maxMo] = RANGE_MONTHS[range];
          return y === year && mo >= minMo && mo <= maxMo;
        })
      : expRows;
    const totalExpense = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);

    let monthsInPeriod = 12;
    if (year) {
      const [minMo, maxMo] = RANGE_MONTHS[range];
      monthsInPeriod = maxMo - minMo + 1;
    } else if (settings.businessStartDate) {
      const start = new Date(settings.businessStartDate);
      const now = new Date();
      monthsInPeriod = Math.max(
        1,
        Math.round((now.getTime() - start.getTime()) / (30 * 24 * 3600 * 1000)),
      );
    }

    const preTaxExpected = profitExpected - totalExpense;
    const preTaxRealized = profitRealized - totalExpense;
    const taxRate = Number(settings.taxRate);
    const netExpected =
      preTaxExpected > 0 ? preTaxExpected * (1 - taxRate) : preTaxExpected;
    const netRealized =
      preTaxRealized > 0 ? preTaxRealized * (1 - taxRate) : preTaxRealized;
    const netMarginExpected =
      grandTotals.revenueExp > 0
        ? (netExpected / (grandTotals.revenueExp / 1.1)) * 100
        : 0;
    const roiExpected =
      totalInvestment > 0 ? (netExpected / totalInvestment) * 100 : null;
    const monthlyNet = monthsInPeriod > 0 ? netExpected / monthsInPeriod : 0;
    const paybackMonths =
      totalInvestment > 0 && monthlyNet > 0 ? totalInvestment / monthlyNet : null;

    financial = {
      totalInvestment,
      totalExpense,
      monthsInPeriod,
      preTaxExpected,
      preTaxRealized,
      netExpected,
      netRealized,
      netMarginExpected,
      roiExpected,
      paybackMonths,
      taxRate,
      invRows: invRows.map((i) => ({ id: i.id, amount: Number(i.amount) })),
      filteredExpensesCount: filteredExpenses.length,
      monthlyNet,
    };
  }

  return {
    filters,
    filterLabel,
    yearOptions,
    prodRows,
    prodRowsAll,
    aggregatedProjects,
    revReconsAll,
    costReconsAll,
    partnerNames,
    grandTotals,
    profitExpected,
    profitRealized,
    financial,
  };
}
