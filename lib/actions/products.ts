"use server";

import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  revenueReconciliations,
  costReconciliations,
  productAdjustments,
} from "@/lib/schema";
import { toTitleCase } from "@/lib/format";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/audit";

import { toNum, toStr, toStrOrNull, toPct, safeReturnTo as safeReturnToShared } from "@/lib/parse";

async function buildProductCode(projectId: number, unitCode: string): Promise<string> {
  const [pj] = await db
    .select({ projectCode: projects.code, partnerCode: partners.code })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .where(eq(projects.id, projectId));
  if (!pj) throw new Error("Dự án không tồn tại");
  return `${pj.projectCode}_${pj.partnerCode ?? "XXXX"}_${unitCode}`;
}

// Only allow relative same-origin returnTo (e.g., /products?dept=1) — reject
// absolute URLs, protocol-relative (//evil.com), or empty strings.
function safeReturnTo(fd: FormData): string | null {
  return safeReturnToShared(fd.get("__returnTo"));
}

function buildProductData(fd: FormData) {
  const saleTypeRaw = toStr(fd.get("saleType"));
  const saleType: "primary" | "secondary" = saleTypeRaw === "secondary" ? "secondary" : "primary";
  return {
    unitCode: toStr(fd.get("unitCode")),
    projectId: toNum(fd.get("projectId")),
    customerName: toStrOrNull(fd.get("customerName"))
      ? toTitleCase(toStr(fd.get("customerName")))
      : null,
    unitDescription: toStrOrNull(fd.get("unitDescription")),
    salesPerson: toStrOrNull(fd.get("salesPerson"))
      ? toTitleCase(toStr(fd.get("salesPerson")))
      : null,
    deptName: toStrOrNull(fd.get("deptName")),
    departmentId: toNum(fd.get("departmentId")) || null,
    depositDate: toStrOrNull(fd.get("depositDate")),
    expectedCompleteDate: toStrOrNull(fd.get("expectedCompleteDate")),
    recognitionMonth: toStrOrNull(fd.get("recognitionMonth")),
    saleType,
    paymentMethod: toStrOrNull(fd.get("paymentMethod")),

    sellPrice: toNum(fd.get("sellPrice")),
    pmgBasePrice: toNum(fd.get("pmgBasePrice")),
    totalRevenue: toNum(fd.get("totalRevenue")),
    totalCost: toNum(fd.get("totalCost")),

    pmgRate: toPct(fd.get("pmgRate")),
    pmgRateHistory: toStrOrNull(fd.get("pmgRateHistory")),
    otherFeePct: toPct(fd.get("otherFeePct")),
    otherRevenue: toNum(fd.get("otherRevenue")),
    revenueReduction: toNum(fd.get("revenueReduction")),
    adminFee: toNum(fd.get("adminFee")),

    cdtBonusSale: toNum(fd.get("cdtBonusSale")),
    cdtBonusManager: toNum(fd.get("cdtBonusManager")),

    pmgSaleRate: toPct(fd.get("pmgSaleRate")),
    saleCommissionRate: toPct(fd.get("saleCommissionRate")),
    adminFeeSale: toNum(fd.get("adminFeeSale")),
    customerSupport: toNum(fd.get("customerSupport")),
    bonusSale: toNum(fd.get("bonusSale")),
    bonusManager: toNum(fd.get("bonusManager")),

    kpiCeoRate: toPct(fd.get("kpiCeoRate")),
    kpiTpkdRate: toPct(fd.get("kpiTpkdRate")),
    kpiAdminRate: toPct(fd.get("kpiAdminRate")),

    otherCost: toNum(fd.get("otherCost")),
    note: toStrOrNull(fd.get("note")),
  };
}

export async function createProduct(fd: FormData) {
  const data = buildProductData(fd);
  if (!data.projectId || !data.unitCode) throw new Error("Chọn dự án và nhập mã căn");
  const productCode = await buildProductCode(data.projectId, data.unitCode);
  const [rec] = await db
    .insert(products)
    .values({ productCode, ...data })
    .returning({ id: products.id });
  // Compute total_revenue + total_cost từ config vừa nhập.
  // Nếu skip → row hiện 0 trong list, user phải mở edit + save mới cập nhật.
  await recomputeDerived(rec.id);
  await logActivity({
    entityType: "product",
    entityId: rec.id,
    productId: rec.id,
    action: "create",
    after: { productCode, ...data } as Record<string, unknown>,
    summary: `Tạo căn ${data.unitCode}`,
  });
  revalidatePath("/products");
  redirect("/products");
}

