"use server";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { rolePermissions, userPermissions } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { chay, type KetQuaLuu } from "@/lib/actions/ket-qua";
import { actionsFor, RESOURCES, type Action } from "@/lib/permissions";

/** Chỉ giữ tài nguyên và hành động có thật, tránh lưu quyền chết vào database. */
function locQuyen(thô: unknown): Record<string, Action[]> {
  const vao = (thô ?? {}) as Record<string, unknown>;
  const ra: Record<string, Action[]> = {};
  for (const [res, acts] of Object.entries(vao)) {
    if (!(res in RESOURCES)) continue;
    const hopLe = actionsFor(res);
    const giu = (Array.isArray(acts) ? acts : []).filter(
      (a): a is Action => typeof a === "string" && hopLe.includes(a as Action),
    );
    if (giu.length) ra[res] = giu;
  }
  return ra;
}

const MA_HOP_LE = /^[a-z][a-z0-9_]{1,30}$/;

async function _luu(role: string, label: string, perms: unknown) {
  await requirePermission("admin.roles", "edit");
  const ten = label.trim();
  if (!ten) throw new Error("Tên vai trò không được để trống.");
  await db
    .update(rolePermissions)
    .set({ label: ten, permissions: locQuyen(perms), updatedAt: new Date() })
    .where(eq(rolePermissions.role, role));
  revalidatePath("/admin/roles");
  revalidatePath("/admin/users");
}

async function _taoMoi(ma: string, label: string, chepTu: string | null) {
  await requirePermission("admin.roles", "edit");
  const m = ma.trim().toLowerCase();
  const ten = label.trim();
  if (!ten) throw new Error("Tên vai trò không được để trống.");
  if (!MA_HOP_LE.test(m)) {
    throw new Error(
      "Mã vai trò chỉ gồm chữ thường, số và dấu gạch dưới, bắt đầu bằng chữ, dài 2 tới 31 ký tự.",
    );
  }
  if (m === "owner" || m === "custom") {
    throw new Error("Hai mã owner và custom đã dành cho vai trò đặc biệt, chọn mã khác.");
  }
  const [daCo] = await db.select().from(rolePermissions).where(eq(rolePermissions.role, m));
  if (daCo) throw new Error(`Mã vai trò "${m}" đã có rồi.`);

  // Chép quyền từ một vai trò sẵn có cho đỡ phải tick lại từ đầu.
  let quyen: Record<string, Action[]> = {};
  if (chepTu) {
    const [nguon] = await db.select().from(rolePermissions).where(eq(rolePermissions.role, chepTu));
    if (nguon) quyen = (nguon.permissions as Record<string, Action[]>) ?? {};
  }
  await db.insert(rolePermissions).values({ role: m, label: ten, permissions: quyen });
  revalidatePath("/admin/roles");
  revalidatePath("/admin/users");
}

async function _xoa(role: string) {
  await requirePermission("admin.roles", "edit");
  const [vt] = await db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
  if (!vt) throw new Error("Không tìm thấy vai trò này.");
  if (vt.builtin) {
    throw new Error(
      `"${vt.label}" là vai trò dựng sẵn nên không xóa được. Bạn sửa quyền của nó thì được.`,
    );
  }
  // Xóa vai trò mà còn người đang mang thì họ mất sạch quyền, nên chặn lại.
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userPermissions)
    .where(eq(userPermissions.role, role))) as [{ n: number }];
  if (n > 0) {
    throw new Error(
      `Còn ${n} tài khoản đang mang vai trò "${vt.label}". Chuyển họ sang vai trò khác rồi hãy xóa.`,
    );
  }
  await db.delete(rolePermissions).where(eq(rolePermissions.role, role));
  revalidatePath("/admin/roles");
  revalidatePath("/admin/users");
}

export async function luuVaiTro(
  role: string,
  label: string,
  perms: Record<string, Action[]>,
): Promise<KetQuaLuu> {
  return chay(() => _luu(role, label, perms));
}

export async function taoVaiTro(
  ma: string,
  label: string,
  chepTu: string | null,
): Promise<KetQuaLuu> {
  return chay(() => _taoMoi(ma, label, chepTu));
}

export async function xoaVaiTro(role: string): Promise<KetQuaLuu> {
  return chay(() => _xoa(role));
}
