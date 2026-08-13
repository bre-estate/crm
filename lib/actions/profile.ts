"use server";

import { db } from "@/lib/db";
import { userPermissions } from "@/lib/schema";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateFullName(newName: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Chưa đăng nhập");
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Họ tên không được để trống");
  if (trimmed.length > 100) throw new Error("Họ tên tối đa 100 ký tự");
  await db
    .update(userPermissions)
    .set({ fullName: trimmed, updatedAt: new Date() })
    .where(eq(userPermissions.email, user.email));
  revalidatePath("/profile");
  revalidatePath("/", "layout"); // sidebar shows displayName
}

export async function updatePassword(newPassword: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Chưa đăng nhập");
  if (newPassword.length < 8) throw new Error("Mật khẩu phải ≥ 8 ký tự");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}
