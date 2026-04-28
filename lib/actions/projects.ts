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
  const n = Number(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
function toStr(v: FormDataEntryValue | null): string {
  return v === null ? "" : String(v).trim();
}
// Form input is raw percent (5.5 = 5.5%); DB stores decimal (0.055).
function toPct(v: FormDataEntryValue | null): number {
  return toNum(v) / 100;
}

function buildProjectData(fd: FormData) {
  const code = toStr(fd.get("code"));
  const partnerCode = toStr(fd.get("partnerCode"));
  return {
    code,
    fullCode: `${code}_${partnerCode}`,
    name: toStr(fd.get("name")),
    partnerId: toNum(fd.get("partnerId")),
    breRole: toStr(fd.get("breRole")) as "f1" | "f2",
    linkedF1PartnerId: toNum(fd.get("linkedF1PartnerId")) || null,
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

export async function createProject(fd: FormData) {
  const data = buildProjectData(fd);
  if (!data.code || !data.name || !data.partnerId) throw new Error("Thiếu mã, tên dự án hoặc đối tác");
  await db.insert(projects).values(data);
  revalidatePath("/projects");
  redirect("/projects");
}

export async function updateProject(id: number, fd: FormData) {
  const data = buildProjectData(fd);
  if (!data.code || !data.name || !data.partnerId) throw new Error("Thiếu mã, tên dự án hoặc đối tác");
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
