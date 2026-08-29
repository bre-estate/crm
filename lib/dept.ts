/**
 * Rút gọn tên phòng để hiển thị trong bảng quản lý căn / doanh thu.
 * "Kinh doanh - Hồ Gia" → "Hồ Gia". Các phòng khác giữ nguyên.
 */
export function shortDeptName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.replace(/^Kinh doanh\s*-\s*/i, "");
}
