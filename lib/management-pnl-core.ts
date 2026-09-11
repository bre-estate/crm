/**
 * Lãi/lỗ quản trị (Management P&L) theo format báo cáo kế toán "BC chi tiết lợi nhuận".
 * Hàm thuần, không đụng DB. Nguồn số liệu do lib/management-pnl.ts nạp:
 *   - Doanh thu: revenue_reconciliations theo ngày đối chiếu.
 *   - Giá vốn (2.x): cost_reconciliations theo loại chi phí + trích trước cuối kỳ (year_end_accruals).
 *     Khi kỳ sau chi thật cho căn đã trích trước thì trừ phần đã trích (hoàn nhập 335).
 *   - Chi phí cố định (4.x): sổ NKC đã phân loại (accounting_journal) + trích trước khác.
 */
import type { CategoryKey } from "./transaction-classifier";

export type CogsKey =
  | "hh_sale" | "ho_tro_khach" | "cdt_thuong_nvkd" | "cdt_thuong_ql"
  | "cty_thuong_ql" | "cty_thuong_tpkd" | "cty_thuong_admin" | "cty_thuong_ceo";

export const COGS_KEYS: CogsKey[] = [
  "hh_sale", "ho_tro_khach", "cdt_thuong_nvkd", "cdt_thuong_ql",
  "cty_thuong_ql", "cty_thuong_tpkd", "cty_thuong_admin", "cty_thuong_ceo",
];

/** cost_reconciliations.cost_type → dòng giá vốn. bonus_sale là thưởng doanh số (4.2), không phải giá vốn. */
export const COST_TYPE_TO_COGS: Record<string, CogsKey | undefined> = {
  sale_commission: "hh_sale",
  customer_support: "ho_tro_khach",
  cdt_bonus_sale: "cdt_thuong_nvkd",
  cdt_bonus_manager: "cdt_thuong_ql",
  bonus_manager: "cty_thuong_ql",
  kpi_tpkd: "cty_thuong_tpkd",
  kpi_admin: "cty_thuong_admin",
  kpi_ceo: "cty_thuong_ceo",
};

export type OpexKey =
  | "luong_nvkd" | "thuong_ds_sale" | "luong_admin" | "marketing"
  | "thue_vp" | "do_dung_vp" | "di_lai" | "tiep_khach" | "dich_vu_ngoai" | "thue_phi_le_phi" | "opex_khac";

export const OPEX_MAIN_KEYS: OpexKey[] = ["luong_nvkd", "thuong_ds_sale", "luong_admin", "marketing"];
export const OPEX_OTHER_KEYS: OpexKey[] = ["thue_vp", "do_dung_vp", "di_lai", "tiep_khach", "dich_vu_ngoai", "thue_phi_le_phi", "opex_khac"];
export const OPEX_KEYS: OpexKey[] = [...OPEX_MAIN_KEYS, ...OPEX_OTHER_KEYS];

export interface CostReconLite {
  date: string;        // YYYY-MM-DD
  unitCode: string;
  costType: string;
  amount: number;
}

export interface AccrualLite {
  date: string;        // YYYY-MM-DD, ngày trích trước (31/12)
  unitCode: string;
  amounts: Partial<Record<CogsKey, number>>;
}

export interface CategoryAmount {
  category: string | null;
  amount: number;
}

export interface Period { start: string; end: string }

export function normalizeUnit(code: string): string {
  return code.trim().toUpperCase().replace(/[.\s]/g, "-");
}

const inPeriod = (d: string, p: Period) => d >= p.start && d <= p.end;

export interface CogsCell {
  recon: number;     // đối chiếu giá vốn trong kỳ
  accrual: number;   // trích trước ghi trong kỳ
  release: number;   // hoàn nhập trích trước kỳ trước (trừ)
  total: number;     // recon + accrual − release
}

export type CogsResult = Record<CogsKey, CogsCell>;

/**
 * Giá vốn theo kỳ.
 * release: với căn đã trích trước TRƯỚC kỳ, phần đối chiếu trong kỳ được coi là chi cho
 * khoản đã trích, trừ đi tối đa bằng số đã trích (từng căn, từng loại).
 */
