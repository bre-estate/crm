"use server";

import { db } from "@/lib/db";
import { soatGhiChu } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { chay, type KetQuaLuu } from "@/lib/actions/ket-qua";
import { TRANG_THAI } from "@/lib/soat-trang-thai";
import { revalidatePath } from "next/cache";

async function _luuGhiChu(
  maPhatHien: string,
  trangThai: string,
  ghiChu: string,
): Promise<void> {
  await requirePermission("reports.soat-du-lieu", "view");
  if (!maPhatHien.trim()) throw new Error("Thiếu mã mục cần ghi chú.");
  if (!(trangThai in TRANG_THAI)) throw new Error("Trạng thái không hợp lệ.");

  const noiDung = ghiChu.trim() || null;

  // Về mặc định và không còn ghi chú thì xoá hẳn, để bảng chỉ giữ những mục
  // thật sự có người theo dõi.
  if (trangThai === "moi" && !noiDung) {
    await db.delete(soatGhiChu).where(eq(soatGhiChu.maPhatHien, maPhatHien));
    revalidatePath("/reports/soat-du-lieu");
    return;
  }

  await db
    .insert(soatGhiChu)
    .values({ maPhatHien, trangThai, ghiChu: noiDung, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: soatGhiChu.maPhatHien,
      set: { trangThai, ghiChu: noiDung, updatedAt: new Date() },
    });
  revalidatePath("/reports/soat-du-lieu");
}

export async function luuGhiChuSoat(
  maPhatHien: string,
  trangThai: string,
  ghiChu: string,
): Promise<KetQuaLuu> {
  return chay(() => _luuGhiChu(maPhatHien, trangThai, ghiChu));
}
