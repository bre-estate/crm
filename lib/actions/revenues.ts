"use server";

import { db } from "@/lib/db";
import { revenueReconciliations, invoices, paymentsIn, products } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/audit";
import { toNum, toStr, toStrOrNull, toPct } from "@/lib/parse";

async function findOrCreateInvoice(
  number: string,
  date: string | null,
  totalVat: number,
): Promise<number | null> {
  if (!number && !date) return null;
  const safeNumber = number || "(chưa có số)";
  const existing = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.invoiceNumber, safeNumber),
        date ? eq(invoices.invoiceDate, date) : eq(invoices.invoiceDate, ""),
      ),
    );
  if (existing[0]) return existing[0].id;
  const [inv] = await db
    .insert(invoices)
    .values({
      invoiceNumber: safeNumber,
      invoiceDate: date,
      totalAmountVat: totalVat,
    })
    .returning({ id: invoices.id });
  return inv.id;
}

function buildRevenueData(fd: FormData) {
  return {
    productId: toNum(fd.get("productId")),
    reconciliationDate: toStrOrNull(fd.get("reconciliationDate")),
    minutesNumber: toStrOrNull(fd.get("minutesNumber")),
    phaseNumber: toNum(fd.get("phaseNumber")) || null,
    pmgCumulativePct: toPct(fd.get("pmgCumulativePct")),
    phasePctThisTime: toPct(fd.get("phasePctThisTime")),
    pmgSupportPct: toPct(fd.get("pmgSupportPct")),
    otherRevenuePct: toPct(fd.get("otherRevenuePct")),
    pmgBasePrice: toNum(fd.get("pmgBasePrice")),
    adminFeeVat: toNum(fd.get("adminFeeVat")),
    revenueThisTime: toNum(fd.get("revenueThisTime")),
    revenueOffProgress: toNum(fd.get("revenueOffProgress")),
    revenueReduction: toNum(fd.get("revenueReduction")),
    cdtBonusSale: toNum(fd.get("cdtBonusSale")),
    cdtBonusManager: toNum(fd.get("cdtBonusManager")),
    totalReceivableThisTime: toNum(fd.get("totalReceivableThisTime")),
    note: toStrOrNull(fd.get("note")),
  };
}

// Cập nhật product config từ các field "cfg*" trên form (nếu có).
// Revenue form là single source of truth cho HH/KPI/thưởng config.
// Ngoài ra: nếu pmgCumulativePct trên recon > product.pmgRate hiện tại
// → auto-cập nhật product.pmgRate (case hồi tố %HH tăng).
async function applyConfigToProduct(
  fd: FormData,
  productId: number,
  reconPmgCumulativePct?: number,
) {
  const cfg: Partial<typeof products.$inferInsert> = {};
  const hasField = (name: string) => fd.get(name) !== null;
  if (hasField("cfgPmgSaleRate")) cfg.pmgSaleRate = toPct(fd.get("cfgPmgSaleRate"));
  if (hasField("cfgSaleCommRate")) cfg.saleCommissionRate = toPct(fd.get("cfgSaleCommRate"));
  if (hasField("cfgKpiCeoRate")) cfg.kpiCeoRate = toPct(fd.get("cfgKpiCeoRate"));
  if (hasField("cfgKpiTpkdRate")) cfg.kpiTpkdRate = toPct(fd.get("cfgKpiTpkdRate"));
  if (hasField("cfgKpiAdminRate")) cfg.kpiAdminRate = toPct(fd.get("cfgKpiAdminRate"));
  if (hasField("cfgCdtBonusSale")) cfg.cdtBonusSale = toNum(fd.get("cfgCdtBonusSale"));
  if (hasField("cfgCdtBonusManager"))
    cfg.cdtBonusManager = toNum(fd.get("cfgCdtBonusManager"));
  if (hasField("cfgBonusSale")) cfg.bonusSale = toNum(fd.get("cfgBonusSale"));
  if (hasField("cfgBonusManager")) cfg.bonusManager = toNum(fd.get("cfgBonusManager"));
  if (hasField("cfgCustomerSupport")) cfg.customerSupport = toNum(fd.get("cfgCustomerSupport"));

  // Auto-update pmgRate nếu recon mới có %PMG cao hơn (hồi tố)
  if (reconPmgCumulativePct && reconPmgCumulativePct > 0) {
    const [current] = await db
      .select({ pmgRate: products.pmgRate })
      .from(products)
      .where(eq(products.id, productId));
    if (current && reconPmgCumulativePct > Number(current.pmgRate ?? 0)) {
      cfg.pmgRate = reconPmgCumulativePct;
    }
  }

  if (Object.keys(cfg).length === 0) return;
  await db.update(products).set(cfg).where(eq(products.id, productId));
}

