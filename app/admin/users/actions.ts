"use server";

import { db } from "@/lib/db";
import { userPermissions } from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { Action, Role } from "@/lib/permissions";

const ALLOWED_ROLES: Role[] = ["owner", "manager", "admin", "hr", "custom"];

function parsePermissions(formData: FormData): Record<string, Action[]> {
  const raw = formData.get("permissions_json");
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, Action[]>;
  } catch {}
  return {};
}

export async function createUser(formData: FormData) {
  const currentUser = await requirePermission("admin.users", "edit");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "viewer") as Role;
  const permissions = role === "custom" ? parsePermissions(formData) : {};

  if (!email || !email.includes("@")) throw new Error("Email không hợp lệ");
  if (!ALLOWED_ROLES.includes(role)) throw new Error("Role không hợp lệ");

  await db
    .insert(userPermissions)
    .values({
      email,
      fullName,
      role,
      permissions,
      active: true,
      invitedBy: currentUser.email,
    })
    .onConflictDoUpdate({
      target: userPermissions.email,
      set: {
        fullName,
        role,
        permissions,
        active: true,
        updatedAt: new Date(),
      },
    });
  revalidatePath("/admin/users");
}

export async function updateUser(email: string, formData: FormData) {
  await requirePermission("admin.users", "edit");
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "viewer") as Role;
  const permissions = role === "custom" ? parsePermissions(formData) : {};

  if (!ALLOWED_ROLES.includes(role)) throw new Error("Role không hợp lệ");

  await db
    .update(userPermissions)
    .set({
      fullName,
      role,
      permissions,
      updatedAt: new Date(),
    })
    .where(eq(userPermissions.email, email));
  revalidatePath("/admin/users");
}

export async function toggleActive(email: string) {
  await requirePermission("admin.users", "edit");
  const [row] = await db
    .select({ active: userPermissions.active })
    .from(userPermissions)
    .where(eq(userPermissions.email, email));
  if (!row) throw new Error("User không tồn tại");
  await db
    .update(userPermissions)
    .set({ active: !row.active, updatedAt: new Date() })
    .where(eq(userPermissions.email, email));
  revalidatePath("/admin/users");
}

export async function deleteUser(email: string) {
  await requirePermission("admin.users", "delete");
  await db.delete(userPermissions).where(eq(userPermissions.email, email));
  revalidatePath("/admin/users");
}
