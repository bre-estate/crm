import "server-only";

import { createClient } from "@/lib/supabase/server";

// Danh sách email được phép truy cập TOÀN BỘ app — 2 founders (Triết + Bách).
// Bao gồm: /finance/*, /alerts, /admin/activity, /reports/*, /employees, /departments.
const OWNER_EMAILS = ["trietnguyen308@gmail.com", "bach.khdt@gmail.com"];

// Email được phép truy cập MỌI trang /reports (subset của OWNER + thêm reader).
// Hiện REPORTS = OWNER (không có reader khác).
const REPORTS_EMAILS = OWNER_EMAILS;

// Email chỉ được vào /reports/segments (nhập bổ sung số PN + diện tích căn),
// không thấy các báo cáo khác (tránh lộ DT/biên LN nội bộ).
const SEGMENTS_ONLY_EMAILS = ["lanvienho@gmail.com"];

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

/**
 * Check user có được phép xem MỌI trang /reports không.
 */
export async function hasReportsAccess(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return false;
    return REPORTS_EMAILS.includes(user.email);
  } catch {
    return false;
  }
}

/**
 * Check user có được vào /reports/segments không (whitelist chuyên bổ sung
 * thông tin căn — bao gồm cả full reports users).
 */
export async function hasSegmentsAccess(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return false;
    return REPORTS_EMAILS.includes(user.email) || SEGMENTS_ONLY_EMAILS.includes(user.email);
  } catch {
    return false;
  }
}