export async function updateProduct(id: number, fd: FormData) {
  const data = buildProductData(fd);
  if (!data.projectId || !data.unitCode) throw new Error("Chọn dự án và nhập mã căn");
  const productCode = await buildProductCode(data.projectId, data.unitCode);
  const [before] = await db.select().from(products).where(eq(products.id, id));
  await db.update(products).set({ productCode, ...data }).where(eq(products.id, id));
  // Recompute total_revenue + total_cost sau update (config có thể đổi
  // pmg_base, pmg_rate, admin, thưởng → totals phải sync).
  await recomputeDerived(id);
  await logActivity({
    entityType: "product",
    entityId: id,
    productId: id,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: { ...before, productCode, ...data } as unknown as Record<string, unknown>,
    summary: "Sửa cấu hình căn",
  });

  // Batch xử lý pending adjustments (nếu có) — user gõ trong dialog nhưng
  // chưa save trực tiếp, chỉ lưu vào state form. Save form → apply hết.
  const pendingJson = toStr(fd.get("__pendingAdjustments"));
  if (pendingJson) {
    try {
      const list = JSON.parse(pendingJson) as Array<{
        effectiveDate: string;
        note: string | null;
        fields: Record<string, number>;
      }>;
      // Sort theo ngày để history đúng thứ tự
      list.sort((a, b) => (a.effectiveDate ?? "").localeCompare(b.effectiveDate ?? ""));
      for (const adj of list) {
        if (!adj.effectiveDate || !adj.fields || Object.keys(adj.fields).length === 0) continue;
        await insertAdjustmentAndApply(id, adj.effectiveDate, adj.note ?? null, adj.fields);
      }
    } catch (e) {
      throw new Error(
        `Lỗi parse pending adjustments: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const returnTo = safeReturnTo(fd);
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  // Luôn quay về detail. Giữ returnTo trong URL để breadcrumb "← Giao dịch"
  // biết đường về list-với-filter.
  const dest = returnTo
    ? `/products/${id}?returnTo=${encodeURIComponent(returnTo)}`
    : `/products/${id}`;
  redirect(dest);
}

export type BulkProductRow = {
  projectId: number;
  unitCode: string;
  saleType: "primary" | "secondary";
  customerName: string | null;
  salesPerson: string | null;
  departmentId?: number | null;
  paymentMethod?: string | null;
  depositDate: string | null;
  pmgBasePrice: number;
  pmgRate: number; // decimal 0.055 for 5.5%
  adminFee: number;
  cdtBonusSale: number;
  cdtBonusManager: number;
  pmgSaleRate?: number; // decimal 0..1, base tính HH sale (thường thấp hơn pmgRate)
  saleCommissionRate?: number; // decimal 0..1
  bonusSale?: number;
  bonusManager?: number;
  note?: string;
};

export async function createProductBulk(rows: BulkProductRow[]) {
  const errors: { index: number; message: string }[] = [];
  const createdIds: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.projectId) throw new Error("Thiếu dự án");
      if (!r.unitCode) throw new Error("Thiếu mã căn");
      const productCode = await buildProductCode(r.projectId, r.unitCode);
      const [ins] = await db
        .insert(products)
        .values({
          productCode,
          projectId: r.projectId,
          unitCode: r.unitCode,
          saleType: r.saleType,
          customerName: r.customerName ? toTitleCase(r.customerName) : null,
          salesPerson: r.salesPerson ? toTitleCase(r.salesPerson) : null,
          departmentId: r.departmentId ?? null,
          paymentMethod: r.paymentMethod ?? null,
          depositDate: r.depositDate,
          pmgBasePrice: r.pmgBasePrice,
          pmgRate: r.pmgRate,
          adminFee: r.adminFee,
          cdtBonusSale: r.cdtBonusSale,
          cdtBonusManager: r.cdtBonusManager,
          pmgSaleRate: r.pmgSaleRate ?? 0,
          saleCommissionRate: r.saleCommissionRate ?? 0,
          bonusSale: r.bonusSale ?? 0,
          bonusManager: r.bonusManager ?? 0,
          note: r.note ?? null,
        })
        .returning({ id: products.id });
      // Compute total_revenue + total_cost từ config vừa insert
      await recomputeDerived(ins.id);
      createdIds.push(ins.id);
    } catch (e) {
      errors.push({ index: i, message: e instanceof Error ? e.message : "Lỗi" });
    }
  }
  revalidatePath("/products");
  return { ok: createdIds.length, createdIds, errors };
}

export type BulkProductEditRow = {
  id: number;
  pmgRate?: number;
  adminFee?: number;
  cdtBonusSale?: number;
  cdtBonusManager?: number;
  salesPerson?: string;
  customerName?: string;
};

export async function updateProductBulk(rows: BulkProductEditRow[]) {
  const errors: { index: number; message: string }[] = [];
  let ok = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.id) throw new Error("Thiếu id căn");
      const patch: Record<string, unknown> = {};
      if (r.pmgRate !== undefined) patch.pmgRate = r.pmgRate;
      if (r.adminFee !== undefined) patch.adminFee = r.adminFee;
      if (r.cdtBonusSale !== undefined) patch.cdtBonusSale = r.cdtBonusSale;
      if (r.cdtBonusManager !== undefined) patch.cdtBonusManager = r.cdtBonusManager;
      if (r.salesPerson !== undefined && r.salesPerson) patch.salesPerson = toTitleCase(r.salesPerson);
      if (r.customerName !== undefined && r.customerName) patch.customerName = toTitleCase(r.customerName);
      if (Object.keys(patch).length === 0) throw new Error("Không có field nào để update");
      await db.update(products).set(patch).where(eq(products.id, r.id));
      ok++;
    } catch (e) {
      errors.push({ index: i, message: e instanceof Error ? e.message : "Lỗi" });
    }
  }
  revalidatePath("/products");
  return { ok, errors };
}

export async function deleteProduct(id: number) {
  const usedRev = await db
    .select({ id: revenueReconciliations.id })
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.productId, id));
  const usedCost = await db
    .select({ id: costReconciliations.id })
    .from(costReconciliations)
    .where(eq(costReconciliations.productId, id));
  if (usedRev.length > 0 || usedCost.length > 0) {
    throw new Error(
      `Căn này đang có ${usedRev.length} đối chiếu DT và ${usedCost.length} đối chiếu GV — không xóa được.`,
    );
  }
  const [before] = await db.select().from(products).where(eq(products.id, id));
  await db.delete(products).where(eq(products.id, id));
  await logActivity({
    entityType: "product",
    entityId: id,
    productId: id,
    action: "delete",
    before: before as unknown as Record<string, unknown>,
    summary: `Xóa căn ${before?.unitCode ?? id}`,
  });
  revalidatePath("/products");
  redirect("/products");
}

/**
 * Bulk xóa nhiều căn. KHÔNG redirect — trả về summary để UI báo cáo.
 * Guard giống deleteProduct: căn có recon → skip + collect error.
 * Chấp nhận partial success.
 */
export async function deleteProductBulk(ids: number[]) {
  const errors: { id: number; unitCode: string; message: string }[] = [];
  const deletedIds: number[] = [];
  for (const id of ids) {
    try {
      const [before] = await db.select().from(products).where(eq(products.id, id));
      if (!before) {
        errors.push({ id, unitCode: `#${id}`, message: "Không tồn tại" });
        continue;
      }
      const usedRev = await db
        .select({ id: revenueReconciliations.id })
        .from(revenueReconciliations)
        .where(eq(revenueReconciliations.productId, id));
      const usedCost = await db
        .select({ id: costReconciliations.id })
        .from(costReconciliations)
        .where(eq(costReconciliations.productId, id));
      if (usedRev.length > 0 || usedCost.length > 0) {
        errors.push({
          id,
          unitCode: before.unitCode ?? `#${id}`,
          message: `${usedRev.length} ĐC doanh thu, ${usedCost.length} ĐC giá vốn`,
        });
        continue;
      }
      await db.delete(products).where(eq(products.id, id));
      await logActivity({
        entityType: "product",
        entityId: id,
        productId: id,
        action: "delete",
        before: before as unknown as Record<string, unknown>,
        summary: `Xóa căn ${before.unitCode ?? id} (bulk)`,
      });
      deletedIds.push(id);
    } catch (e) {
      errors.push({
        id,
        unitCode: `#${id}`,
        message: e instanceof Error ? e.message : "Lỗi",
      });
    }
  }
  revalidatePath("/products");
  return { ok: deletedIds.length, deletedIds, errors };
}

