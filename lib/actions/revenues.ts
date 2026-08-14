"use server";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { revenueReconciliations, invoices, paymentsIn, products, projects } from "@/lib/schema";
import { and, eq, sql, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/audit";
import { toNum, toStr, toStrOrNull, toPct } from "@/lib/parse";

// Suy partner_id từ product → project → partner_id.
// Mỗi CĐT có sổ HĐ riêng, số HĐ có thể trùng giữa các CĐT → partner_id
// PHẢI vào key khớp để không nhầm gộp 2 HĐ khác CĐT thành 1.
async function resolvePartnerId(productId: number | null): Promise<number | null> {
  if (!productId) return null;
  const [row] = await db
    .select({ partnerId: projects.partnerId })
    .from(products)
    .leftJoin(projects, eq(projects.id, products.projectId))
    .where(eq(products.id, productId));
  return row?.partnerId ?? null;
}

async function findOrCreateInvoice(
  number: string,
  date: string | null,
  productId: number | null,
): Promise<number | null> {
  if (!number && !date) return null;
  const safeNumber = number || "(chưa có số)";
  const partnerId = await resolvePartnerId(productId);
  const existing = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.invoiceNumber, safeNumber),
        date ? eq(invoices.invoiceDate, date) : eq(invoices.invoiceDate, ""),
        partnerId === null
          ? isNull(invoices.partnerId)
          : eq(invoices.partnerId, partnerId),
      ),
    );
  if (existing[0]) return existing[0].id;
  const [inv] = await db
    .insert(invoices)
    .values({
      invoiceNumber: safeNumber,
      invoiceDate: date,
      partnerId,
      totalAmountVat: 0,
    })
    .returning({ id: invoices.id });
  return inv.id;
}

/**
 * totalAmountVat của invoice = sum(totalReceivableThisTime) từ mọi recon liên kết.
 * User không tự nhập được — luôn auto tính sau mỗi lần recon thay đổi.
 *
 * Bonus: nếu invoice không còn recon nào → auto delete (chống orphan). Bug xảy ra
 * khi user đổi ngày HĐ trên form revenue: findOrCreateInvoice tạo invoice mới,
 * invoice cũ mất hết recon và trở thành orphan trong /invoices list.
 */
