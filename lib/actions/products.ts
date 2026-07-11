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

function toNum(v: FormDataEntryValue | null): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // Heuristic phân biệt decimal vs thousand separator:
  // - "104957611.61363636" (float từ JS) → decimal, giữ phần thập phân
  // - "3.249.476.520" (Vietnamese thousand) → strip hết
  // - "104,957,611" (US thousand) → strip hết
  // Rule: nếu có ĐÚNG 1 dấu . và phần sau có ≥ 3 chữ số → decimal float
  //       (Vietnamese thousand có exactly 3 digits between dots, so 4+ tail is unambiguous decimal)
  const dots = (s.match(/\./g) || []).length;
  if (dots === 1) {
    const parts = s.split(".");
    if (parts[1].length >= 4 || parts[1].length < 3) {
      // Decimal float — strip commas as thousand sep, keep the dot
      const n = Number(s.replace(/[,\s]/g, ""));
      return isNaN(n) ? 0 : n;
    }
  }
  // Strip both Vietnamese (`.` thousand) and US (`,` thousand) separators.
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
// Form input raw percent (5.5 = 5.5%); DB stores decimal (0.055).
// Don't strip dots (they're decimal separators here).
function toPct(v: FormDataEntryValue | null): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace(/,/g, ".").replace(/\s/g, "");
  if (!s) return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n / 100;
}

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
  const raw = fd.get("__returnTo");
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  return s;
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
  await db.insert(products).values({ productCode, ...data });
  revalidatePath("/products");
  redirect("/products");
}

export async function updateProduct(id: number, fd: FormData) {
  const data = buildProductData(fd);
  if (!data.projectId || !data.unitCode) throw new Error("Chọn dự án và nhập mã căn");
  const productCode = await buildProductCode(data.projectId, data.unitCode);
  await db.update(products).set({ productCode, ...data }).where(eq(products.id, id));
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
  depositDate: string | null;
  pmgBasePrice: number;
  pmgRate: number; // decimal 0.055 for 5.5%
  adminFee: number;
  cdtBonusSale: number;
  cdtBonusManager: number;
  note?: string;
};

export async function createProductBulk(rows: BulkProductRow[]) {
  const errors: { index: number; message: string }[] = [];
  let ok = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.projectId) throw new Error("Thiếu dự án");
      if (!r.unitCode) throw new Error("Thiếu mã căn");
      const productCode = await buildProductCode(r.projectId, r.unitCode);
      await db.insert(products).values({
        productCode,
        projectId: r.projectId,
        unitCode: r.unitCode,
        saleType: r.saleType,
        customerName: r.customerName ? toTitleCase(r.customerName) : null,
        salesPerson: r.salesPerson ? toTitleCase(r.salesPerson) : null,
        depositDate: r.depositDate,
        pmgBasePrice: r.pmgBasePrice,
        pmgRate: r.pmgRate,
        adminFee: r.adminFee,
        cdtBonusSale: r.cdtBonusSale,
        cdtBonusManager: r.cdtBonusManager,
        note: r.note ?? null,
      });
      ok++;
    } catch (e) {
      errors.push({ index: i, message: e instanceof Error ? e.message : "Lỗi" });
    }
  }
  revalidatePath("/products");
  return { ok, errors };
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
  await db.delete(products).where(eq(products.id, id));
  revalidatePath("/products");
  redirect("/products");
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

  await db.insert(productAdjustments).values({
    productId,
    effectiveDate,
    note,
    ...adj,
  });
  await db.update(products).set(productUpdate).where(eq(products.id, productId));

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
}

export async function deleteProductAdjustment(productId: number, adjId: number) {
  await db.delete(productAdjustments).where(eq(productAdjustments.id, adjId));
  revalidatePath(`/products/${productId}`);
}
