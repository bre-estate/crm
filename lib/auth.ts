import "server-only";

import { createClient } from "@/lib/supabase/server";

// Danh sách email được phép truy cập trang /finance + finance actions.
// Sau này extend theo team → thêm vào array.
const OWNER_EMAILS = ["trietnguyen308@gmail.com"];

/**
 * Kiểm tra user hiện tại có nằm trong danh sách owner không.
 * Trả về email nếu OK, null nếu không (dùng cho conditional render).
 */
export async function getOwnerEmail(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return null;
    return OWNER_EMAILS.includes(user.email) ? user.email : null;
  } catch {
    return null;
  }
}

/**
 * Bảo vệ page hoặc server action — throw nếu không phải owner.
 * Dùng ở đầu server action / page component.
 */
export async function requireOwner(): Promise<string> {
  const email = await getOwnerEmail();
  if (!email) {
    throw new Error("Bạn không có quyền truy cập tính năng này.");
  }
  return email;
}