async function recomputeInvoiceTotal(invoiceId: number | null): Promise<void> {
  if (!invoiceId) return;
  const [row] = await db
    .select({
      cnt: sql<number>`COUNT(*)::int`,
      total: sql<string>`COALESCE(SUM(${revenueReconciliations.totalReceivableThisTime}), 0)`,
    })
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.invoiceId, invoiceId));
  const cnt = Number(row?.cnt ?? 0);
  const total = Number(row?.total ?? 0);
  if (cnt === 0) {
    // Auto-cleanup orphan invoice
    await db.delete(invoices).where(eq(invoices.id, invoiceId));
    return;
  }
  await db.update(invoices).set({ totalAmountVat: total }).where(eq(invoices.id, invoiceId));
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
  await requirePermission("revenues", "edit");
  const data = buildRevenueData(fd);
  if (!data.productId) throw new Error("Chọn căn (sản phẩm)");

  const invoiceNumber = toStr(fd.get("invoiceNumber"));
  const invoiceDate = toStrOrNull(fd.get("invoiceDate"));
  const invoiceId = await findOrCreateInvoice(invoiceNumber, invoiceDate, data.productId);

  // ===== Merge model: 1 record chứa mọi loại cùng invoice =====
  // Đọc từ repeater rows (bonus_count + bonus_${i}_*), MERGE vào 1 record duy
  // nhất với 3 field amounts + notes JSONB per loại.
  //   revenueThisTime = row nào type=commission (hoặc từ buildRevenueData)
  //   cdtBonusSale/Manager = row bonus tương ứng
  //   notes = { commission: "...", bonus_sale: "...", bonus_manager: "..." }
  const notes: Record<string, string> = {};

  // Row 0 (commission — main row) — data đã có từ buildRevenueData
  // Chỉ ghi note khi user điền
  const mainNote = toStrOrNull(fd.get("note"));
  if (data.revenueThisTime && mainNote) notes.commission = mainNote;

  // Bonus rows — merge vào cùng record
  let cdtBonusSale = 0;
  let cdtBonusManager = 0;
  const bonusCount = toNum(fd.get("bonus_count"));
  for (let i = 0; i < bonusCount; i++) {
    const type = toStr(fd.get(`bonus_${i}_type`));
    const amount = toNum(fd.get(`bonus_${i}_amount`));
    const note = toStrOrNull(fd.get(`bonus_${i}_note`));
    if (amount === 0) continue;
    if (type === "bonus_sale") {
      cdtBonusSale += amount;
      if (note) notes.bonus_sale = note;
    } else if (type === "bonus_manager") {
      cdtBonusManager += amount;
      if (note) notes.bonus_manager = note;
    }
  }

  // Special case: nếu user chọn row 0 = bonus (không phải commission), buildRevenueData
  // đã route amount vào cdtBonusSale hoặc cdtBonusManager. Notes cho loại đó:
  if (Number(data.cdtBonusSale ?? 0) > 0 && mainNote) notes.bonus_sale = mainNote;
  if (Number(data.cdtBonusManager ?? 0) > 0 && mainNote) notes.bonus_manager = mainNote;

  const totalReceivable =
    Number(data.revenueThisTime ?? 0) +
    Number(data.cdtBonusSale ?? 0) +
    Number(data.cdtBonusManager ?? 0) +
    cdtBonusSale +
    cdtBonusManager;

  // Guard: không tạo recon rỗng (mọi amount = 0 + không có date). Tránh
  // double-submit / form trống lọt vào DB thành "Chưa ĐC" ma.
  if (totalReceivable === 0 && !data.reconciliationDate) {
    throw new Error("Đợt đối chiếu trống — cần có ngày ĐC hoặc số tiền > 0");
  }

  const [rec] = await db
    .insert(revenueReconciliations)
    .values({
      ...data,
      cdtBonusSale: Number(data.cdtBonusSale ?? 0) + cdtBonusSale,
      cdtBonusManager: Number(data.cdtBonusManager ?? 0) + cdtBonusManager,
      totalReceivableThisTime: totalReceivable,
      notes,
      invoiceId,
    })
    .returning({ id: revenueReconciliations.id });

  await applyConfigToProduct(fd, data.productId, data.pmgCumulativePct);

  await recomputeInvoiceTotal(invoiceId);

  await logActivity({
    entityType: "revenue_reconciliation",
    entityId: rec.id,
    productId: data.productId,
    action: "create",
    after: { ...data, invoiceId, notes, totalReceivable } as Record<string, unknown>,
    summary: (() => {
      const parts: string[] = [];
      const rev = Number(data.revenueThisTime ?? 0);
      const bs = Number(data.cdtBonusSale ?? 0) + cdtBonusSale;
      const bm = Number(data.cdtBonusManager ?? 0) + cdtBonusManager;
      if (rev > 0) parts.push(`hoa hồng ${rev.toLocaleString("vi-VN")}`);
      if (bs > 0) parts.push(`thưởng sale ${bs.toLocaleString("vi-VN")}`);
      if (bm > 0) parts.push(`thưởng QL ${bm.toLocaleString("vi-VN")}`);
      return `Tạo ĐC doanh thu — ${parts.join(" + ")}`;
    })(),
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
  await requirePermission("revenues", "edit");
  const data = buildRevenueData(fd);
  if (!data.productId) throw new Error("Chọn căn (sản phẩm)");

  const invoiceNumber = toStr(fd.get("invoiceNumber"));
  const invoiceDate = toStrOrNull(fd.get("invoiceDate"));
  const invoiceId = await findOrCreateInvoice(invoiceNumber, invoiceDate, data.productId);

  const [before] = await db
    .select()
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.id, id));

  // ===== Merge model: đọc repeater rows + build notes JSONB =====
  // Giống createRevenue nhưng UPDATE record hiện có, không insert mới.
  const notes: Record<string, string> = {};
  const mainNote = toStrOrNull(fd.get("note"));
  if (data.revenueThisTime && mainNote) notes.commission = mainNote;

  let cdtBonusSale = 0;
  let cdtBonusManager = 0;
  const bonusCount = toNum(fd.get("bonus_count"));
  for (let i = 0; i < bonusCount; i++) {
    const type = toStr(fd.get(`bonus_${i}_type`));
    const amount = toNum(fd.get(`bonus_${i}_amount`));
    const note = toStrOrNull(fd.get(`bonus_${i}_note`));
    if (amount === 0) continue;
    if (type === "bonus_sale") {
      cdtBonusSale += amount;
      if (note) notes.bonus_sale = note;
    } else if (type === "bonus_manager") {
      cdtBonusManager += amount;
      if (note) notes.bonus_manager = note;
    }
  }
  if (Number(data.cdtBonusSale ?? 0) > 0 && mainNote) notes.bonus_sale = mainNote;
  if (Number(data.cdtBonusManager ?? 0) > 0 && mainNote) notes.bonus_manager = mainNote;

  const finalCdtSale = Number(data.cdtBonusSale ?? 0) + cdtBonusSale;
  const finalCdtMgr = Number(data.cdtBonusManager ?? 0) + cdtBonusManager;
  const totalReceivable =
    Number(data.revenueThisTime ?? 0) + finalCdtSale + finalCdtMgr;

  await db
    .update(revenueReconciliations)
    .set({
      ...data,
      cdtBonusSale: finalCdtSale,
      cdtBonusManager: finalCdtMgr,
      totalReceivableThisTime: totalReceivable,
      notes,
      invoiceId,
    })
    .where(eq(revenueReconciliations.id, id));

  // Recompute invoice cũ (nếu bị bỏ) + invoice mới (nếu vừa gắn)
  if (before?.invoiceId && before.invoiceId !== invoiceId) {
    await recomputeInvoiceTotal(before.invoiceId);
  }
  await recomputeInvoiceTotal(invoiceId);
  await logActivity({
    entityType: "revenue_reconciliation",
    entityId: id,
    productId: data.productId,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: {
      ...before,
      ...data,
      cdtBonusSale: finalCdtSale,
      cdtBonusManager: finalCdtMgr,
      totalReceivableThisTime: totalReceivable,
      notes,
      invoiceId,
    } as unknown as Record<string, unknown>,
    summary: `Sửa ĐC doanh thu #${id}`,
  });

  await applyConfigToProduct(fd, data.productId, data.pmgCumulativePct);

  const returnTo = safeReturnTo(fd);
  revalidatePath("/revenues");
  revalidatePath(`/revenues/${id}/edit`);
  redirect(returnTo ?? "/revenues");
}

