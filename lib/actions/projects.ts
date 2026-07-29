"use server";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects, products } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toNum, toStr, toPct } from "@/lib/parse";
import { scrapeBatdongsanProject } from "@/lib/scrapers/batdongsan";

function buildProjectData(fd: FormData) {
  const code = toStr(fd.get("code"));
  const partnerCode = toStr(fd.get("partnerCode"));
  const rawDefaultSaleType = toStr(fd.get("defaultSaleType"));
  const defaultSaleType: "primary" | "secondary" =
    rawDefaultSaleType === "secondary" ? "secondary" : "primary";
  const isSecondary = defaultSaleType === "secondary";
  return {
    code,
    // Secondary: dùng suffix "SCND" (thay cho partnerCode) — server auto-append số nếu trùng.
    fullCode: `${code}_${isSecondary ? "SCND" : partnerCode}`,
    name: toStr(fd.get("name")),
    // Thứ cấp không có đối tác + không có vai trò BRE
    partnerId: isSecondary ? null : toNum(fd.get("partnerId")) || null,
    breRole: (isSecondary ? "f1" : (toStr(fd.get("breRole")) as "f1" | "f2")) as "f1" | "f2",
    linkedF1PartnerId: isSecondary ? null : toNum(fd.get("linkedF1PartnerId")) || null,
    defaultSaleType,
    contractInfo: toStr(fd.get("contractInfo")),
    contractStatus: toStr(fd.get("contractStatus")) as "chua_ky" | "dang_dam_phan" | "da_ky" | "ngung_hop_tac",
    contractDocs: toStr(fd.get("contractDocs")),
    brokerageRate: toPct(fd.get("brokerageRate")),
    brokerageRateSale: toPct(fd.get("brokerageRateSale")),
    adminFee: toNum(fd.get("adminFee")),
    adminFeeSale: toNum(fd.get("adminFeeSale")),
    // Đợt TT + phase rates: reference-only từ HĐ, không lookup vào tính.
    paymentPhases: isSecondary ? 1 : (toNum(fd.get("paymentPhases")) || 1),
    phaseRate1: isSecondary ? 0 : toPct(fd.get("phaseRate1")),
    phaseRate2: isSecondary ? 0 : toPct(fd.get("phaseRate2")),
    phaseRate3: isSecondary ? 0 : toPct(fd.get("phaseRate3")),
    phaseRate4: isSecondary ? 0 : toPct(fd.get("phaseRate4")),
    phaseRate5: isSecondary ? 0 : toPct(fd.get("phaseRate5")),
    // cdt_bonus, cty_bonus vẫn bỏ — nhập per-căn ở ProductForm.
    paymentDocs: toStr(fd.get("paymentDocs")),
    note: toStr(fd.get("note")),

    // Project Deep Dive (Phase 2)
    totalUnits: toNum(fd.get("totalUnits")) || null,
    priceRangeMin: toNum(fd.get("priceRangeMin")) || null,
    priceRangeMax: toNum(fd.get("priceRangeMax")) || null,
    handoverExpected: toStr(fd.get("handoverExpected")) || null,
    developerWebsite: toStr(fd.get("developerWebsite")) || null,
    batdongsanUrl: toStr(fd.get("batdongsanUrl")) || null,
    cafelandUrl: toStr(fd.get("cafelandUrl")) || null,
    district: toStr(fd.get("district")) || null,
    city: toStr(fd.get("city")) || null,
    dataSourceNote: toStr(fd.get("dataSourceNote")) || null,
    dataUpdatedAt: new Date(),
  };
}

// Nếu full_code đã tồn tại (nhiều dự án thứ cấp cùng code) → append số.
async function uniqueFullCode(base: string, excludeId?: number): Promise<string> {
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.fullCode, candidate));
    if (existing.length === 0 || (existing.length === 1 && existing[0].id === excludeId)) {
      return candidate;
    }
    candidate = `${base}${n}`;
    n++;
    if (n > 20) throw new Error("Quá nhiều dự án cùng mã, không sinh được full_code duy nhất");
  }
}

export async function createProject(fd: FormData) {
  await requirePermission("products", "edit");
  const data = buildProjectData(fd);
  if (!data.code || !data.name) throw new Error("Thiếu mã hoặc tên dự án");
  if (data.defaultSaleType === "primary" && !data.partnerId) {
    throw new Error("Dự án sơ cấp cần chọn đối tác (CĐT/F1)");
  }
  data.fullCode = await uniqueFullCode(data.fullCode);
  await db.insert(projects).values(data);
  revalidatePath("/projects");
  redirect("/projects");
}

export async function updateProject(id: number, fd: FormData) {
  await requirePermission("products", "edit");
  const data = buildProjectData(fd);
  if (!data.code || !data.name) throw new Error("Thiếu mã hoặc tên dự án");
  if (data.defaultSaleType === "primary" && !data.partnerId) {
    throw new Error("Dự án sơ cấp cần chọn đối tác (CĐT/F1)");
  }
  data.fullCode = await uniqueFullCode(data.fullCode, id);
  await db.update(projects).set(data).where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  redirect("/projects");
}

export async function deleteProject(id: number) {
  await requirePermission("products", "delete");
  const used = await db.select({ id: products.id }).from(products).where(eq(products.projectId, id));
  if (used.length > 0) {
    throw new Error(`Dự án đang có ${used.length} giao dịch — không xóa được.`);
  }
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath("/projects");
  redirect("/projects");
}

/**
 * Fetch data từ Batdongsan URL của dự án → auto-fill 4 field
 * (totalUnits, priceMin/Max, district/city, handoverExpected).
 * Chỉ update field non-null từ parser — giữ nguyên field đã có trong DB nếu parser trả null.
 */
export async function refreshProjectFromBatdongsan(id: number): Promise<{
  ok: boolean;
  updated: Record<string, unknown>;
  message: string;
}> {
  await requirePermission("products", "edit");
  const [proj] = await db.select().from(projects).where(eq(projects.id, id));
  if (!proj) throw new Error("Không tìm thấy dự án");
  if (!proj.batdongsanUrl) throw new Error("Dự án chưa có URL Batdongsan — nhập vào section '🔗 Nguồn tham chiếu'");

  const data = await scrapeBatdongsanProject(proj.batdongsanUrl);
  const updated: Record<string, unknown> = {};
  if (data.totalUnits !== null) updated.totalUnits = data.totalUnits;
  if (data.priceRangeMin !== null) updated.priceRangeMin = data.priceRangeMin;
  if (data.priceRangeMax !== null) updated.priceRangeMax = data.priceRangeMax;
  if (data.district) updated.district = data.district;
  if (data.city) updated.city = data.city;
  if (data.handoverExpected) updated.handoverExpected = data.handoverExpected;
  updated.dataUpdatedAt = new Date();
  updated.dataSourceNote = `Auto-fill từ Batdongsan lúc ${new Date().toLocaleString("vi-VN")}`;

  if (Object.keys(updated).length <= 2) {
    return {
      ok: false,
      updated,
      message: "Parser không tìm được field nào — cấu trúc trang có thể đã đổi. Nhập tay hoặc báo dev.",
    };
  }

  await db.update(projects).set(updated).where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return {
    ok: true,
    updated,
    message: `Đã cập nhật ${Object.keys(updated).length - 2} field từ Batdongsan.`,
  };
}
