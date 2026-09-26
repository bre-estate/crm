import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { rolePermissions } from "@/lib/schema";
import { asc } from "drizzle-orm";
import type { Action, QuyenVaiTro } from "@/lib/permissions";

/**
 * Quyền của các vai trò, đọc từ database.
 *
 * Trước đây nằm cứng trong lib/permissions.ts nên mỗi lần thêm bớt một quyền cho
 * HR là phải sửa code rồi đẩy bản mới. Giờ chủ tài khoản tự sửa ở trang Vai trò.
 *
 * Bọc cache() để một lần dựng trang chỉ hỏi database một lần, vì hàm này được gọi
 * ở nhiều chỗ trong cùng một yêu cầu.
 */
export const layVaiTro = cache(async () => {
  try {
    return await db.select().from(rolePermissions).orderBy(asc(rolePermissions.label));
  } catch {
    // Bảng chưa được tạo (lần đầu đẩy bản mới trước khi chạy migration).
    // Trả rỗng để resolvePermissions rơi về preset trong code.
    return [];
  }
});

export const layQuyenVaiTro = cache(async (): Promise<QuyenVaiTro> => {
  const ds = await layVaiTro();
  const ra: QuyenVaiTro = {};
  for (const r of ds) ra[r.role] = (r.permissions as Record<string, Action[]>) ?? {};
  return ra;
});

/** Nhãn hiển thị của mọi vai trò, gồm cả hai vai trò đặc biệt. */
export async function layNhanVaiTro(): Promise<Record<string, string>> {
  const ds = await layVaiTro();
  const ra: Record<string, string> = { owner: "Owner", custom: "Tùy chỉnh" };
  for (const r of ds) ra[r.role] = r.label;
  return ra;
}
