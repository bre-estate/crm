"use server";

import { db } from "@/lib/db";
import { products, projects, partners, revenueReconciliations, costReconciliations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function toNum(v: FormDataEntryValue | null): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
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
function toPct(v: FormDataEntryValue | null): number {
  return toNum(v) / 100;
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

function buildProductData(fd: FormData) {
  return {
    unitCode: toStr(fd.get("unitCode")),
    projectId: toNum(fd.get("projectId")),
    customerName: toStrOrNull(fd.get("customerName")),
    unitDescription: toStrOrNull(fd.get("unitDescription")),
    salesPerson: toStrOrNull(fd.get("salesPerson")),
    deptName: toStrOrNull(fd.get("deptName")),
    depositDate: toStrOrNull(fd.get("depositDate")),
    expectedCompleteDate: toStrOrNull(fd.get("expectedCompleteDate")),
    paymentMethod: toStrOrNull(fd.get("paymentMethod")),

    sellPrice: toNum(fd.get("sellPrice")),
    pmgBasePrice: toNum(fd.get("pmgBasePrice")),
    totalRevenue: toNum(fd.get("totalRevenue")),
    totalCost: toNum(fd.get("totalCost")),

    pmgRate: toPct(fd.get("pmgRate")),
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
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}`);
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