export function computeCogs(recons: CostReconLite[], accruals: AccrualLite[], period: Period): CogsResult {
  const out = Object.fromEntries(COGS_KEYS.map((k) => [k, { recon: 0, accrual: 0, release: 0, total: 0 }])) as CogsResult;

  const reconInPeriod = new Map<string, number>(); // `${unit}|${key}` → Σ recon trong kỳ
  for (const r of recons) {
    const key = COST_TYPE_TO_COGS[r.costType];
    if (!key || !inPeriod(r.date, period)) continue;
    out[key].recon += r.amount;
    const k = `${normalizeUnit(r.unitCode)}|${key}`;
    reconInPeriod.set(k, (reconInPeriod.get(k) ?? 0) + r.amount);
  }

  for (const a of accruals) {
    if (inPeriod(a.date, period)) {
      for (const [key, amt] of Object.entries(a.amounts) as [CogsKey, number][]) {
        if (amt) out[key].accrual += amt;
      }
    } else if (a.date < period.start) {
      for (const [key, amt] of Object.entries(a.amounts) as [CogsKey, number][]) {
        if (!amt) continue;
        const k = `${normalizeUnit(a.unitCode)}|${key}`;
        const paid = reconInPeriod.get(k) ?? 0;
        if (paid > 0) out[key].release += Math.min(paid, amt);
      }
    }
  }

  for (const k of COGS_KEYS) {
    const c = out[k];
    c.total = Math.round(c.recon + c.accrual - c.release);
    c.recon = Math.round(c.recon); c.accrual = Math.round(c.accrual); c.release = Math.round(c.release);
  }
  return out;
}

export interface RevenueInput { gross: number; bonusSale: number; bonusMgr: number }
export interface RevenueResult { gross: number; net: number; bonusSale: number; bonusMgr: number; netNoBonus: number }

export function computeRevenue(i: RevenueInput): RevenueResult {
  const net = i.gross / 1.1;
  return {
    gross: Math.round(i.gross),
    net: Math.round(net),
    bonusSale: Math.round(i.bonusSale),
    bonusMgr: Math.round(i.bonusMgr),
    netNoBonus: Math.round(net - (i.bonusSale + i.bonusMgr) / 1.1),
  };
}

export type OpexResult = Record<OpexKey, number> & { thue_tndn: number };

/** Gom chi phí cố định từ các dòng đã phân loại (NKC + trích trước khác). Dòng không thuộc opex bị bỏ qua. */
export function computeOpex(rows: CategoryAmount[]): OpexResult {
  const out = Object.fromEntries([...OPEX_KEYS, "thue_tndn"].map((k) => [k, 0])) as OpexResult;
  for (const r of rows) {
    const c = (r.category ?? "opex_khac") as CategoryKey;
    if (c === "thue_tndn") { out.thue_tndn += r.amount; continue; }
    if ((OPEX_KEYS as string[]).includes(c)) out[c as OpexKey] += r.amount;
  }
  for (const k of Object.keys(out) as (keyof OpexResult)[]) out[k] = Math.round(out[k]);
  return out;
}

export interface PnlLine {
  code: string;          // "1.1", "2", "4.5a"
  label: string;
  value: number;
  kind: "section" | "item" | "sub";
  source?: string;       // mô tả nguồn ngắn
  pctBase?: boolean;     // có hiện tỷ trọng/DT không VAT
}

export interface ManagementPnl {
  period: Period;
  revenue: RevenueResult;
  cogs: CogsResult;
  opex: OpexResult;
  totals: { cogs: number; grossProfit: number; fixed: number; otherFixed: number; totalOpex: number; profitBeforeTax: number; tax: number; profitAfterTax: number };
  lines: PnlLine[];
  opexAvailable: boolean; // false khi kỳ chưa có sổ NKC
}