export async function createRevenue(fd: FormData) {
  const data = buildRevenueData(fd);
  if (!data.productId) throw new Error("Chọn căn (sản phẩm)");

  const invoiceNumber = toStr(fd.get("invoiceNumber"));
  const invoiceDate = toStrOrNull(fd.get("invoiceDate"));
  const invoiceTotalVat = toNum(fd.get("invoiceTotalVat"));
  const invoiceId = await findOrCreateInvoice(invoiceNumber, invoiceDate, invoiceTotalVat);

  const [rec] = await db
    .insert(revenueReconciliations)
    .values({ ...data, invoiceId })
    .returning({ id: revenueReconciliations.id });

  await applyConfigToProduct(fd, data.productId, data.pmgCumulativePct);

  const paymentDate = toStrOrNull(fd.get("paymentDate"));
  const paymentAmount = toNum(fd.get("paymentAmount"));
  if (paymentDate || paymentAmount > 0) {
    await db.insert(paymentsIn).values({
      reconciliationId: rec.id,
      paymentDate,
      amount: paymentAmount,
    });
  }

  await logActivity({
    entityType: "revenue_reconciliation",
    entityId: rec.id,
    productId: data.productId,
    action: "create",
    after: { ...data, invoiceId } as Record<string, unknown>,
    summary: `Tạo ĐC doanh thu — ${Number(data.revenueThisTime ?? 0).toLocaleString("vi-VN")}`,
  });

  revalidatePath("/revenues");
  redirect("/revenues");
}

function safeReturnTo(fd: FormData): string | null {
  const raw = fd.get("__returnTo");
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  return s;
}

export async function updateRevenue(id: number, fd: FormData) {
  const data = buildRevenueData(fd);
  if (!data.productId) throw new Error("Chọn căn (sản phẩm)");

  const invoiceNumber = toStr(fd.get("invoiceNumber"));
  const invoiceDate = toStrOrNull(fd.get("invoiceDate"));
  const invoiceTotalVat = toNum(fd.get("invoiceTotalVat"));
  const invoiceId = await findOrCreateInvoice(invoiceNumber, invoiceDate, invoiceTotalVat);

  const [before] = await db
    .select()
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.id, id));
  await db
    .update(revenueReconciliations)
    .set({ ...data, invoiceId })
    .where(eq(revenueReconciliations.id, id));
  await logActivity({
    entityType: "revenue_reconciliation",
    entityId: id,
    productId: data.productId,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: { ...before, ...data, invoiceId } as unknown as Record<string, unknown>,
    summary: `Sửa ĐC doanh thu #${id}`,
  });

  await applyConfigToProduct(fd, data.productId, data.pmgCumulativePct);

  const returnTo = safeReturnTo(fd);
  revalidatePath("/revenues");
  revalidatePath(`/revenues/${id}/edit`);
  redirect(returnTo ?? "/revenues");
}

