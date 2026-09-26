import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { positions } from "@/lib/schema";
import { asc } from "drizzle-orm";
import type { Action, QuyenVaiTro } from "@/lib/permissions";

/**
 * Vị trí công việc, đọc từ database.
 *
 * Một danh sách duy nhất cho cả hồ sơ nhân sự lẫn quyền truy cập. Trước đây nhãn
 * vị trí ghi cứng trong code còn quyền ghi cứng trong lib/permissions.ts, nên mỗi
 * lần thêm chức danh hay thêm bớt một quyền là phải sửa code rồi đẩy bản mới.
 *
 * Bọc cache() để một lần dựng trang chỉ hỏi database một lần.
 */
export const layViTri = cache(async () => {
  try {
    return await db.select().from(positions).orderBy(asc(positions.thuTu));
  } catch {
    // Bảng chưa tạo (lần đầu đẩy bản mới trước khi migration kịp chạy).
    return [];
  }
});

/** Quyền của từng vị trí, dạng { mã vị trí: { tài nguyên: hành động[] } }. */
export const layQuyenViTri = cache(async (): Promise<QuyenVaiTro> => {
  const ds = await layViTri();
  const ra: QuyenVaiTro = {};
  for (const r of ds) ra[r.code] = (r.permissions as Record<string, Action[]>) ?? {};
  return ra;
});

/** Nhãn của mọi vị trí, kèm hai vai trò đặc biệt không phải chức danh. */
export async function layNhanViTri(): Promise<Record<string, string>> {
  const ds = await layViTri();
  const ra: Record<string, string> = { owner: "Chủ tài khoản", custom: "Quyền riêng" };
  for (const r of ds) ra[r.code] = r.label;
  return ra;
}

/** Dạng gọn để truyền xuống component phía trình duyệt. */
export interface ViTriGon {
  code: string;
  label: string;
  khoi: string | null;
}

export async function layViTriGon(): Promise<ViTriGon[]> {
  return (await layViTri()).map((r) => ({ code: r.code, label: r.label, khoi: r.khoi }));
}
