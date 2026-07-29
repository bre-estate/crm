"use server";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { departments, products, employees } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const DeptSchema = z.object({
  code: z.string().trim().min(1, "Mã phòng bắt buộc").max(16),
  name: z.string().trim().min(1, "Tên phòng bắt buộc"),
  leaderName: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = typeof v === "string" ? v : "";
  return obj;
}

export async function createDepartmentNoRedirect(fd: FormData) {
  await requirePermission("departments", "edit");
  const raw = formToObject(fd);
  const data = DeptSchema.parse(raw);
  await db.insert(departments).values({
    code: data.code,
    name: data.name,
    leaderName: data.leaderName || null,
    note: data.note || null,
  });
  revalidatePath("/departments");
}

export async function updateDepartmentNoRedirect(id: number, fd: FormData) {
  await requirePermission("departments", "edit");
  const raw = formToObject(fd);
  const data = DeptSchema.parse(raw);
  await db
    .update(departments)
    .set({
      code: data.code,
      name: data.name,
      leaderName: data.leaderName || null,
      note: data.note || null,
    })
    .where(eq(departments.id, id));
  revalidatePath("/departments");
}

export async function deleteDepartmentNoRedirect(id: number) {
  await requirePermission("departments", "delete");
  // Guard: nếu có căn hoặc NV ref → không xoá
  const [{ prodCount }] = await db
    .select({ prodCount: sql<number>`COUNT(*)::int` })
    .from(products)
    .where(eq(products.departmentId, id));
  const [{ empCount }] = await db
    .select({ empCount: sql<number>`COUNT(*)::int` })
    .from(employees)
    .where(eq(employees.departmentId, id));
  if (Number(prodCount ?? 0) > 0 || Number(empCount ?? 0) > 0) {
    throw new Error(
      `Không xoá được — phòng đang được dùng: ${prodCount} căn + ${empCount} NV. Chuyển họ sang phòng khác trước.`,
    );
  }
  await db.delete(departments).where(eq(departments.id, id));
  revalidatePath("/departments");
}
