/**
 * Category codes tập trung theo BCTC Kim (TT200).
 * Thay đổi tại đây một lần → tất cả report dùng chung.
 */

// Chi phí bán hàng (TK 641)
export const CAT_641 = ["6411", "6417"] as const;

// Chi phí quản lý (TK 642)
export const CAT_642 = ["6421", "6423", "6425", "6427"] as const;

// Chi phí khác (TK 811)
export const CAT_811 = ["811"] as const;

// Chi phí trả trước (TK 242) — không tính vào CP kỳ, phân bổ dần
export const CAT_242 = ["242"] as const;

// Chi phí tài chính (TK 635)
export const CAT_635 = ["635"] as const;

// TẤT CẢ chi phí HĐ = 641 + 642 + 811 + 635 (không gồm 242 vì phân bổ)
// Dùng cho: BCTC hợp lệ (nộp thuế / kế toán chuẩn TT200).
// CẢNH BÁO: 6417 hiện gộp HH sale (đã có trong cost_reconciliations). Nếu tính
// (rev − cost_recon − OPEX_CATEGORIES) → double-count HH sale. Dùng
// OPEX_MGMT_CATEGORIES bên dưới cho tính lãi thuần / P&L quản trị.
export const OPEX_CATEGORIES: string[] = [
  ...CAT_641,
  ...CAT_642,
  ...CAT_811,
  ...CAT_635,
];

// OPEX cho báo cáo quản trị / tính lãi thuần — LOẠI 6417 vì HH sale đã nằm
// trong cost_reconciliations (COGS). Không cùng lúc trừ ở cả 2 chỗ.
// Marketing + tiếp khách + thưởng doanh số cũng ở 6417 → chấp nhận under-count
// (giống FIXED_COST_CATEGORIES) hơn là double-count. Long-term: split 6417
// thành 6417-hhsale (COGS) vs 6417-mkt (OPEX thật) qua sub-category.
export const OPEX_MGMT_CATEGORIES: string[] = OPEX_CATEGORIES.filter(
  (c) => c !== "6417",
);

// Chi phí CỐ ĐỊNH (không scale với doanh số) — dùng cho tính Điểm hòa vốn.
// LOẠI 6417 vì 6417 hiện gộp HH sale (variable, đã trừ trong products.totalCost).
// Nếu tính cả 6417 → double count HH sale → BE bị thổi phồng.
// Marketing + tiếp khách + thưởng doanh số cũng ở 6417 nhưng chấp nhận under-count
// hơn là double count. Sau này có thể tách sub-category để chính xác hơn.
export const FIXED_COST_CATEGORIES: string[] = [
  "6411", // Lương NVKD (cố định)
  "6421", // Lương admin + kế toán
  "6423", // Đồ dùng VP
  "6425", // Thuế môn bài
  "6427", // Thuê VP + tiện ích + dịch vụ
  "811", // Chi phí không hóa đơn Triết (cố định)
  "635", // Chi phí tài chính
];

// Trong đó, 641 vs 642 phục vụ grouping BCTC
export const BUCKET_641: string[] = [...CAT_641];
export const BUCKET_642: string[] = [...CAT_642];
export const BUCKET_811: string[] = [...CAT_811];

// Category "không phải chi phí" (loại khỏi P&L)
export const NON_EXPENSE_CATEGORIES = [
  "411", "244", "3411", "131", "141", "3331-3334", "unclassified",
] as const;

/**
 * Phân loại categoryCode → bucket 641/642/811/other để render P&L.
 */
export function bucketOf(code: string): "641" | "642" | "811" | "635" | "242" | "other" {
  if ((CAT_641 as readonly string[]).includes(code)) return "641";
  if ((CAT_642 as readonly string[]).includes(code)) return "642";
  if ((CAT_811 as readonly string[]).includes(code)) return "811";
  if ((CAT_635 as readonly string[]).includes(code)) return "635";
  if ((CAT_242 as readonly string[]).includes(code)) return "242";
  return "other";
}

export const BUCKET_LABELS: Record<string, string> = {
  "641": "Chi phí bán hàng",
  "642": "Chi phí quản lý",
  "811": "Chi phí khác",
  "635": "Chi phí tài chính",
  "242": "Chi phí trả trước",
  "other": "Khác",
};
