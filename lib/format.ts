export const fmtMoney = (v: number | null | undefined): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return "0";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(v));
};

export const fmtPct = (v: number | null | undefined, digits = 2): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return "0%";
  // if v is stored as decimal (e.g. 0.055), show as percent
  return `${(Number(v) * 100).toFixed(digits)}%`;
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
    case "bonus_sale": return "Thưởng NVKD";
    case "bonus_manager": return "Thưởng quản lý";
    case "kpi_ceo": return "KPI CEO";
    case "kpi_tpkd": return "KPI TPKD";
    case "kpi_admin": return "KPI Admin";
    default: return t;
  }
};
