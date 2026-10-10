/**
 * Công thức doanh thu lũy kế. MỘT nơi duy nhất.
 *
 * Trước đây form nhập tự tính một kiểu (app/revenues/RevenueForm.tsx), trang
 * soát tự tính một kiểu khác. Viết lại công thức lần hai thì sai lần hai:
 * trang soát lấy %PMG mốc cuối của hợp đồng thay vì %PMG ghi trên đợt, nên
 * báo thiếu oan cho mọi căn chưa chạy tới mốc chót. Hai căn B.23.24 và
 * A2-06-17 bị gắn nhãn sai, thực tế lệch đúng bằng 0.
 *
 * Nên từ nay cả hai nơi gọi chung hàm ở đây. Sai thì sai cùng nhau và lộ ra
 * ngay, chứ không âm thầm lệch nhau.
 *
 * Công thức gốc, khớp Excel cột 19 và 20 của sheet 2.2:
 *
 *   lũy kế tới đợt này = giá tính PMG × %PMG của đợt × tiến độ − phí admin
 *   số tiền đợt này    = lũy kế tới đợt này − lũy kế các đợt trước
 *
 * Ba điều dễ nhầm:
 *   1. %PMG TĂNG DẦN theo mốc sản lượng. Phải lấy tỷ lệ ghi trên chính đợt
 *      đó, không lấy tỷ lệ cuối của hợp đồng.
 *   2. Tiến độ là LŨY KẾ, không cộng dồn giữa các đợt.
 *   3. Phí admin ưu tiên số ghi trên đợt, chỉ rơi về số của căn khi đợt bỏ
 *      trống. Và chỉ trừ MỘT LẦN trong lũy kế, không trừ mỗi đợt.
 */

export type ThamSoDoanhThu = {
  /** Giá tính PMG của căn. */
  pmgBasePrice: number;
  /** %PMG_LK ghi trên đợt đang xét, dạng phân số. */
  pmgCumulativePct: number;
  /** Tiến độ lũy kế của đợt đang xét, 0 đến 1. */
  phasePct: number;
  /** Phí admin ghi trên đợt. Bỏ trống thì dùng của căn. */
  adminFeeVat?: number | null;
  /** Phí admin cấu hình trên căn. */
  adminFee?: number | null;
};

const so = (v: unknown) => Number(v ?? 0);

/** Phí admin áp dụng: ưu tiên số ghi trên đợt. */
export function phiAdminApDung(t: ThamSoDoanhThu): number {
  return so(t.adminFeeVat) || so(t.adminFee);
}

/**
 * Doanh thu hoa hồng LŨY KẾ tính tới đợt đang xét.
 * Tương ứng cột 19 của Excel sheet 2.2.
 */
export function luyKeDoanhThu(t: ThamSoDoanhThu): number {
  const gross = so(t.pmgBasePrice) * so(t.pmgCumulativePct) * so(t.phasePct);
  return gross - phiAdminApDung(t);
}

/**
 * Số tiền phải thu RIÊNG đợt này, tức lũy kế trừ đi các đợt trước.
 * Tương ứng cột 20 của Excel sheet 2.2. Không trả số âm.
 */
export function soTienDotNay(t: ThamSoDoanhThu, luyKeCacDotTruoc: number): number {
  return Math.max(0, Math.round(luyKeDoanhThu(t) - so(luyKeCacDotTruoc)));
}
