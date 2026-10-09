/**
 * Kiểu dữ liệu cho trang Soát dữ liệu.
 *
 * Tách khỏi lib/soat-du-lieu.ts vì file đó nối database, mà giao diện phía
 * trình duyệt chỉ cần phần kiểu. Để chung thì bản dựng kéo cả module database
 * vào bundle và báo lỗi.
 */
export type DongTinh = {
  nhan: string;
  giaTri: string;
  /** Dòng kết quả, hiển thị đậm và có gạch trên. */
  chot?: boolean;
};

export type PhatHien = {
  id: string;
  nhom: NhomLoi;
  canId: number;
  canMa: string;
  canTen: string;
  duAn: string;
  tieuDe: string;
  /** Mức lệch, dùng để sắp xếp và hiện ở danh sách. */
  lech: number;
  phepTinh: DongTinh[];
  ketLuan: string;
  lienKet: { nhan: string; href: string }[];
};

export type NhomLoi =
  | "doanh_thu_vuot"
  | "gia_von_vuot"
  | "sai_ty_le"
  | "tien_do_qua"
  | "thieu_ten"
  | "da_giai_thich";

export const TEN_NHOM: Record<NhomLoi, string> = {
  doanh_thu_vuot: "Doanh thu vượt trần hợp đồng",
  gia_von_vuot: "Giá vốn vượt trần hợp đồng",
  sai_ty_le: "Tỷ lệ trên dòng cao hơn hợp đồng",
  tien_do_qua: "Tiến độ thanh toán quá 100%",
  thieu_ten: "Dòng chưa có tên người nhận",
  da_giai_thich: "Đã giải thích được, không cần sửa",
};

