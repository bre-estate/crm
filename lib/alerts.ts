import "server-only";
import { db } from "@/lib/db";
import {
  products,
  employees,
  revenueReconciliations,
  paymentsIn,
  costReconciliations,
  financialTransactions,
} from "@/lib/schema";
import { sql, inArray, eq, and, lt, gte, isNotNull } from "drizzle-orm";
import { OPEX_MGMT_CATEGORIES, FIXED_COST_CATEGORIES } from "@/lib/accounting/categories";

/**
 * Alerts — logic tách khỏi UI để reuse:
 *   - /alerts page (full render với detail React)
 *   - sidebar notifications panel (chỉ cần id + title + severity + url)
 *
 * Mỗi alert có `key` stable-per-period để track read state per user:
 *   - Monthly alerts: `${id}::${YYYY-MM}` — reset mỗi tháng
 *   - Persistent alerts (VD idle-sale): update daily → key có ngày
 */

export type Severity = "critical" | "warning" | "info";

type Base = {
  id: string;
  key: string;
  severity: Severity;
  title: string;
  description: string;
  url?: string;
};

export type AlertBelowBe = Base & {
  id: "below-be-3m";
  beUnits: number;
  months: { month: string; count: number }[];
};

export type AlertIdle = Base & {
  id: "idle-sale";
  emps: { name: string; lastSale: string | null }[];
};

export type AlertOpexSpike = Base & {
  id: "opex-spike";
  months: { month: string; amount: number; ratio: number }[];
};

export type AlertOverdue = Base & {
  id: "overdue-receivables";
  totalAmount: number;
  products: {
    productId: number;
    unitCode: string;
    total: number;
    oldestDate: string;
    count: number;
  }[];
};

