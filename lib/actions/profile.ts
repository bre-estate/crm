"use server";

import { chay, type KetQuaLuu } from "@/lib/actions/ket-qua";

import { db } from "@/lib/db";
import { userPermissions } from "@/lib/schema";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

async function _updateFullName(newName: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Phiên đăng nhập đã hết hạn, tải lại trang rồi đăng nhập lại.");
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Nhập họ tên, không được để trống.");
  if (trimmed.length > 100) throw new Error("Họ tên tối đa 100 ký tự");
  await db
    .update(userPermissions)
    .set({ fullName: trimmed, updatedAt: new Date() })
    .where(eq(userPermissions.email, user.email));
  revalidatePath("/profile");
  revalidatePath("/", "layout"); // sidebar shows displayName
}

async function _updatePassword(newPassword: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Phiên đăng nhập đã hết hạn, tải lại trang rồi đăng nhập lại.");
  if (newPassword.length < 8) throw new Error("Mật khẩu phải từ 8 ký tự trở lên.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

// ── Vỏ bọc: đổi lỗi throw thành câu chữ trả về cho form ──
export async function updateFullName(newName: string): Promise<KetQuaLuu> {
  return chay(() => _updateFullName(newName));
}

export async function updatePassword(newPassword: string): Promise<KetQuaLuu> {
  return chay(() => _updatePassword(newPassword));
}