export async function deleteRevenue(id: number) {
  await requirePermission("revenues", "delete");
  const [before] = await db
    .select()
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.id, id));
  await db.delete(paymentsIn).where(eq(paymentsIn.reconciliationId, id));
  await db.delete(revenueReconciliations).where(eq(revenueReconciliations.id, id));
  if (before?.invoiceId) await recomputeInvoiceTotal(before.invoiceId);
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

/**
 * Bulk xóa nhiều ĐC doanh thu. Không redirect — trả về summary.
 * KHÔNG guard payment (khác products): recon có payment vẫn cho xóa (payments_in
 * là detail phụ của recon; xóa recon = xóa payment gắn kèm).
 */
export async function deleteRevenueBulk(ids: number[]) {
  await requirePermission("revenues", "delete");
  const errors: { id: number; message: string }[] = [];
  const deletedIds: number[] = [];
  const affectedInvoices = new Set<number>();
  for (const id of ids) {
    try {
      const [before] = await db
        .select()
        .from(revenueReconciliations)
        .where(eq(revenueReconciliations.id, id));
      if (!before) {
        errors.push({ id, message: "Không tồn tại" });
        continue;
      }
      await db.delete(paymentsIn).where(eq(paymentsIn.reconciliationId, id));
      await db.delete(revenueReconciliations).where(eq(revenueReconciliations.id, id));
      if (before.invoiceId) affectedInvoices.add(before.invoiceId);
      await logActivity({
        entityType: "revenue_reconciliation",
        entityId: id,
        productId: before.productId,
        action: "delete",
        before: before as unknown as Record<string, unknown>,
        summary: `Xóa ĐC doanh thu #${id} (bulk)`,
      });
      deletedIds.push(id);
    } catch (e) {
      errors.push({ id, message: e instanceof Error ? e.message : "Lỗi" });
    }
  }
  for (const invId of affectedInvoices) await recomputeInvoiceTotal(invId);
  revalidatePath("/revenues");
  return { ok: deletedIds.length, deletedIds, errors };
}

export async function addPaymentIn(reconciliationId: number, fd: FormData) {
  await requirePermission("revenues", "edit");
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
  await requirePermission("revenues", "delete");
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
  paymentDate?: string | null;
  paymentAmount?: number;
  note?: string;
};

export async function createRevenueBulk(rows: BulkRevenueRow[]) {
  await requirePermission("revenues", "edit");
  const createdIds: number[] = [];
  const errors: Array<{ index: number; message: string }> = [];
  const affectedInvoices = new Set<number>();
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
        invoiceId = await findOrCreateInvoice(r.invoiceNumber, r.invoiceDate ?? null, r.productId);
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

      if (invoiceId) affectedInvoices.add(invoiceId);

      // Nếu có thông tin thanh toán → insert payments_in.
      if (r.paymentAmount && r.paymentAmount !== 0 && inserted) {
        await db.insert(paymentsIn).values({
          reconciliationId: inserted.id,
          paymentDate: r.paymentDate ?? null,
          amount: r.paymentAmount,
        });
      }
      createdIds.push(inserted.id);
    } catch (e) {
      errors.push({ index: i, message: e instanceof Error ? e.message : "Lỗi" });
    }
  }
  for (const invId of affectedInvoices) await recomputeInvoiceTotal(invId);
  revalidatePath("/revenues");
  return { ok: createdIds.length, createdIds, errors };
}

export async function updatePaymentIn(id: number, fd: FormData) {
  await requirePermission("revenues", "edit");
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
