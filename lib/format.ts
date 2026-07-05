export const fmtMoney = (v: number | null | undefined): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return "0";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(v));
};

// Pad to fixed digits: 7.00%, 5.50%, 4.45%
export const fmtPct = (v: number | null | undefined, digits = 2): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return "0%";
  return `${(Number(v) * 100).toFixed(digits)}%`;
};

// Compact: drop trailing zeros (7% / 5.5% / 4.45%)
export const fmtPctTight = (v: number | null | undefined, maxDigits = 2): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return "0%";
  const fixed = (Number(v) * 100).toFixed(maxDigits);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return `${trimmed || "0"}%`;
};

export const fmtPctRaw = (v: number | null | undefined, digits = 2): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return "0%";
  return `${Number(v).toFixed(digits)}%`;
};

export const parseNumInput = (v: string): number => {
  const clean = v.replace(/[^\d.-]/g, "");
  const n = Number(clean);
  return isNaN(n) ? 0 : n;
};

export const fmtDate = (v: string | null | undefined): string => {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("vi-VN");
};

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
    case "sale_commission": return "Hoa hồng sale";
    case "customer_support": return "Hỗ trợ khách";
    case "bonus_sale": return "Thưởng NVKD (CTY)";
    case "bonus_manager": return "Thưởng TPKD (CTY)";
    case "cdt_bonus_sale": return "Thưởng nóng CĐT (NVKD)";
    case "cdt_bonus_manager": return "Thưởng nóng CĐT (TPKD)";
    case "kpi_ceo": return "KPI CEO";
    case "kpi_tpkd": return "KPI TPKD (Trưởng phòng)";
    case "kpi_admin": return "KPI Admin";
    default: return t;
  }
};
