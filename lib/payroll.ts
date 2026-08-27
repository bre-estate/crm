/**
 * Payroll — Commission generator (Phase A).
 *
 * Sinh bảng đối chiếu HH cho NVKD/TPKD/Admin theo period, layout match Excel gốc
 * (data-excel/Bảng Lương/*.xlsx). Reuse cost_reconciliations làm nguồn số liệu.
 *
 * Layout ID:
 *   - "nvkd"  → Bảng TTHH NVKD (cost_type=sale_commission, %HH=55%)
 *   - "tpkd"  → Bảng KPI TPKD (cost_type=kpi_tpkd, %HH=4%)
 *   - "admin" → Bảng HH Admin (cost_type=kpi_admin, %HH=0.25-0.5%)
 */

import { db } from "@/lib/db";
import { costReconciliations, products, projects, paymentsOut } from "@/lib/schema";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

export type PayrollLayout = "nvkd" | "tpkd" | "admin";

/** Map từ employee position → payroll layout. */
export function positionToLayout(position: string | null): PayrollLayout | null {
  switch (position) {
    case "nvkd":
    case "ctv":
    case "ceo": // Giám đốc cũng bán căn (Bách) → layout TTHH NVKD
      return "nvkd";
    case "tpkd":
      return "tpkd";
    case "admin":
    case "hr": // HR có thể có bảng HH nếu kiêm admin (Lương Thị Nga)
      return "admin";
    default:
      return null;
  }
}

/** cost_types tương ứng với layout. */
export function costTypesForLayout(layout: PayrollLayout): string[] {
  switch (layout) {
    case "nvkd":
      // Bảng TTHH NVKD gộp cả HH sale + thưởng nóng CĐT + CTY thưởng
      return ["sale_commission", "bonus_sale", "cdt_bonus_sale"];
    case "tpkd":
      return ["kpi_tpkd", "bonus_manager", "cdt_bonus_manager"];
    case "admin":
      return ["kpi_admin"];
  }
}

export type CommissionRow = {
  reconId: number;
  productId: number;
  productCode: string;
  unitCode: string | null;
  customerName: string | null;
  projectName: string | null;
  costType: string;
  reconciliationDate: string | null;
  // Snapshot lúc tạo recon:
  pmgBasePrice: number; // Giá tính PMG (cột G/D/E)
  pmgLkSaleRate: number; // %PMG (cột H/E/F) — 0.055/0.06/0.07/0.0575
  paymentProgressPct: number; // %tiến độ khách trả (cột J/F) — 0.8/0.9/1.0
  adminFeeSale: number; // Phí admin sale (cột K/G)
  customerSupport: number; // Hỗ trợ khách (cột L/H)
  commissionRate: number; // %HH role (cột I/I) — 0.55 NVKD / 0.04 TPKD / 0.0025-0.005 Admin
  // Số tiền:
  amountPayableThisTime: number; // HH lũy kế đợt này (cột N/L/K)
  pmgReconciledCumulative: number; // HH đã đối chiếu lũy kế (cột M ref)
  note: string | null;
  // Bổ sung:
  paidLK: number; // Từ payments_out — HH đã trả lũy kế cho recon này
  depositDate: string | null; // Ngày cọc căn (cột M sheet TPKD)
  salesPerson: string | null; // NV bán căn (cột N sheet TPKD)
};