const COGS_LABEL: Record<CogsKey, string> = {
  hh_sale: "Chi phí hoa hồng",
  ho_tro_khach: "Chi phí hỗ trợ khách mua BĐS",
  cdt_thuong_nvkd: "CĐT thưởng cho NVKD",
  cdt_thuong_ql: "CĐT thưởng quản lý sàn",
  cty_thuong_ql: "Công ty thưởng quản lý sàn",
  cty_thuong_tpkd: "Công ty thưởng trưởng phòng KD",
  cty_thuong_admin: "Công ty thưởng Admin",
  cty_thuong_ceo: "Công ty thưởng CEO",
};

const OPEX_LABEL: Record<OpexKey, string> = {
  luong_nvkd: "Lương NVKD + BHXH công ty chịu",
  thuong_ds_sale: "Thưởng doanh số + thưởng khác sale",
  luong_admin: "Lương quản lý + admin + kế toán + BHXH công ty chịu",
  marketing: "Chi phí quảng cáo",
  thue_vp: "Thuê văn phòng + điện nước internet",
  do_dung_vp: "Đồ dùng + thiết bị văn phòng",
  di_lai: "Đi lại + vận chuyển",
  tiep_khach: "Tiếp khách",
  dich_vu_ngoai: "Dịch vụ mua ngoài",
  thue_phi_le_phi: "Thuế phí lệ phí",
  opex_khac: "Chi phí khác",
};

const COGS_CODE: Record<CogsKey, string> = {
  hh_sale: "2.1", ho_tro_khach: "2.2", cdt_thuong_nvkd: "2.3", cdt_thuong_ql: "2.4",
  cty_thuong_ql: "2.5", cty_thuong_tpkd: "2.6", cty_thuong_admin: "2.7", cty_thuong_ceo: "2.8",
};
const OPEX_MAIN_CODE: Record<string, string> = { luong_nvkd: "4.1", thuong_ds_sale: "4.2", luong_admin: "4.3", marketing: "4.4" };
const OPEX_OTHER_CODE: Record<string, string> = {
  thue_vp: "4.5a", do_dung_vp: "4.5b", di_lai: "4.5c", tiep_khach: "4.5d", dich_vu_ngoai: "4.5e", thue_phi_le_phi: "4.5f", opex_khac: "4.5g",
};

