"use server";

import { chay, type KetQuaLuu } from "@/lib/actions/ket-qua";

import { db } from "@/lib/db";
import { userPermissions } from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { Action, Role } from "@/lib/permissions";
import { layQuyenVaiTro } from "@/lib/vai-tro";

/**
 * Vai trò hợp lệ: hai vai trò đặc biệt cộng với những vai trò có trong database.
 * Đọc từ database chứ không ghi cứng, vì tạo thêm vai trò được ở trang Vai trò và quyền.
 */
async function vaiTroHopLe(): Promise<Set<string>> {
  return new Set(["owner", "custom", ...Object.keys(await layQuyenVaiTro())]);
}

function parsePermissions(formData: FormData): Record<string, Action[]> {
  const raw = formData.get("permissions_json");
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, Action[]>;
  } catch {}
  return {};
}

async function _createUser(formData: FormData) {
  const currentUser = await requirePermission("admin.users", "edit");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "viewer") as Role;
  const permissions = role === "custom" ? parsePermissions(formData) : {};

  if (!email || !email.includes("@")) throw new Error("Email không hợp lệ, phải có dấu @.");
  if (!(await vaiTroHopLe()).has(role)) {
    throw new Error("Vai trò không hợp lệ, chọn lại từ danh sách.");
  }

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

async function _updateUser(email: string, formData: FormData) {
  await requirePermission("admin.users", "edit");
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "viewer") as Role;
  const permissions = role === "custom" ? parsePermissions(formData) : {};

  if (!(await vaiTroHopLe()).has(role)) {
    throw new Error("Vai trò không hợp lệ, chọn lại từ danh sách.");
  }

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

async function _toggleActive(email: string) {
  await requirePermission("admin.users", "edit");
  const [row] = await db
    .select({ active: userPermissions.active })
    .from(userPermissions)
    .where(eq(userPermissions.email, email));
  if (!row) throw new Error("Không tìm thấy người dùng này, có thể vừa bị xoá.");
  await db
    .update(userPermissions)
    .set({ active: !row.active, updatedAt: new Date() })
    .where(eq(userPermissions.email, email));
  revalidatePath("/admin/users");
}

async function _deleteUser(email: string) {
  await requirePermission("admin.users", "delete");
  await db.delete(userPermissions).where(eq(userPermissions.email, email));
  revalidatePath("/admin/users");
}

// ── Vỏ bọc: đổi lỗi throw thành câu chữ trả về cho form ──
export async function createUser(formData: FormData): Promise<KetQuaLuu> {
  return chay(() => _createUser(formData));
}

export async function updateUser(email: string, formData: FormData): Promise<KetQuaLuu> {
  return chay(() => _updateUser(email, formData));
}

export async function toggleActive(email: string): Promise<KetQuaLuu> {
  return chay(() => _toggleActive(email));
}

export async function deleteUser(email: string): Promise<KetQuaLuu> {
  return chay(() => _deleteUser(email));
}
