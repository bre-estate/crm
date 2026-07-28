"use server";

import { db } from "@/lib/db";
import { costReconciliations, paymentsOut } from "@/lib/schema";
import { toTitleCase } from "@/lib/format";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/audit";
import { toNum, toStr, toStrOrNull, toPct } from "@/lib/parse";

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
    employeeName: toTitleCase(toStr(fd.get("employeeName"))),
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
    // N = Tiến độ PMG đã thu tiền (0..1). Form submit dạng decimal (0.9 = 90%).
    paymentProgressPct: (() => {
      const raw = toStr(fd.get("paymentProgressPct"));
      if (!raw) return 0;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    })(),
    amountPayableThisTime: toNum(fd.get("amountPayableThisTime")),
    note: toStrOrNull(fd.get("note")),
  };
}

export async function createCost(fd: FormData) {
  const data = buildCostData(fd);
  if (!data.productId) throw new Error("Chọn căn (sản phẩm)");
  if (!data.employeeName) throw new Error("Nhập tên người được đối chiếu");

  // KPI Admin: chỉ được ĐC 1 lần / căn (chốt với team - vì số nhỏ).
  if (data.costType === "kpi_admin") {
    const existing = await db
      .select({ id: costReconciliations.id })
      .from(costReconciliations)
      .where(
        and(
          eq(costReconciliations.productId, data.productId),
          eq(costReconciliations.costType, "kpi_admin"),
        ),
      );
    if (existing.length > 0) {
      throw new Error(
        `KPI Admin cho căn này đã có (#${existing[0].id}). Mỗi căn chỉ được ĐC 1 lần cho KPI Admin.`,
      );
    }
  }

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

  await logActivity({
    entityType: "cost_reconciliation",
    entityId: rec.id,
    productId: data.productId,
    action: "create",
    after: data as Record<string, unknown>,
    summary: `Tạo ĐC giá vốn (${data.costType}) cho ${data.employeeName} — ${Number(data.amountPayableThisTime ?? 0).toLocaleString("vi-VN")}`,
  });

  revalidatePath("/costs");
  redirect(`/costs/${rec.id}/edit?created=1`);
}

function buildReturnUrl(returnTo: string | null | undefined, flag: string, id: number): string {
  const safe = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/costs";
  const sep = safe.includes("?") ? "&" : "?";
  return `${safe}${sep}${flag}=${id}`;
}

export async function updateCost(id: number, fd: FormData, returnTo?: string | null) {
  const data = buildCostData(fd);
  if (!data.productId) throw new Error("Chọn căn (sản phẩm)");
  if (!data.employeeName) throw new Error("Nhập tên người được đối chiếu");

  const [before] = await db
    .select()
    .from(costReconciliations)
    .where(eq(costReconciliations.id, id));
  await db.update(costReconciliations).set(data).where(eq(costReconciliations.id, id));
  await logActivity({
    entityType: "cost_reconciliation",
    entityId: id,
    productId: data.productId,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: { ...before, ...data } as unknown as Record<string, unknown>,
    summary: `Sửa ĐC giá vốn #${id}`,
  });

  revalidatePath("/costs");
  revalidatePath(`/costs/${id}/edit`);
  redirect(buildReturnUrl(returnTo, "updated", id));
}

export async function deleteCost(id: number, returnTo?: string | null) {
  const [before] = await db
    .select()
    .from(costReconciliations)
    .where(eq(costReconciliations.id, id));
  await db.delete(paymentsOut).where(eq(paymentsOut.costReconciliationId, id));
  await db.delete(costReconciliations).where(eq(costReconciliations.id, id));
  await logActivity({
    entityType: "cost_reconciliation",
    entityId: id,
    productId: before?.productId,
    action: "delete",
    before: before as unknown as Record<string, unknown>,
    summary: `Xóa ĐC giá vốn #${id}`,
  });
  revalidatePath("/costs");
  redirect(buildReturnUrl(returnTo, "deleted", id));
}

/**
 * Bulk xóa nhiều ĐC giá vốn. Xóa luôn payments_out gắn kèm mỗi recon.
 */
export async function deleteCostBulk(ids: number[]) {
  const errors: { id: number; message: string }[] = [];
  const deletedIds: number[] = [];
  for (const id of ids) {
    try {
      const [before] = await db
        .select()
        .from(costReconciliations)
        .where(eq(costReconciliations.id, id));
      if (!before) {
        errors.push({ id, message: "Không tồn tại" });
        continue;
      }
      await db.delete(paymentsOut).where(eq(paymentsOut.costReconciliationId, id));
      await db.delete(costReconciliations).where(eq(costReconciliations.id, id));
      await logActivity({
        entityType: "cost_reconciliation",
        entityId: id,
        productId: before.productId,
        action: "delete",
        before: before as unknown as Record<string, unknown>,
        summary: `Xóa ĐC giá vốn #${id} (bulk)`,
      });
      deletedIds.push(id);
    } catch (e) {
      errors.push({ id, message: e instanceof Error ? e.message : "Lỗi" });
    }
  }
  revalidatePath("/costs");
  return { ok: deletedIds.length, deletedIds, errors };
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

export async function updatePaymentOut(id: number, fd: FormData) {
  await db
    .update(paymentsOut)
    .set({
      paymentDate: toStrOrNull(fd.get("paymentDate")),
      amount: toNum(fd.get("amount")),
      note: toStrOrNull(fd.get("note")),
    })
    .where(eq(paymentsOut.id, id));
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

      if (r.costType === "kpi_admin") {
        const existing = await db
          .select({ id: costReconciliations.id })
          .from(costReconciliations)
          .where(
            and(
              eq(costReconciliations.productId, r.productId),
              eq(costReconciliations.costType, "kpi_admin"),
            ),
          );
        if (existing.length > 0) {
          throw new Error(`KPI Admin căn đã có (#${existing[0].id}), không cho ĐC 2 lần`);
        }
      }

      const [rec] = await db
        .insert(costReconciliations)
        .values({
          productId: r.productId,
          costType: r.costType as CostType,
          employeeName: toTitleCase(r.employeeName),
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