export type Alert = AlertBelowBe | AlertIdle | AlertOpexSpike | AlertOverdue;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function computeAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const nowMonth = new Date().toISOString().slice(0, 7);
  const currentYear = nowMonth.slice(0, 4);
  const monthsSoFar = Number(nowMonth.slice(5));
  const todayISO = new Date().toISOString().slice(0, 10);

  // ============================================================
  // ALERT 1: 3 tháng liền bán dưới điểm hòa vốn
  // ============================================================
  const opexYtdRows = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        inArray(financialTransactions.categoryCode, FIXED_COST_CATEGORIES),
        sql`transaction_month LIKE ${currentYear + "-%"}`,
      ),
    );
  const opexAvgMonth = monthsSoFar > 0 ? Number(opexYtdRows[0].s) / monthsSoFar : 0;

  const tscdRows = await db
    .select({
      month: financialTransactions.transactionMonth,
      cost: financialTransactions.amount,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "153-211"));
  const monthlyDepTotal = tscdRows.reduce((s, a) => {
    const [y1, m1] = a.month.split("-").map(Number);
    const [y2, m2] = nowMonth.split("-").map(Number);
    const elapsed = (y2 - y1) * 12 + (m2 - m1);
    if (elapsed < 0 || elapsed >= 36) return s;
    return s + Number(a.cost) / 36;
  }, 0);
  const cpQlMonth = opexAvgMonth + monthlyDepTotal;

  const [productStats] = await db
    .select({
      revExp: sql<number>`coalesce(sum(total_revenue), 0)::float8`,
      costExp: sql<number>`coalesce(sum(total_cost), 0)::float8`,
      n: sql<number>`count(*)::int`,
    })
    .from(products);
  const avgGrossPerUnit =
    Number(productStats.n) > 0
      ? (Number(productStats.revExp) / 1.1 - Number(productStats.costExp)) / Number(productStats.n)
      : 0;
  const beUnits = avgGrossPerUnit > 0 && cpQlMonth > 0 ? cpQlMonth / avgGrossPerUnit : 0;

  const allProducts = await db
    .select({ depositDate: products.depositDate })
    .from(products)
    .where(isNotNull(products.depositDate));
  const unitsPerMonth = new Map<string, number>();
  for (const p of allProducts) {
    if (!p.depositDate) continue;
    const m = p.depositDate.slice(0, 7);
    unitsPerMonth.set(m, (unitsPerMonth.get(m) ?? 0) + 1);
  }
  const last3 = [1, 2, 3].map((i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const last3Counts = last3.map((m) => ({ month: m, count: unitsPerMonth.get(m) ?? 0 }));
  const below3 = last3Counts.filter((x) => x.count < beUnits).length;
  if (below3 === 3 && beUnits > 0) {
    alerts.push({
      id: "below-be-3m",
      key: `below-be-3m::${nowMonth}`,
      severity: "critical",
      title: `Bán dưới điểm hòa vốn 3 tháng liền`,
      description: `Điểm hòa vốn cần ${beUnits.toFixed(1)} căn/tháng.`,
      url: "/reports/management",
      beUnits,
      months: last3Counts,
    });
  }

  // ============================================================
  // ALERT 5: NVKD 0 căn > 3 tháng liền
  // ============================================================
  const threeMonthsAgo = daysAgo(90);
  const emps = await db
    .select({
      id: employees.id,
      name: employees.name,
      position: employees.position,
      aliasOfId: employees.aliasOfId,
    })
    .from(employees)
    .where(and(eq(employees.active, true), eq(employees.position, "nvkd")));

  const recentSaleRows = await db
    .select({ name: costReconciliations.employeeName })
    .from(costReconciliations)
    .where(
      and(
        eq(costReconciliations.costType, "sale_commission"),
        gte(costReconciliations.reconciliationDate, threeMonthsAgo),
      ),
    );
  const activeNames = new Set(
    recentSaleRows.map((r) => (r.name ?? "").trim().toLowerCase()).filter(Boolean),
  );

  const lastSaleRows = await db
    .select({
      name: costReconciliations.employeeName,
      d: sql<string>`max(reconciliation_date)`,
    })
    .from(costReconciliations)
    .where(eq(costReconciliations.costType, "sale_commission"))
    .groupBy(costReconciliations.employeeName);
  const lastSaleByName = new Map<string, string>();
  for (const r of lastSaleRows) {
    if (r.name && r.d) lastSaleByName.set(r.name.trim().toLowerCase(), r.d);
  }

  const idleEmps: { name: string; lastSale: string | null }[] = [];
  for (const e of emps) {
    if (e.aliasOfId != null) continue;
    const key = e.name.trim().toLowerCase();
    if (activeNames.has(key)) continue;
    idleEmps.push({ name: e.name, lastSale: lastSaleByName.get(key) ?? null });
  }

  if (idleEmps.length > 0) {
    alerts.push({
      id: "idle-sale",
      key: `idle-sale::${nowMonth}`,
      severity: "warning",
      title: `${idleEmps.length} NVKD không có đợt hoa hồng sale trong 3 tháng qua`,
      description:
        "Cân nhắc cho nghỉ việc, đào tạo lại, hoặc điều chuyển sang phòng ban khác.",
      url: "/reports/people",
      emps: idleEmps,
    });
  }

  // ============================================================
  // ALERT 6: Chi phí hoạt động tháng bất thường > 1.5× trung bình 6 tháng
  // ============================================================
  const opexPerMonthRows = await db
    .select({
      month: financialTransactions.transactionMonth,
      s: sql<number>`sum(amount)::float8`,
    })
    .from(financialTransactions)
    .where(inArray(financialTransactions.categoryCode, OPEX_MGMT_CATEGORIES))
    .groupBy(financialTransactions.transactionMonth);
  const opexByMonth = new Map(opexPerMonthRows.map((r) => [r.month, Number(r.s)]));

  const last7Months = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const [, ...prev6] = last7Months;
  const prev6Values = prev6.map((m) => opexByMonth.get(m) ?? 0).filter((v) => v > 0);
  const avg6m = prev6Values.length > 0 ? prev6Values.reduce((s, v) => s + v, 0) / prev6Values.length : 0;

  const spikeMonths: { month: string; amount: number; ratio: number }[] = [];
  for (const m of last7Months) {
    const v = opexByMonth.get(m) ?? 0;
    if (v > 0 && avg6m > 0 && v > avg6m * 1.5) {
      spikeMonths.push({ month: m, amount: v, ratio: v / avg6m });
    }
  }

  if (spikeMonths.length > 0) {
    alerts.push({
      id: "opex-spike",
      key: `opex-spike::${nowMonth}`,
      severity: "warning",
      title: `${spikeMonths.length} tháng có chi phí hoạt động bất thường`,
      description:
        "Chi phí hoạt động cao hơn 1,5 lần trung bình 6 tháng gần đây. Cần rà soát lý do (thưởng lớn, thuế, mua sắm bất thường).",
      months: spikeMonths,
    });
  }

  // ============================================================
  // ALERT 8: Công nợ phải thu > 60 ngày
  // ============================================================
  const cutoff = daysAgo(60);
  const recons = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      reconDate: revenueReconciliations.reconciliationDate,
      receivable: revenueReconciliations.totalReceivableThisTime,
    })
    .from(revenueReconciliations)
    .where(and(lt(revenueReconciliations.reconciliationDate, cutoff)));
  const reconIds = recons.map((r) => r.id);
  const paidByRecon = new Map<number, number>();
  if (reconIds.length > 0) {
    const paid = await db
      .select({
        rid: paymentsIn.reconciliationId,
        amount: paymentsIn.amount,
      })
      .from(paymentsIn)
      .where(inArray(paymentsIn.reconciliationId, reconIds));
    for (const p of paid) {
      if (p.rid == null) continue;
      paidByRecon.set(p.rid, (paidByRecon.get(p.rid) ?? 0) + Number(p.amount ?? 0));
    }
  }

  const overdueByProduct = new Map<
    number,
    { total: number; oldestDate: string; count: number }
  >();
  for (const r of recons) {
    const paid = paidByRecon.get(r.id) ?? 0;
    const outstanding = Number(r.receivable ?? 0) - paid;
    if (outstanding < 1000) continue;
    const cur = overdueByProduct.get(r.productId) ?? {
      total: 0,
      oldestDate: r.reconDate ?? "",
      count: 0,
    };
    cur.total += outstanding;
    cur.count += 1;
    if (r.reconDate && (!cur.oldestDate || r.reconDate < cur.oldestDate)) {
      cur.oldestDate = r.reconDate;
    }
    overdueByProduct.set(r.productId, cur);
  }
  const overdueTotalAmount = [...overdueByProduct.values()].reduce((s, x) => s + x.total, 0);

  if (overdueByProduct.size > 0) {
    const productMap = new Map<number, string>();
    const pRows = await db
      .select({ id: products.id, unitCode: products.unitCode })
      .from(products)
      .where(inArray(products.id, [...overdueByProduct.keys()]));
    for (const p of pRows) productMap.set(p.id, p.unitCode);

    const sortedOverdue = [...overdueByProduct.entries()]
      .map(([pid, x]) => ({
        productId: pid,
        unitCode: productMap.get(pid) ?? `#${pid}`,
        total: x.total,
        oldestDate: x.oldestDate,
        count: x.count,
      }))
      .sort((a, b) => b.total - a.total);

    alerts.push({
      id: "overdue-receivables",
      key: `overdue-receivables::${todayISO}`,
      severity: "warning",
      title: `${overdueByProduct.size} căn có công nợ phải thu > 60 ngày`,
      description: `Tổng công nợ quá hạn: ${Math.round(overdueTotalAmount).toLocaleString("vi-VN")} VND.`,
      url: "/reports/cash-flow",
      totalAmount: overdueTotalAmount,
      products: sortedOverdue,
    });
  }

  return alerts;
}

/**
 * Summary version — chỉ trả về metadata cần cho sidebar notifications panel.
 * Nhẹ hơn (không expose detail arrays trong response client).
 */
export type AlertSummary = {
  id: string;
  key: string;
  severity: Severity;
  title: string;
  url?: string;
};

export async function computeAlertSummaries(): Promise<AlertSummary[]> {
  const alerts = await computeAlerts();
  return alerts.map((a) => ({
    id: a.id,
    key: a.key,
    severity: a.severity,
    title: a.title,
    url: a.url,
  }));
}