/**
 * Insert product_adjustments record + update product config với value mới.
 * Dùng chung cho createProductAdjustment (từ dialog trực tiếp) và updateProduct
 * (batch pending adjustments cùng lúc với Lưu form).
 */
async function insertAdjustmentAndApply(
  productId: number,
  effectiveDate: string,
  note: string | null,
  adj: Record<string, number>,
): Promise<number> {
  const [before] = await db.select().from(products).where(eq(products.id, productId));
  const [adjRec] = await db
    .insert(productAdjustments)
    .values({ productId, effectiveDate, note, ...adj })
    .returning({ id: productAdjustments.id });
  await db.update(products).set(adj).where(eq(products.id, productId));
  await recomputeDerived(productId);

  await logActivity({
    entityType: "product_adjustment",
    entityId: adjRec.id,
    productId,
    action: "create",
    after: { effectiveDate, note, ...adj } as Record<string, unknown>,
    summary: `Điều chỉnh ${Object.keys(adj).join(", ")} ngày ${effectiveDate}${note ? " · " + note : ""}`,
  });
  await logActivity({
    entityType: "product",
    entityId: productId,
    productId,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: { ...before, ...adj } as unknown as Record<string, unknown>,
    summary: `Áp dụng adjustment #${adjRec.id}`,
  });
  return adjRec.id;
}

