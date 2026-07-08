"use server";

import { db } from "@/lib/db";
import { revenueReconciliations, invoices, paymentsIn, products } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function toNum(v: FormDataEntryValue | null): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = Number(s.replace(/[.,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}
function toStr(v: FormDataEntryValue | null): string {
  return v === null ? "" : String(v).trim();
}
function toStrOrNull(v: FormDataEntryValue | null): string | null {
  const s = toStr(v);
  return s === "" ? null : s;
}
function toPct(v: FormDataEntryValue | null): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace(/,/g, ".").replace(/\s/g, "");
  if (!s) return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n / 100;
}

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
async function applyConfigToProduct(fd: FormData, productId: number) {
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

  await applyConfigToProduct(fd, data.productId);

  const paymentDate = toStrOrNull(fd.get("paymentDate"));
  const paymentAmount = toNum(fd.get("paymentAmount"));
  if (paymentDate || paymentAmount > 0) {
    await db.insert(paymentsIn).values({
      reconciliationId: rec.id,
      paymentDate,
      amount: paymentAmount,
    });
  }

  revalidatePath("/revenues");
  redirect("/revenues");
}

export async function updateRevenue(id: number, fd: FormData) {
  const data = buildRevenueData(fd);
  if (!data.productId) throw new Error("Chọn căn (sản phẩm)");

  const invoiceNumber = toStr(fd.get("invoiceNumber"));
  const invoiceDate = toStrOrNull(fd.get("invoiceDate"));
  const invoiceTotalVat = toNum(fd.get("invoiceTotalVat"));
  const invoiceId = await findOrCreateInvoice(invoiceNumber, invoiceDate, invoiceTotalVat);

  await db
    .update(revenueReconciliations)
    .set({ ...data, invoiceId })
    .where(eq(revenueReconciliations.id, id));

  await applyConfigToProduct(fd, data.productId);

  revalidatePath("/revenues");
  revalidatePath(`/revenues/${id}/edit`);
  redirect("/revenues");
}

export async function deleteRevenue(id: number) {
  await db.delete(paymentsIn).where(eq(paymentsIn.reconciliationId, id));
  await db.delete(revenueReconciliations).where(eq(revenueReconciliations.id, id));
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
  reconType: string; // "phase:N" or "bonus_sale" or "bonus_manager"
  amount: number;
  pmgCumulativePct?: number; // display value 0-100
  invoiceNumber?: string;
  invoiceDate?: string | null;
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
      const isPhase = r.reconType.startsWith("phase:");
      const phaseN = isPhase ? Number(r.reconType.split(":")[1]) : null;
      const revenueThisTime = isPhase ? r.amount : 0;
      const cdtBonusSale = r.reconType === "bonus_sale" ? r.amount : 0;
      const cdtBonusManager = r.reconType === "bonus_manager" ? r.amount : 0;

      let invoiceId: number | null = null;
      if (r.invoiceNumber) {
        invoiceId = await findOrCreateInvoice(r.invoiceNumber, r.invoiceDate ?? null, 0);
      }
      await db.insert(revenueReconciliations).values({
        productId: r.productId,
        reconciliationDate: r.reconciliationDate ?? null,
        phaseNumber: phaseN,
        pmgCumulativePct: r.pmgCumulativePct ? r.pmgCumulativePct / 100 : 0,
        revenueThisTime,
        cdtBonusSale,
        cdtBonusManager,
        totalReceivableThisTime: r.amount,
        note: r.note ?? null,
        invoiceId,
      });
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
