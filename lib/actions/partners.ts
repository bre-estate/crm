"use server";

import { db } from "@/lib/db";
import { partners, projects } from "@/lib/schema";
import { eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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

export async function createPartner(formData: FormData) {
  const raw = formToObject(formData);
  const data = PartnerSchema.parse(raw);
  await db.insert(partners).values({ ...data });
  revalidatePath("/partners");
  redirect("/partners");
}

export async function updatePartner(id: number, formData: FormData) {
  const raw = formToObject(formData);
  const data = PartnerSchema.parse(raw);
  await db.update(partners).set(data).where(eq(partners.id, id));
  revalidatePath("/partners");
  redirect("/partners");
}

export async function deletePartner(id: number) {
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