/**
 * Tạo product adjustment: điều chỉnh 1 hoặc nhiều field trên product config.
 * Insert vào product_adjustments (giữ history) + update product với value mới.
 */
export async function createProductAdjustment(productId: number, fd: FormData) {
  const effectiveDate = toStr(fd.get("effectiveDate"));
  if (!effectiveDate) throw new Error("Nhập ngày điều chỉnh");
  const note = toStrOrNull(fd.get("note"));

  // Xác định field nào được điều chỉnh (checkbox 'change_<field>' = 'on')
  const isChanged = (field: string) => fd.get(`change_${field}`) === "on";

  // Guard: check ô mà bỏ trống → chặn (bug 655: user check %PMG_LK, gõ
  // "7,5" bị browser reject → server nhận "" → toPct = 0 → lưu 0%).
  const CHECKABLE = [
    "pmgBasePrice", "pmgRate", "pmgSaleRate", "adminFee", "adminFeeSale",
    "saleCommissionRate", "kpiCeoRate", "kpiTpkdRate", "kpiAdminRate",
    "cdtBonusSale", "cdtBonusManager", "bonusSale", "bonusManager", "customerSupport",
  ];
  const emptyChecked: string[] = [];
  for (const f of CHECKABLE) {
    if (isChanged(f) && !toStr(fd.get(f))) emptyChecked.push(f);
  }
  if (emptyChecked.length > 0) {
    throw new Error(
      `Đã tick nhưng bỏ trống: ${emptyChecked.join(", ")}. Điền giá trị hoặc bỏ tick.`,
    );
  }

  const adj: Record<string, number> = {};
  const productUpdate: Record<string, number> = {};

  if (isChanged("pmgBasePrice")) {
    const v = toNum(fd.get("pmgBasePrice"));
    adj.pmgBasePrice = v;
    productUpdate.pmgBasePrice = v;
  }
  if (isChanged("pmgRate")) {
    const v = toPct(fd.get("pmgRate"));
    adj.pmgRate = v;
    productUpdate.pmgRate = v;
  }
  if (isChanged("pmgSaleRate")) {
    const v = toPct(fd.get("pmgSaleRate"));
    adj.pmgSaleRate = v;
    productUpdate.pmgSaleRate = v;
  }
  if (isChanged("adminFee")) {
    const v = toNum(fd.get("adminFee"));
    adj.adminFee = v;
    productUpdate.adminFee = v;
  }
  if (isChanged("adminFeeSale")) {
    const v = toNum(fd.get("adminFeeSale"));
    adj.adminFeeSale = v;
    productUpdate.adminFeeSale = v;
  }
  if (isChanged("saleCommissionRate")) {
    const v = toPct(fd.get("saleCommissionRate"));
    adj.saleCommissionRate = v;
    productUpdate.saleCommissionRate = v;
  }
  if (isChanged("kpiCeoRate")) {
    const v = toPct(fd.get("kpiCeoRate"));
    adj.kpiCeoRate = v;
    productUpdate.kpiCeoRate = v;
  }
  if (isChanged("kpiTpkdRate")) {
    const v = toPct(fd.get("kpiTpkdRate"));
    adj.kpiTpkdRate = v;
    productUpdate.kpiTpkdRate = v;
  }
  if (isChanged("kpiAdminRate")) {
    const v = toPct(fd.get("kpiAdminRate"));
    adj.kpiAdminRate = v;
    productUpdate.kpiAdminRate = v;
  }
  if (isChanged("cdtBonusSale")) {
    const v = toNum(fd.get("cdtBonusSale"));
    adj.cdtBonusSale = v;
    productUpdate.cdtBonusSale = v;
  }
  if (isChanged("cdtBonusManager")) {
    const v = toNum(fd.get("cdtBonusManager"));
    adj.cdtBonusManager = v;
    productUpdate.cdtBonusManager = v;
  }
  if (isChanged("bonusSale")) {
    const v = toNum(fd.get("bonusSale"));
    adj.bonusSale = v;
    productUpdate.bonusSale = v;
  }
  if (isChanged("bonusManager")) {
    const v = toNum(fd.get("bonusManager"));
    adj.bonusManager = v;
    productUpdate.bonusManager = v;
  }
  if (isChanged("customerSupport")) {
    const v = toNum(fd.get("customerSupport"));
    adj.customerSupport = v;
    productUpdate.customerSupport = v;
  }

  if (Object.keys(adj).length === 0) {
    throw new Error("Chọn ít nhất 1 trường muốn điều chỉnh");
  }

  await insertAdjustmentAndApply(productId, effectiveDate, note, adj);

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
}

