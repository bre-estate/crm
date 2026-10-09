/**
 * Trạng thái theo dõi từng mục trên trang Soát dữ liệu.
 *
 * Tách khỏi lib/actions/soat.ts vì file đó khai "use server", chỉ được xuất
 * hàm async. Giao diện cần đọc danh sách này nên để riêng.
 */
export const TRANG_THAI = {
  moi: "Mới",
  dang_xu_ly: "Đang xử lý",
  de_sau: "Để sau",
} as const;

export type TrangThai = keyof typeof TRANG_THAI;