export function assemblePnl(
  period: Period,
  revenue: RevenueResult,
  cogs: CogsResult,
  opex: OpexResult,
  opexAvailable: boolean,
): ManagementPnl {
  const cogsTotal = COGS_KEYS.reduce((s, k) => s + cogs[k].total, 0);
  const grossProfit = revenue.net - cogsTotal;
  const otherFixed = OPEX_OTHER_KEYS.reduce((s, k) => s + opex[k], 0);
  const fixed = OPEX_MAIN_KEYS.reduce((s, k) => s + opex[k], 0) + otherFixed;
  const totalOpex = cogsTotal + fixed;
  const profitBeforeTax = revenue.net - totalOpex;
  const tax = opex.thue_tndn;
  const profitAfterTax = profitBeforeTax - tax;

  const lines: PnlLine[] = [
    { code: "1", label: "DOANH THU", value: revenue.gross, kind: "section" },
    { code: "1.1", label: "Doanh thu gồm VAT", value: revenue.gross, kind: "item", source: "Đối chiếu doanh thu, tổng phải thu đợt này" },
    { code: "1.2", label: "Doanh thu không VAT", value: revenue.net, kind: "item", source: "1.1 chia 1,1" },
    { code: "1.3", label: "CĐT thưởng sale (gồm VAT)", value: revenue.bonusSale, kind: "item", source: "Đối chiếu doanh thu, cột thưởng nóng sale" },
    { code: "1.4", label: "CĐT thưởng quản lý (gồm VAT)", value: revenue.bonusMgr, kind: "item", source: "Đối chiếu doanh thu, cột thưởng quản lý" },
    { code: "1.5", label: "Doanh thu không gồm thưởng CĐT (không VAT)", value: revenue.netNoBonus, kind: "item" },
    { code: "2", label: "CÁC KHOẢN GIÁ VỐN TRỰC TIẾP", value: cogsTotal, kind: "section", pctBase: true },
    ...COGS_KEYS.map<PnlLine>((k) => ({
      code: COGS_CODE[k], label: COGS_LABEL[k], value: cogs[k].total, kind: "item", pctBase: true,
      source: cogsSource(cogs[k]),
    })),
    { code: "3", label: "LÃI GỘP", value: grossProfit, kind: "section", pctBase: true },
    { code: "4", label: "CHI PHÍ CỐ ĐỊNH", value: fixed, kind: "section", pctBase: true },
    ...OPEX_MAIN_KEYS.map<PnlLine>((k) => ({ code: OPEX_MAIN_CODE[k], label: OPEX_LABEL[k], value: opex[k], kind: "item", pctBase: true, source: "Sổ NKC đã phân loại" })),
    { code: "4.5", label: "Chi phí quản lý chung khác", value: otherFixed, kind: "item", pctBase: true, source: "Sổ NKC đã phân loại" },
    ...OPEX_OTHER_KEYS.map<PnlLine>((k) => ({ code: OPEX_OTHER_CODE[k], label: OPEX_LABEL[k], value: opex[k], kind: "sub" })),
    { code: "5", label: "TỔNG CHI PHÍ HOẠT ĐỘNG", value: totalOpex, kind: "section", pctBase: true },
    { code: "6", label: "LỢI NHUẬN TRƯỚC THUẾ", value: profitBeforeTax, kind: "section", pctBase: true },
  ];
  if (tax) {
    lines.push({ code: "6.1", label: "Thuế TNDN", value: tax, kind: "item", pctBase: true, source: "Sổ NKC, TK 8211" });
    lines.push({ code: "7", label: "LỢI NHUẬN SAU THUẾ", value: profitAfterTax, kind: "section", pctBase: true });
  }

  return {
    period, revenue, cogs, opex, lines, opexAvailable,
    totals: { cogs: cogsTotal, grossProfit, fixed, otherFixed, totalOpex, profitBeforeTax, tax, profitAfterTax },
  };
}

function cogsSource(c: CogsCell): string {
  const parts = [`ĐC giá vốn ${fmtShort(c.recon)}`];
  if (c.accrual) parts.push(`trích trước ${fmtShort(c.accrual)}`);
  if (c.release) parts.push(`hoàn nhập trích trước ${fmtShort(-c.release)}`);
  return parts.join(" + ").replace("+ hoàn nhập trích trước -", "− hoàn nhập trích trước ");
}

export function fmtShort(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1_000_000_000 ? `${(abs / 1_000_000_000).toFixed(2).replace(".", ",")} tỷ`
    : abs >= 1_000_000 ? `${(abs / 1_000_000).toFixed(1).replace(".", ",")}tr`
    : abs.toLocaleString("vi-VN");
  return n < 0 ? `−${s}` : s;
}

// ───────────────────────── Đối chiếu với báo cáo kế toán ─────────────────────────

export interface PnlReference {
  label: string;                        // "BC chi tiết lợi nhuận 2025, Kim lập 05/04/2026"
  period: Period;
  values: Record<string, number>;       // code → số của kế toán
  notes: Record<string, string>;        // code → giải thích lệch đã biết
}

export interface PnlComparisonRow {
  code: string;
  app: number;
  ref: number | null;
  delta: number | null;   // app − ref
  note?: string;
}

/** Ghép số app với số kế toán theo mã dòng. Dòng kế toán không có → ref null. */
export function compareToReference(pnl: ManagementPnl, ref: PnlReference): PnlComparisonRow[] {
  return pnl.lines.map((l) => {
    const r = ref.values[l.code];
    return {
      code: l.code,
      app: l.value,
      ref: r ?? null,
      delta: r == null ? null : Math.round(l.value - r),
      note: ref.notes[l.code],
    };
  });
}

export const referenceMatchesPeriod = (ref: PnlReference, p: Period) => ref.period.start === p.start && ref.period.end === p.end;
