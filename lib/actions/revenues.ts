"use server";

import { db } from "@/lib/db";
import { revenueReconciliations, invoices, paymentsIn } from "@/lib/schema";
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
