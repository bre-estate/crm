/**
 * Đọc sheet "2.3_Gia von" của file Báo cáo Doanh Thu.
 * Hàm thuần, không đụng file hay database, để dùng chung cho cả lệnh chạy tay
 * lẫn trang web đọc thẳng file trong Kho tài liệu.
 *
 * Vị trí cột xác minh 22/08/2026, tiêu đề nằm ở dòng thứ 4 (chỉ số 3).
 */

export const SHEET_GIA_VON = "2.3_Gia von";

export type KhoanGiaVon = { loai: string; amt: number };

export type DotGiaVon = {
  excelRow: number;
  employee: string | null;
  /** Cột "Ngày đối chiếu" có điền hay không. Trống nghĩa là kế toán mới tính trước. */
  coNgayDoiChieu: boolean;
  items: KhoanGiaVon[];
  total: number;
};

export type BangGiaVon = {
  sheet: string;
  totalRows: number;
  perProduct: Record<string, DotGiaVon[]>;
};

/** Nhãn hiển thị ↔ cost_type trong app. */
export const COST_TYPE_LABEL: Record<string, string> = {
  sale_commission: "HH sale",
  customer_support: "Hỗ trợ khách",
  cdt_bonus_sale: "CĐT thưởng NVKD",
  cdt_bonus_manager: "CĐT thưởng QL",
  bonus_manager: "CTY thưởng QL",
  kpi_ceo: "KPI CEO",
  kpi_tpkd: "KPI TPKD",
  kpi_admin: "KPI Admin",
};

const so = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

function bocKhoan(r: unknown[]): KhoanGiaVon[] {
  const items: KhoanGiaVon[] = [];
  const them = (loai: string, amt: number) => {
    if (amt && Math.abs(amt) > 0.5) items.push({ loai, amt });
  };
  them("HH sale", so(r[21])); // PMG phải trả đợt này (gross)
  them("Hỗ trợ khách", so(r[23])); // Chi hỗ trợ cho khách
  them("CĐT thưởng NVKD", so(r[24])); // CĐT thưởng sale (trừ VAT)
  them("CĐT thưởng QL", so(r[25])); // CĐT thưởng QL sàn
  them("CTY thưởng QL", so(r[27])); // CTY thưởng quản lý
  them("KPI CEO", so(r[31])); // KPI CEO còn thanh toán đợt này
  them("KPI TPKD", so(r[35])); // KPI TPKD còn thanh toán đợt này
  them("KPI Admin", so(r[37])); // Thưởng Admin
  return items;
}

/** Lưới ô đã đọc sẵn từ Excel (mỗi phần tử là một dòng) thành bảng giá vốn theo căn. */
export function bocGiaVon(grid: unknown[][]): BangGiaVon {
  const perProduct: Record<string, DotGiaVon[]> = {};
  for (let i = 4; i < grid.length; i++) {
    const r = grid[i];
    if (!r) continue;
    const ma = r[3] == null ? "" : String(r[3]).trim();
    const total = so(r[38]);
    if (!ma || !total) continue;
    (perProduct[ma] ??= []).push({
      excelRow: i + 1,
      employee: r[2] ? String(r[2]).trim() : null,
      coNgayDoiChieu: !!(r[1] && String(r[1]).trim()),
      items: bocKhoan(r),
      total,
    });
  }
  return { sheet: SHEET_GIA_VON, totalRows: grid.length, perProduct };
}
