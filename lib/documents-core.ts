/**
 * Định nghĩa dùng chung cho kho tài liệu. Hàm thuần, không đụng database,
 * để test được và dùng được ở cả máy chủ lẫn trình duyệt.
 */

export const DOC_TYPES = {
  sao_ke: "Sao kê ngân hàng",
  hop_dong: "Hợp đồng",
  hoa_don: "Hóa đơn",
  chinh_sach: "Chính sách, quyết định",
  khac: "Khác",
} as const;

export type DocType = keyof typeof DOC_TYPES;

export const isDocType = (v: string): v is DocType => v in DOC_TYPES;

/** Đuôi file chấp nhận, theo từng loại tài liệu. */
export const ACCEPT_BY_TYPE: Record<DocType, string> = {
  sao_ke: ".xlsx,.xls,.csv",
  hop_dong: ".pdf,.jpg,.jpeg,.png,.docx",
  hoa_don: ".pdf,.xml,.jpg,.jpeg,.png",
  chinh_sach: ".pdf,.docx,.xlsx",
  khac: "",
};

/** 50 MB, khớp giới hạn đặt trên bucket tai-lieu. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Ngưỡng coi một file là "nặng bất thường" và nên nén.
 * Một trang văn bản scan đọc được chỉ cần khoảng 250 KB. File hợp đồng dịch vụ
 * Fenica nặng 66 MB cho 20 trang, tức 3,3 MB mỗi trang, do máy scan lưu ảnh không nén.
 */
export const NGUONG_NEN_BYTES = 3 * 1024 * 1024;

export function nenDuocKhong(mime: string, size: number): boolean {
  if (size < NGUONG_NEN_BYTES) return false;
  return mime === "application/pdf" || mime.startsWith("image/");
}

export function fmtDungLuong(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Bỏ dấu và ký tự lạ để tên file an toàn khi làm đường dẫn trong kho. */
export function lamSachTenFile(ten: string): string {
  const khongDau = ten
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  return khongDau
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "tai-lieu";
}

/**
 * Đường dẫn trong kho: <loại>/<năm>/<thời điểm>-<tên đã làm sạch>.
 * Có thời điểm ở đầu tên để hai người tải cùng một file không ghi đè nhau.
 */
export function duongDanKho(docType: DocType, tenFile: string, luc = new Date()): string {
  const nam = luc.getFullYear();
  const dau = luc.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${docType}/${nam}/${dau}-${lamSachTenFile(tenFile)}`;
}

/** Tỷ lệ nén được, dùng cho câu "nhỏ đi N lần". */
export function tyLeNen(goc: number, sau: number): number | null {
  if (!goc || !sau || sau >= goc) return null;
  return goc / sau;
}

/** Cấu hình thư mục Drive: một thư mục mặc định, và thư mục riêng cho từng loại tài liệu. */
export interface CauHinhDrive {
  accountEmail?: string | null;
  folderId?: string;
  folderName?: string;
  folders?: Partial<Record<DocType, { id: string; name: string }>>;
}

/**
 * Thư mục để lưu một loại tài liệu. Ưu tiên thư mục riêng của loại đó,
 * không có thì rơi về thư mục mặc định, không có nữa thì trả null và bỏ qua việc đẩy lên Drive.
 */
export function thuMucCho(
  cauHinh: CauHinhDrive | null | undefined,
  docType: string,
): { id: string; name: string } | null {
  if (!cauHinh) return null;
  const rieng = cauHinh.folders?.[docType as DocType];
  if (rieng?.id) return rieng;
  if (cauHinh.folderId) return { id: cauHinh.folderId, name: cauHinh.folderName ?? "" };
  return null;
}
