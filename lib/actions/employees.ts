"use server";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const EmployeeSchema = z.object({
  name: z.string().trim().min(1, "Tên bắt buộc"),
  email: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  position: z.enum(["ceo", "tpkd", "nvkd", "admin", "ctv"]),
  departmentId: z.coerce.number().int().nullable().optional(),
  aliasOfId: z.coerce.number().int().nullable().optional(),
  active: z.boolean().optional(),
  note: z.string().trim().optional().nullable(),
});

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = typeof v === "string" ? v : "";
  // Convert empty deptId → null
  if (obj.departmentId === "" || obj.departmentId === "0") obj.departmentId = null;
  if (obj.aliasOfId === "" || obj.aliasOfId === "0") obj.aliasOfId = null;
  obj.active = fd.get("active") === "on" || fd.get("active") === "true";
  return obj;
}

export async function createEmployeeNoRedirect(fd: FormData) {
  await requirePermission("employees", "edit");
  const raw = formToObject(fd);
  const data = EmployeeSchema.parse(raw);
  await db.insert(employees).values({
    ...data,
    email: data.email || null,
    phone: data.phone || null,
    departmentId: data.departmentId ?? null,
    active: data.active ?? true,
    note: data.note || null,
  });
  revalidatePath("/employees");
}

export async function updateEmployeeNoRedirect(id: number, fd: FormData) {
  await requirePermission("employees", "edit");
  const raw = formToObject(fd);
  const data = EmployeeSchema.parse(raw);
  await db
    .update(employees)
    .set({
      ...data,
      email: data.email || null,
      phone: data.phone || null,
      departmentId: data.departmentId ?? null,
      aliasOfId: data.aliasOfId ?? null,
      active: data.active ?? true,
      note: data.note || null,
    })
    .where(eq(employees.id, id));
  revalidatePath("/employees");
}

export async function deleteEmployeeNoRedirect(id: number) {
  await requirePermission("employees", "delete");
  // Guard: có product/cost recon nào đang tham chiếu text name không?
  const [emp] = await db.select().from(employees).where(eq(employees.id, id));
  if (!emp) throw new Error("Không tìm thấy nhân viên");

  const used = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM products WHERE LOWER(sales_person) = LOWER(${emp.name}) OR LOWER(dept_leader_name) = LOWER(${emp.name})) AS products,
      (SELECT COUNT(*)::int FROM cost_reconciliations WHERE LOWER(employee_name) = LOWER(${emp.name})) AS costs
  `);
  const row = (used as unknown as { rows: Array<{ products: number; costs: number }> }).rows?.[0] ?? { products: 0, costs: 0 };
  const p = Number(row.products ?? 0);
  const c = Number(row.costs ?? 0);
  if (p > 0 || c > 0) {
    throw new Error(
      `Không xóa được — "${emp.name}" đang dùng ở ${p} căn + ${c} đợt giá vốn. Chuyển sang inactive nếu muốn ẩn.`,
    );
  }

  await db.delete(employees).where(eq(employees.id, id));
  revalidatePath("/employees");
}

