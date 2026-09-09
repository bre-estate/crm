/**
 * Kỳ hoa hồng & thưởng — LOADER (query DB 1 lần, rồi summarizePeriod trong memory).
 * Phần pure ở ./period-commission-core (test được, không import DB).
 */
import { db } from "@/lib/db";
import {
  products,
  projects,
  departments,
  employees,
  costReconciliations,
  revenueReconciliations,
  commissionPolicies,
  paymentsOut,
} from "@/lib/schema";
import { eq, gt, sql } from "drizzle-orm";
import type { CommissionPolicy } from "@/lib/commission-policy";
import {
  computeProductPeriod,
  productRevenue,
  norm,
  type AllContext,
  type EmpInfo,
  type ProductInPeriod,
  type ReconLite,
} from "@/lib/period-commission-core";

export * from "@/lib/period-commission-core";

export async function loadAllContext(): Promise<AllContext> {
  const [policyRows, empRows, deptRows, prodRows, revFirst, reconRows, payRows] = await Promise.all([
    db.select().from(commissionPolicies),
    db.select().from(employees),
    db.select().from(departments),
    db
      .select({
        id: products.id,
        productCode: products.productCode,
        unitCode: products.unitCode,
        projectName: projects.name,
        salesPerson: products.salesPerson,
        departmentId: products.departmentId,
        depositDate: products.depositDate,
        recognitionMonth: products.recognitionMonth,
        pmgBasePrice: products.pmgBasePrice,
        pmgRate: products.pmgRate,
        adminFee: products.adminFee,
      })
      .from(products)
      .leftJoin(projects, eq(products.projectId, projects.id))
      .where(eq(products.saleType, "primary")),
    db
      .select({
        productId: revenueReconciliations.productId,
        first: sql<string>`min(${revenueReconciliations.reconciliationDate})`,
      })
      .from(revenueReconciliations)
      .where(gt(revenueReconciliations.revenueThisTime, 0))
      .groupBy(revenueReconciliations.productId),
    db.select().from(costReconciliations),
    db
      .select({
        reconId: paymentsOut.costReconciliationId,
        paid: sql<number>`coalesce(sum(${paymentsOut.amount}), 0)`,
      })
      .from(paymentsOut)
      .groupBy(paymentsOut.costReconciliationId),
  ]);

  const policies = policyRows as unknown as CommissionPolicy[];

  const empById = new Map(empRows.map((e) => [e.id, e]));
  const empByName = new Map<string, EmpInfo>();
  for (const e of empRows) {
    const owner = e.aliasOfId ? (empById.get(e.aliasOfId) ?? e) : e;
    empByName.set(norm(e.name), {
      id: e.id,
      name: e.name,
      position: e.position,
      departmentId: e.departmentId ?? null,
      ownerName: owner.name,
      ownerPosition: owner.position,
      ownerDepartmentId: owner.departmentId ?? e.departmentId ?? null,
    });
  }
  const ownerOf = (name: string | null | undefined) => {
    const e = empByName.get(norm(name));
    return e ? e.ownerName : (name ?? "").trim();
  };

  const depts = new Map(
    deptRows.map((d) => [d.id, { id: d.id, name: d.name, leaderName: d.leaderName ?? null }]),
  );
  const firstRev = new Map(revFirst.map((r) => [r.productId, r.first ? String(r.first).slice(0, 10) : null]));

  const prodList: ProductInPeriod[] = prodRows.map((p) => {
    const per = computeProductPeriod(
      { recognitionMonth: p.recognitionMonth ?? null, depositDate: p.depositDate ?? null },
      firstRev.get(p.id) ?? null,
    );
    const emp = empByName.get(norm(p.salesPerson));
    const deptId = p.departmentId ?? emp?.ownerDepartmentId ?? null;
    return {
      id: p.id,
      productCode: p.productCode,
      unitCode: p.unitCode,
      projectName: p.projectName ?? null,
      salesPerson: p.salesPerson ?? null,
      ownerName: ownerOf(p.salesPerson),
      ownerPosition: emp?.ownerPosition ?? null,
      departmentId: deptId,
      deptName: deptId != null ? (depts.get(deptId)?.name ?? null) : null,
      depositDate: p.depositDate ?? null,
      recognitionMonth: p.recognitionMonth ?? null,
      periodKey: per.key,
      periodBasis: per.basis,
      revenue: productRevenue(p),
    };
  });

  const paidBy = new Map(payRows.map((r) => [r.reconId, Number(r.paid ?? 0)]));
  const recons: ReconLite[] = reconRows.map((r) => ({
    id: r.id,
    productId: r.productId,
    costType: r.costType,
    employeeName: r.employeeName,
    ownerName: ownerOf(r.employeeName),
    reconciliationDate: r.reconciliationDate ?? null,
    commissionRate: Number(r.commissionRate ?? 0),
    kpiRate: Number(r.kpiRate ?? 0),
    amount: Number(r.amountPayableThisTime ?? 0),
    paymentProgressPct: Number(r.paymentProgressPct ?? 0),
    pmgLkSaleRate: Number(r.pmgLkSaleRate ?? 0),
    pmgBasePriceSale: Number(r.pmgBasePriceSale ?? 0),
    adminFeeSale: Number(r.adminFeeSale ?? 0),
    customerSupport: Number(r.customerSupport ?? 0),
    note: r.note ?? null,
    paid: paidBy.get(r.id) ?? 0,
  }));

  return { policies, empByName, depts, products: prodList, recons };
}
