"use server";

import { db } from "@/lib/db";
import { costReconciliations, paymentsOut } from "@/lib/schema";
import { eq } from "drizzle-orm";
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

const VALID_COST_TYPES = [
  "sale_commission",
  "customer_support",
  "bonus_sale",
  "bonus_manager",
  "cdt_bonus_sale",
  "cdt_bonus_manager",
  "kpi_ceo",
  "kpi_tpkd",
  "kpi_admin",
] as const;
type CostType = (typeof VALID_COST_TYPES)[number];

function buildCostData(fd: FormData) {
  const costTypeRaw = toStr(fd.get("costType"));
  const costType: CostType = VALID_COST_TYPES.includes(costTypeRaw as CostType)
    ? (costTypeRaw as CostType)
    : "sale_commission";

  return {
    productId: toNum(fd.get("productId")),
    reconciliationDate: toStrOrNull(fd.get("reconciliationDate")),
    employeeName: toStr(fd.get("employeeName")),
    costType,
    pmgBasePriceSale: toNum(fd.get("pmgBasePriceSale")),
    pmgLkSaleRate: toPct(fd.get("pmgLkSaleRate")),
    pmgProgressAmount: toNum(fd.get("pmgProgressAmount")),
    pmgCumulativePctSale: toPct(fd.get("pmgCumulativePctSale")),
    commissionRate: toPct(fd.get("commissionRate")),
    adminFeeSale: toNum(fd.get("adminFeeSale")),
    customerSupport: toNum(fd.get("customerSupport")),
    fiscalYear: toNum(fd.get("fiscalYear")) || null,
    pmgReconciledCumulative: toNum(fd.get("pmgReconciledCumulative")),
    pmgThisTime: toNum(fd.get("pmgThisTime")),
    pmgPayable: toNum(fd.get("pmgPayable")),
    pmgRemaining: toNum(fd.get("pmgRemaining")),
    kpiRate: toPct(fd.get("kpiRate")),
    kpiAmount: toNum(fd.get("kpiAmount")),
    amountPayableThisTime: toNum(fd.get("amountPayableThisTime")),
    note: toStrOrNull(fd.get("note")),
  };
}

export async function createCost(fd: FormData) {
  const data = buildCostData(fd);
  if (!data.productId) throw new Error("Chọn căn (sản phẩm)");
  if (!data.employeeName) throw new Error("Nhập tên người được đối chiếu");

  const [rec] = await db
    .insert(costReconciliations)
    .values(data)
    .returning({ id: costReconciliations.id });

  const paymentDate = toStrOrNull(fd.get("paymentDate"));
  const paymentAmount = toNum(fd.get("paymentAmount"));
  if (paymentDate || paymentAmount > 0) {
    await db.insert(paymentsOut).values({
      costReconciliationId: rec.id,
      paymentDate,
      amount: paymentAmount,
    });
  }

  revalidatePath("/costs");
  redirect("/costs");
}

export async function updateCost(id: number, fd: FormData) {
  const data = buildCostData(fd);
  if (!data.productId) throw new Error("Chọn căn (sản phẩm)");
  if (!data.employeeName) throw new Error("Nhập tên người được đối chiếu");

  await db.update(costReconciliations).set(data).where(eq(costReconciliations.id, id));

  revalidatePath("/costs");
  revalidatePath(`/costs/${id}/edit`);
  redirect("/costs");
}

export async function deleteCost(id: number) {
  await db.delete(paymentsOut).where(eq(paymentsOut.costReconciliationId, id));
  await db.delete(costReconciliations).where(eq(costReconciliations.id, id));
  revalidatePath("/costs");
  redirect("/costs");
}

export async function addPaymentOut(costReconciliationId: number, fd: FormData) {
  const paymentDate = toStrOrNull(fd.get("paymentDate"));
  const amount = toNum(fd.get("amount"));
  if (!amount && !paymentDate) throw new Error("Nhập ngày hoặc số tiền");
  await db.insert(paymentsOut).values({
    costReconciliationId,
    paymentDate,
    amount,
    note: toStrOrNull(fd.get("note")),
  });
  revalidatePath("/costs");
}

export async function deletePaymentOut(id: number) {
  await db.delete(paymentsOut).where(eq(paymentsOut.id, id));
  revalidatePath("/costs");
}

export type BulkCostRow = {
  productId: number;
  costType: string;
  employeeName: string;
  reconciliationDate: string | null;
  amountPayableThisTime: number;
  paymentDate: string | null;
  paymentAmount: number;
  note?: string;
};

export async function createCostBulk(rows: BulkCostRow[]) {
  const errors: { index: number; message: string }[] = [];
  let ok = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.productId) throw new Error("Thiếu căn");
      if (!VALID_COST_TYPES.includes(r.costType as CostType))
        throw new Error(`Loại chi phí không hợp lệ: ${r.costType}`);
      if (!r.employeeName) throw new Error("Thiếu tên NVKD/TPKD");
      if (r.amountPayableThisTime <= 0) throw new Error("Số tiền phải > 0");

      const [rec] = await db
        .insert(costReconciliations)
        .values({
          productId: r.productId,
          costType: r.costType as CostType,
          employeeName: r.employeeName,
          reconciliationDate: r.reconciliationDate,
          amountPayableThisTime: r.amountPayableThisTime,
          note: r.note ?? null,
        })
        .returning({ id: costReconciliations.id });

      if (r.paymentDate || r.paymentAmount > 0) {
        await db.insert(paymentsOut).values({
          costReconciliationId: rec.id,
          paymentDate: r.paymentDate,
          amount: r.paymentAmount || r.amountPayableThisTime,
        });
      }
      ok++;
    } catch (e) {
      errors.push({ index: i, message: e instanceof Error ? e.message : "Lỗi" });
    }
  }
  revalidatePath("/costs");
  return { ok, errors };
}
