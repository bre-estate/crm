"use server";

import { db } from "@/lib/db";
import { projects, products } from "@/lib/schema";
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
// Form input is raw percent (5.5 = 5.5%); DB stores decimal (0.055).
// Don't strip dots (they're decimal separators here, not thousand separators).
function toPct(v: FormDataEntryValue | null): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace(/,/g, ".").replace(/\s/g, "");
  if (!s) return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n / 100;
}

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
    paymentPhases: toNum(fd.get("paymentPhases")) || 1,
    phaseRate1: toPct(fd.get("phaseRate1")),
    phaseRate2: toPct(fd.get("phaseRate2")),
    phaseRate3: toPct(fd.get("phaseRate3")),
    phaseRate4: toPct(fd.get("phaseRate4")),
    phaseRate5: toPct(fd.get("phaseRate5")),
    cdtBonusSale: toNum(fd.get("cdtBonusSale")),
    cdtBonusManager: toNum(fd.get("cdtBonusManager")),
    ctyBonusSale: toNum(fd.get("ctyBonusSale")),
    ctyBonusManager: toNum(fd.get("ctyBonusManager")),
    paymentDocs: toStr(fd.get("paymentDocs")),
    note: toStr(fd.get("note")),
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
  const used = await db.select({ id: products.id }).from(products).where(eq(products.projectId, id));
  if (used.length > 0) {
    throw new Error(`Dự án đang có ${used.length} giao dịch — không xóa được.`);
  }
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath("/projects");
  redirect("/projects");
}