export async function deleteRevenue(id: number) {
  const [before] = await db
    .select()
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.id, id));
  await db.delete(paymentsIn).where(eq(paymentsIn.reconciliationId, id));
  await db.delete(revenueReconciliations).where(eq(revenueReconciliations.id, id));
  await logActivity({
    entityType: "revenue_reconciliation",
    entityId: id,
    productId: before?.productId,
    action: "delete",
    before: before as unknown as Record<string, unknown>,
    summary: `Xóa ĐC doanh thu #${id}`,
  });
  revalidatePath("/revenues");
  redirect("/revenues");
}

export async function addPaymentIn(reconciliationId: number, fd: FormData) {
  const paymentDate = toStrOrNull(fd.get("paymentDate"));
  const amount = toNum(fd.get("amount"));
  if (!amount && !paymentDate) throw new Error("Nhập ngày hoặc số tiền");
  await db.insert(paymentsIn).values({
    reconciliationId,
    paymentDate,
    amount,
    note: toStrOrNull(fd.get("note")),
  });
  revalidatePath("/revenues");
}

export async function deletePaymentIn(id: number) {
  await db.delete(paymentsIn).where(eq(paymentsIn.id, id));
  revalidatePath("/revenues");
}

export type BulkRevenueRow = {
  productId: number;
  reconciliationDate?: string | null;
  minutesNumber?: string;
  reconType: string; // "commission" | "bonus_sale" | "bonus_manager"
  amount: number;
  phasePctThisTime?: number; // display value 0-100 (%PMG đợt này)
  pmgCumulativePct?: number; // display value 0-100 (%PMG lũy kế)
  invoiceNumber?: string;
  invoiceDate?: string | null;
  invoiceTotalVat?: number;
  paymentDate?: string | null;
  paymentAmount?: number;
  note?: string;
};

export async function createRevenueBulk(rows: BulkRevenueRow[]) {
  let ok = 0;
  const errors: Array<{ index: number; message: string }> = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.productId) throw new Error("Thiếu căn");
      if (!r.reconType) throw new Error("Thiếu loại đợt");
      const isCommission = r.reconType === "commission";
      const revenueThisTime = isCommission ? r.amount : 0;
      const cdtBonusSale = r.reconType === "bonus_sale" ? r.amount : 0;
      const cdtBonusManager = r.reconType === "bonus_manager" ? r.amount : 0;

      let invoiceId: number | null = null;
      if (r.invoiceNumber) {
        invoiceId = await findOrCreateInvoice(
          r.invoiceNumber,
          r.invoiceDate ?? null,
          r.invoiceTotalVat ?? 0,
        );
      }
      const [inserted] = await db
        .insert(revenueReconciliations)
        .values({
          productId: r.productId,
          reconciliationDate: r.reconciliationDate ?? null,
          minutesNumber: r.minutesNumber ?? null,
          phaseNumber: null,
          phasePctThisTime: r.phasePctThisTime ? r.phasePctThisTime / 100 : 0,
          pmgCumulativePct: r.pmgCumulativePct ? r.pmgCumulativePct / 100 : 0,
          revenueThisTime,
          cdtBonusSale,
          cdtBonusManager,
          totalReceivableThisTime: r.amount,
          note: r.note ?? null,
          invoiceId,
        })
        .returning({ id: revenueReconciliations.id });

      // Nếu có thông tin thanh toán → insert payments_in.
      if (r.paymentAmount && r.paymentAmount > 0 && inserted) {
        await db.insert(paymentsIn).values({
          reconciliationId: inserted.id,
          paymentDate: r.paymentDate ?? null,
          amount: r.paymentAmount,
        });
      }
      ok++;
    } catch (e) {
      errors.push({ index: i, message: e instanceof Error ? e.message : "Lỗi" });
    }
  }
  revalidatePath("/revenues");
  return { ok, errors };
}

export async function updatePaymentIn(id: number, fd: FormData) {
  await db
    .update(paymentsIn)
    .set({
      paymentDate: toStrOrNull(fd.get("paymentDate")),
      amount: toNum(fd.get("amount")),
      note: toStrOrNull(fd.get("note")),
    })
    .where(eq(paymentsIn.id, id));
  revalidatePath("/revenues");
}
