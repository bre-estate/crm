export const fmtMoney = (v: number | null | undefined): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return "0";
  const n = Number(v);
  // Normalize -0 và giá trị nhỏ dưới ngưỡng làm tròn (VD -0.4 do floating point
  // → hiển thị "-0" trước đây). Bất kỳ |n| < 0.5 → "0" thẳng.
  if (Math.abs(n) < 0.5) return "0";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n);
};

// Compact: drop trailing zeros (7% / 5,5% / 4,45%). VN standard: comma decimal.
// Value in decimal form (0.075 → 7,5%).
export const fmtPct = (v: number | null | undefined, maxDigits = 2): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return "0%";
  const fixed = (Number(v) * 100).toFixed(maxDigits);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return `${(trimmed || "0").replace(".", ",")}%`;
};

// Alias, kept for backward compat with existing imports.
export const fmtPctTight = fmtPct;

// Value already in percent form (7.5 → 7,5%). Drops trailing zeros.
export const fmtPctRaw = (v: number | null | undefined, maxDigits = 2): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return "0%";
  const fixed = Number(v).toFixed(maxDigits);
  // Chỉ strip trailing zeros nếu có dấu chấm thập phân (tránh "100" → "1")
  const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return `${(trimmed || "0").replace(".", ",")}%`;
};

export const parseNumInput = (v: string): number => {
  const clean = v.replace(/[^\d.-]/g, "");
  const n = Number(clean);
  return isNaN(n) ? 0 : n;
};

// Chuyển tên "TRẦN BÌNH TRỌNG" -> "Trần Bình Trọng". Giữ dấu tiếng Việt.
export const toTitleCase = (v: string | null | undefined): string => {
  if (!v) return "";
  return v
    .trim()
    .toLowerCase()
    .replace(/(^|\s|-)([\p{L}])/gu, (_m, sep, ch) => sep + ch.toUpperCase());
};

export const fmtDate = (v: string | null | undefined): string => {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Dự án thứ cấp không có partner (partnerId null). Backward-compat check
// tên "Chợ thứ cấp" phòng khi có partner ảo cũ còn sót.
export const displayPartnerName = (name: string | null | undefined): string => {
  if (!name || name === "Chợ thứ cấp") return "";
  return name;
};

export const isSecondaryPartner = (name: string | null | undefined): boolean =>
  !name || name === "Chợ thứ cấp";

export const partnerTypeLabel = (t: string): string => {
  if (t === "cdt") return "Chủ đầu tư";
  if (t === "f1") return "Sàn F1";
  if (t === "f2") return "Sàn F2";
  return t;
};

export const contractStatusLabel = (s: string): string => {
  if (s === "chua_ky") return "CHƯA KÝ";
  if (s === "dang_dam_phan") return "ĐANG ĐÀM PHÁN";
  if (s === "da_ky") return "ĐÃ KÝ";
  if (s === "ngung_hop_tac") return "NGỪNG HỢP TÁC";
  return s;
};

export const costTypeLabel = (t: string): string => {
  switch (t) {
    case "sale_commission": return "HH Sale";
    case "customer_support": return "Hỗ trợ khách";
    case "bonus_sale": return "CTY thưởng NVKD";
    case "bonus_manager": return "CTY thưởng TPKD";
    case "cdt_bonus_sale": return "CĐT thưởng NVKD";
    case "cdt_bonus_manager": return "CĐT thưởng TPKD";
    case "kpi_ceo": return "KPI CEO";
    case "kpi_tpkd": return "KPI TPKD";
    case "kpi_admin": return "KPI Admin";
    default: return t;
  }
};
