"use server";

import { chay, type KetQuaLuu } from "@/lib/actions/ket-qua";

import { db } from "@/lib/db";
import { partners, projects } from "@/lib/schema";
import { eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";

const PartnerSchema = z.object({
  code: z.string().trim().min(1, "Mã đối tác bắt buộc").max(8),
  name: z.string().trim().min(1, "Tên đối tác bắt buộc"),
  type: z.enum(["cdt", "f1", "f2"]),
  legalName: z.string().trim().optional().nullable(),
  taxCode: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  contactPerson: z.string().trim().optional().nullable(),
  status: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

function formToObject(formData: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    obj[k] = typeof v === "string" ? v : "";
  }
  return obj;
}

async function _createPartner(formData: FormData) {
  await requirePermission("partners", "edit");
  const raw = formToObject(formData);
  const data = PartnerSchema.parse(raw);
  await db.insert(partners).values({ ...data });
  revalidatePath("/partners");
  redirect("/partners");
}

async function _updatePartner(id: number, formData: FormData) {
  await requirePermission("partners", "edit");
  const raw = formToObject(formData);
  const data = PartnerSchema.parse(raw);
  await db.update(partners).set(data).where(eq(partners.id, id));
  revalidatePath("/partners");
  redirect("/partners");
}

async function _deletePartner(id: number) {
  await requirePermission("partners", "delete");
  // cascade check
  const used = await db
    .select({ id: projects.id })
    .from(projects)
    .where(or(eq(projects.partnerId, id), eq(projects.linkedF1PartnerId, id)))
  if (used.length > 0) {
    throw new Error(`Đối tác đang được dùng bởi ${used.length} dự án — không xóa được.`);
  }
  await db.delete(partners).where(eq(partners.id, id));
  revalidatePath("/partners");
  redirect("/partners");
}

// Variants không redirect — dùng cho dialog inline. Client tự router.refresh().
async function _createPartnerNoRedirect(formData: FormData) {
  await requirePermission("partners", "edit");
  const raw = formToObject(formData);
  const data = PartnerSchema.parse(raw);
  await db.insert(partners).values({ ...data });
  revalidatePath("/partners");
}

async function _updatePartnerNoRedirect(id: number, formData: FormData) {
  await requirePermission("partners", "edit");
  const raw = formToObject(formData);
  const data = PartnerSchema.parse(raw);
  await db.update(partners).set(data).where(eq(partners.id, id));
  revalidatePath("/partners");
}

async function _deletePartnerNoRedirect(id: number) {
  await requirePermission("partners", "delete");
  const used = await db
    .select({ id: projects.id })
    .from(projects)
    .where(or(eq(projects.partnerId, id), eq(projects.linkedF1PartnerId, id)));
  if (used.length > 0) {
    throw new Error(`Đối tác đang được dùng bởi ${used.length} dự án — không xóa được.`);
  }
  await db.delete(partners).where(eq(partners.id, id));
  revalidatePath("/partners");
}

// ── Vỏ bọc: đổi lỗi throw thành câu chữ trả về cho form ──
export async function createPartner(formData: FormData): Promise<KetQuaLuu> {
  return chay(() => _createPartner(formData));
}

export async function updatePartner(id: number, formData: FormData): Promise<KetQuaLuu> {
  return chay(() => _updatePartner(id, formData));
}

export async function deletePartner(id: number): Promise<KetQuaLuu> {
  return chay(() => _deletePartner(id));
}

export async function createPartnerNoRedirect(formData: FormData): Promise<KetQuaLuu> {
  return chay(() => _createPartnerNoRedirect(formData));
}

export async function updatePartnerNoRedirect(id: number, formData: FormData): Promise<KetQuaLuu> {
  return chay(() => _updatePartnerNoRedirect(id, formData));
}

export async function deletePartnerNoRedirect(id: number): Promise<KetQuaLuu> {
  return chay(() => _deletePartnerNoRedirect(id));
}