/**
 * Recompute total_revenue + total_cost từ current product config.
 * Formula khớp Excel col P (revenue) + col R (cost) — dùng cho auto-sync
 * sau adjustment hoặc backfill batch.
 */
export async function recomputeDerived(productId: number) {
  const [p] = await db.select().from(products).where(eq(products.id, productId));
  if (!p || p.saleType === "secondary") return;

  const pmgBase = Number(p.pmgBasePrice ?? 0);
  const rate = Number(p.pmgRate ?? 0);
  const otherFeePct = Number(p.otherFeePct ?? 0);
  const otherRev = Number(p.otherRevenue ?? 0);
  const revRed = Number(p.revenueReduction ?? 0);
  const admin = Number(p.adminFee ?? 0);
  const cdtSale = Number(p.cdtBonusSale ?? 0);
  const cdtMgr = Number(p.cdtBonusManager ?? 0);
  const pmgSaleRate = Number(p.pmgSaleRate ?? 0) || rate;
  const adminSale = Number(p.adminFeeSale ?? 0);
  const support = Number(p.customerSupport ?? 0);
  const bonusSale = Number(p.bonusSale ?? 0);
  const bonusMgr = Number(p.bonusManager ?? 0);
  const otherCost = Number(p.otherCost ?? 0);
  const hhRate = Number(p.saleCommissionRate ?? 0);
  const kpiCeo = Number(p.kpiCeoRate ?? 0);
  const kpiTpkd = Number(p.kpiTpkdRate ?? 0);
  const kpiAdmin = Number(p.kpiAdminRate ?? 0);

  const totalRevenue = Math.round(
    pmgBase * (rate + otherFeePct) + otherRev - revRed - admin + cdtSale + cdtMgr,
  );
  const baseNet = (pmgBase * pmgSaleRate - adminSale) / 1.1 - support;
  const cdtBonusNet = (cdtSale + cdtMgr) / 1.1;
  const totalCost = Math.round(
    baseNet * (hhRate + kpiCeo + kpiTpkd + kpiAdmin) + cdtBonusNet + bonusSale + bonusMgr + otherCost,
  );

  await db
    .update(products)
    .set({ totalRevenue, totalCost })
    .where(eq(products.id, productId));
}

export async function deleteProductAdjustment(productId: number, adjId: number) {
  const [before] = await db
    .select()
    .from(productAdjustments)
    .where(eq(productAdjustments.id, adjId));
  await db.delete(productAdjustments).where(eq(productAdjustments.id, adjId));
  await logActivity({
    entityType: "product_adjustment",
    entityId: adjId,
    productId,
    action: "delete",
    before: before as unknown as Record<string, unknown>,
    summary: `Xóa adjustment #${adjId}`,
  });
  revalidatePath(`/products/${productId}`);
}

/**
 * Cho phép sửa CHỈ ghi chú của 1 adjustment.
 * Các field data khác (%HH, phí admin...) không sửa được — nếu nhầm số, tạo adjustment mới đè.
 */
export async function updateProductAdjustmentNote(
  productId: number,
  adjId: number,
  note: string,
) {
  await db
    .update(productAdjustments)
    .set({ note: note.trim() || null })
    .where(eq(productAdjustments.id, adjId));
  revalidatePath(`/products/${productId}/edit`);
  revalidatePath(`/products/${productId}`);
}