/** Query commission rows cho 1 nhân viên trong khoảng ngày. */
export async function loadCommissionRows(opts: {
  employeeName: string;
  layout: PayrollLayout;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
}): Promise<CommissionRow[]> {
  const types = costTypesForLayout(opts.layout);
  const rows = await db
    .select({
      reconId: costReconciliations.id,
      productId: costReconciliations.productId,
      productCode: products.productCode,
      unitCode: products.unitCode,
      customerName: products.customerName,
      projectName: projects.name,
      costType: costReconciliations.costType,
      reconciliationDate: costReconciliations.reconciliationDate,
      pmgBasePrice: costReconciliations.pmgBasePriceSale,
      pmgLkSaleRate: costReconciliations.pmgLkSaleRate,
      paymentProgressPct: costReconciliations.paymentProgressPct,
      adminFeeSale: costReconciliations.adminFeeSale,
      customerSupport: costReconciliations.customerSupport,
      commissionRate: costReconciliations.commissionRate,
      amountPayableThisTime: costReconciliations.amountPayableThisTime,
      pmgReconciledCumulative: costReconciliations.pmgReconciledCumulative,
      note: costReconciliations.note,
      depositDate: products.depositDate,
      salesPerson: products.salesPerson,
    })
    .from(costReconciliations)
    .leftJoin(products, eq(products.id, costReconciliations.productId))
    .leftJoin(projects, eq(projects.id, products.projectId))
    .where(
      and(
        eq(costReconciliations.employeeName, opts.employeeName),
        // Cast: types là subset của enum costType; drizzle strict về enum
        inArray(
          costReconciliations.costType,
          types as unknown as (typeof costReconciliations.costType)["_"]["data"][],
        ),
        gte(costReconciliations.reconciliationDate, opts.fromDate),
        lte(costReconciliations.reconciliationDate, opts.toDate),
      ),
    )
    .orderBy(products.unitCode, costReconciliations.reconciliationDate);

  if (rows.length === 0) return [];

  // Batch load paid lũy kế cho tất cả reconId
  const reconIds = rows.map((r) => r.reconId);
  const paidRows = await db
    .select({
      reconId: paymentsOut.costReconciliationId,
      total: sql<string>`COALESCE(SUM(${paymentsOut.amount}), 0)`,
    })
    .from(paymentsOut)
    .where(inArray(paymentsOut.costReconciliationId, reconIds))
    .groupBy(paymentsOut.costReconciliationId);
  const paidMap = new Map<number, number>();
  for (const p of paidRows) {
    if (p.reconId != null) paidMap.set(p.reconId, Number(p.total ?? 0));
  }

  return rows.map((r) => ({
    reconId: r.reconId,
    productId: r.productId,
    productCode: r.productCode ?? "",
    unitCode: r.unitCode,
    customerName: r.customerName,
    projectName: r.projectName,
    costType: r.costType,
    reconciliationDate: r.reconciliationDate,
    pmgBasePrice: Number(r.pmgBasePrice ?? 0),
    pmgLkSaleRate: Number(r.pmgLkSaleRate ?? 0),
    paymentProgressPct: Number(r.paymentProgressPct ?? 0),
    adminFeeSale: Number(r.adminFeeSale ?? 0),
    customerSupport: Number(r.customerSupport ?? 0),
    commissionRate: Number(r.commissionRate ?? 0),
    amountPayableThisTime: Number(r.amountPayableThisTime ?? 0),
    pmgReconciledCumulative: Number(r.pmgReconciledCumulative ?? 0),
    note: r.note,
    paidLK: paidMap.get(r.reconId) ?? 0,
    depositDate: r.depositDate,
    salesPerson: r.salesPerson,
  }));
}

/**
 * Tính "HH cơ bản" (cột M NVKD) — công thức đầy đủ khi khách trả 100%:
 *   ((G × H − K) / 1.1 − L) × I
 * G=pmgBasePrice, H=pmgLkSaleRate, K=adminFeeSale, L=customerSupport, I=commissionRate
 */
export function computeHhCoBan(r: CommissionRow): number {
  const gross = r.pmgBasePrice * r.pmgLkSaleRate;
  const base = (gross - r.adminFeeSale) / 1.1 - r.customerSupport;
  return Math.max(0, base) * r.commissionRate;
}

/**
 * "HH lũy kế đợt này" (cột N NVKD) — công thức có yếu tố tiến độ khách trả:
 *   ((G × H × J − K) / 1.1 − L) × I
 * Đây chính là amountPayableThisTime đã có trong recon.
 */
export function computeHhLkDot(r: CommissionRow): number {
  // Ưu tiên số lưu trong DB (đã snapshot), fallback tính lại nếu 0
  if (r.amountPayableThisTime > 0) return r.amountPayableThisTime;
  const gross = r.pmgBasePrice * r.pmgLkSaleRate * r.paymentProgressPct;
  const base = (gross - r.adminFeeSale) / 1.1 - r.customerSupport;
  return Math.max(0, base) * r.commissionRate;
}
