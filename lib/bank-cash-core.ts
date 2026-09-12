/**
 * Phân loại sao kê bank và sổ chi tiền mặt founder thành chân tiền cho báo cáo dòng tiền,
 * dùng cho năm chưa có sổ NKC. Hàm thuần.
 *
 * Thứ tự ưu tiên: (1) người dùng đã sửa tay ở /finance/bank-review; (2) chuyển nội bộ, thuế, BHXH;
 * (3) người nhận là nhân viên → đọc loại tiền như employee-pay; (4) giữ chỗ/YCTV/booking;
 * (5) CĐT và đối tác; (6) từ khóa chi phí; (7) classifier chung; không rõ → chua_phan_loai.
 */
import { classify, type CategoryKey } from "./transaction-classifier";
import { classifyPayDescription, groupOf, matchEmployee, stripName, type EmployeeLite } from "./employee-pay-core";
import { resolvePolicy, type CommissionPolicy, type Role } from "./commission-policy";
import type { CashLeg } from "./cash-pnl-core";

export interface BankRowLite {
  id?: number;
  date: string;               // YYYY-MM-DD
  partnerName: string | null;
  description: string;
  credit: number;             // tiền vào, dương
  debit: number;              // tiền ra, dương
  category?: string | null;
  categorySource?: string | null;
}

export interface BankLeg extends CashLeg { source: "manual" | "rule" | "employee" | "auto"; bankRowId?: number }

const CDT = /DXMD|DATA ?LOCA|DANH KHOI|BAM ?LAND|BCONS|VAN XUAN|\bVXS\b|ZLAND|PITALAND|TAN VUONG|OPLUS|\bOPR\b|PHU DONG|\bT&A\b|DKRS|FIATO|DAT XANH/;
const COMPANY = /\bCTY\b|CONG TY|COMPANY|\bJSC\b|CTCP|CT TNHH|\bCN\b|BANK|KHO BAC|BAO HIEM|BHXH|PROPERTY|SERVICE|CORP|INVESTMENT/;
const GIU_CHO = /YCTV|DKTV|DKNV|GIU CHO|GCCDK|GCCCD|\bYC\b|DANG KY DU AN|DANG KY NV|NOP THAY|DAT COC|DAT CHO|BOOKING|DAT MUA|GIU UT|CHUYEN HO|\bCK HO\b|TAM UNG.*(DU AN|DA )/;
const HOAN = /HOAN TIEN|HOAN TRA|TRA LAI|HOAN PHIEU|\bHOAN\b|THANH LY/;
const ROLE_OF: Record<string, Role | undefined> = { nvkd: "nvkd", ctv: "ctv", tpkd: "tpkd", admin: "admin", hr: "admin" };

export interface ClassifyCtx { employees: EmployeeLite[]; policies: CommissionPolicy[] }

/** Trạng thái chạy tuần tự theo ngày: lương tháng gần nhất từng người, để tách lệnh gộp lương + hoa hồng. */
export function makeBankClassifier(ctx: ClassifyCtx) {
  const lastSalary = new Map<number, number>();
  const T = (re: RegExp, s: string) => re.test(s);

  return function classifyBankRow(row: BankRowLite): BankLeg[] {
    const direction: "in" | "out" = row.credit > 0 ? "in" : "out";
    const amount = direction === "in" ? row.credit : row.debit;
    const base = { date: row.date, channel: "bank" as const, direction, amount, counterAccount: "", description: row.description, bankRowId: row.id };
    const leg = (category: CategoryKey, source: BankLeg["source"], amt = amount): BankLeg => ({ ...base, amount: amt, category, source });
    if (!amount) return [];

    if (row.categorySource === "manual" && row.category) return [leg(row.category as CategoryKey, "manual")];

    const d = stripName(row.description ?? "");
    const p = stripName(row.partnerName ?? "");
    const raw = (row.description ?? "").toUpperCase(); // còn số, cho mã đơn hàng, mã BDS

    // (2) nội bộ, thuế, BHXH
    if (T(/TERM DEPOSIT|TIET KIEM|TAT TOAN SO TIET KIEM/, d)) return [leg("chuyen_noi_bo", "rule")];
    if (T(/SAN GIAO DICH BDS BRE|SAN GIAO DICH BAT DONG SAN BRE/, p)) return [leg("chuyen_noi_bo", "rule")];
    if (direction === "in" && T(/NOP TIEN VAO TAI KHOAN|NOP TIEN MAT|NOP TIEN$/, d)) return [leg("chuyen_noi_bo", "rule")];
    if (T(/KBNN|NTDT|KHO BAC/, d) || T(/KHO BAC/, p)) return [leg("thue_kbnn", "rule")];
    if (direction === "in" && T(/TRA LAI SO DU|LAI TIEN GUI|LAI NHAP GOC/, d)) return [leg("khac_thu", "rule")];
    if (T(/BHXH|BAO HIEM XA HOI/, d) || T(/BAO HIEM XA HOI|BHXH/, p)) return [leg("bhxh", "rule")];

    // (3) nhân viên
    const emp = matchEmployee(row.partnerName, ctx.employees);
    if (emp && direction === "out") {
      const group = groupOf(emp);
      const luongCat: CategoryKey = group === "kinh_doanh" ? "luong_nvkd" : "luong_admin";
      const kind = classifyPayDescription(row.description);
      if (kind === "khong_tinh") {
        if (T(HOAN, d) && T(/THUE|TNCN/, d)) return [leg("opex_khac", "employee")];
        if (T(/UNG CHI PHI|TAM UNG/, d)) return [leg("chuyen_noi_bo", "employee")];
        if (T(/TIEP KHACH/, d)) return [leg("tiep_khach", "employee")];
        return [leg("hoan_khach", "employee")];
      }
      if (kind === "luong_va_hh") {
        let luong = lastSalary.get(emp.id) ?? 0;
        if (!luong) { const role = ROLE_OF[emp.position]; const pol = role ? resolvePolicy(ctx.policies, role, row.date) : null; luong = pol ? Number(pol.baseSalary ?? 0) : 0; }
        luong = Math.min(luong, amount);
        const out: BankLeg[] = [];
        if (luong > 0) out.push(leg(luongCat, "employee", luong));
        if (amount - luong > 0) out.push(leg("hh_sale", "employee", amount - luong));
        return out;
      }
      if (kind === "luong_cung") lastSalary.set(emp.id, amount);
      const map: Record<string, CategoryKey> = {
        luong_cung: luongCat, thu_lao_phu_cap: luongCat, khac: luongCat, dich_vu_ke_toan: "luong_admin",
        hoa_hong: "hh_sale", thuong_doanh_so: "thuong_ds_sale", thuong_khac: "thuong_ds_sale",
      };
      return [leg(map[kind] ?? luongCat, "employee")];
    }
    if (emp && direction === "in") {
      if (T(GIU_CHO, d)) return [leg("giu_cho_ho_khach", "employee")];
      if (T(/HOAN UNG|HOAN TAM UNG|TRA LAI TAM UNG/, d)) return [leg("chuyen_noi_bo", "employee")];
      return [leg("khac_thu", "employee")];
    }

    // (4) giữ chỗ, YCTV, booking
    if (T(/KI QUY|KY QUY/, d)) return [leg("ky_quy", "rule")];
    if (T(GIU_CHO, d)) {
      if (direction === "out") {
        if (T(HOAN, d)) return [leg("hoan_khach", "rule")];
        if (T(/THUONG|HOA HONG/, d)) return [leg("hh_sale", "rule")]; // thưởng booking trả cho đối tác
        return [leg("giu_cho_ho_khach", "rule")];
      }
      if (T(CDT, p) && T(/THUONG/, d) && !T(HOAN, d)) return [leg("dt_hh_so_cap", "rule")];
      return [leg("giu_cho_ho_khach", "rule")];
    }

    // (5) từ khóa chi phí, chỉ tiền ra (đứng trước CĐT vì "DICH VU BCONS" là phí tòa nhà, không phải CĐT)
    if (direction === "out") {
      if (T(/HO TRO KHACH|HO TRO KH\b|CHIET KHAU|CK KHACH|QUY DOI|HO TRO CAN/, d)) return [leg("ho_tro_khach", "rule")];
      if (T(/THUE VAN PHONG|THUE VP|TIEN THUE|THUE NHA|COC THUE|PHI DICH VU THANG|PHI QUAN LY|DIEN NUOC|TIEN DIEN|INTERNET|VIEN THONG/, d)) return [leg("thue_vp", "rule")];
      if (T(/VTMH|NHA HANG|TIEP KHACH|AN UONG|CAFE|HAM RUOU|RUOU|\bBIA\b/, d) || T(/VTMH|NHA HANG/, p)) return [leg("tiep_khach", "rule")];
      if (T(/WIFI|\bWIP\b/, d)) return [leg("thue_vp", "rule")];
      if (T(/DONG PHUC|IN AN|QUANG CAO|MARKETING|TO ROI|TIEC|SU KIEN|BANNER|STANDEE|PROPERTYGURU|BATDONGSAN|CHAY ADS|FACEBOOK|GOOGLE/, d) || T(/BDS\d/, raw) || T(/ALPHA BETA|GIA SON|QUANG CAO|PROPERTYGURU|IN AN/, p)) return [leg("marketing", "rule")];
      if (T(/NOI THAT|BAN GHE|MAY TINH|THIET BI|MAY IN|VAN PHONG PHAM|DO DUNG|TO GAP|BIA HO SO|GIAY IN/, d) || T(/\bDH\d{4}-\d+/, raw) || T(/NOI THAT/, p)) return [leg("do_dung_vp", "rule")];
      if (T(/\bGLU\b/, p)) return [leg("marketing", "rule")]; // đồng phục
      if (T(/CHU KY SO|HOA DON DIEN TU|HDDT|PHAP LUAT|LUAT SU|CONG CHUNG|TU VAN/, d) || T(/CHU KY SO/, p)) return [leg("dich_vu_ngoai", "rule")];
      if (T(/VAN CHUYEN|TAXI|GRAB|MAY BAY|CONG TAC|KHACH SAN/, d)) return [leg("di_lai", "rule")];
    }

    // (6) CĐT và đối tác
    const looksRevenue = T(/PHI MOI GIOI|\bPMG\b|HOA HONG|TT PDV|PHI DICH VU MOI GIOI|THUONG NONG|\bTN DA\b|PHI MG\b/, d);
    if (T(CDT, p) || (direction === "in" && looksRevenue)) {
      if (direction === "in") return [leg(T(HOAN, d) || T(/\bHT\b/, d) ? "giu_cho_ho_khach" : "dt_hh_so_cap", "rule")];
      if (T(/THUONG|HOA HONG|\bPMG\b/, d)) return [leg("hh_sale", "rule")];
      if (T(HOAN, d)) return [leg("hoan_khach", "rule")];
      return [leg("giu_cho_ho_khach", "rule")];
    }
    if (direction === "out" && !T(COMPANY, p) && T(HOAN, d)) return [leg("hoan_khach", "rule")];

    // (7) classifier chung
    const r = classify({ description: row.description, debitAmount: row.debit ? -row.debit : null, creditAmount: row.credit || null, partnerName: row.partnerName });
    if (r.category === "chua_phan_loai" || ((r.category === "opex_khac" || r.category === "khac_thu") && r.confidence < 50)) return [leg("chua_phan_loai", "auto")];
    return [leg(r.category, "auto")];
  };
}

export function classifyBankRows(rows: BankRowLite[], ctx: ClassifyCtx, countFrom?: string): BankLeg[] {
  const fn = makeBankClassifier(ctx);
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.flatMap((r) => fn(r)).filter((l) => !countFrom || l.date >= countFrom);
}

// ───────────────────────── Sổ chi tiền mặt founder (financial_transactions merged-*) ─────────────────────────

export interface FounderCashRow { date: string; description: string; amount: number; managementGroup: string | null; direction: "in" | "out" }

/** null = không tính (chi phục vụ thứ cấp, không phải chi phí công ty). */
export function classifyFounderCash(r: FounderCashRow): CategoryKey | null {
  const g = (r.managementGroup ?? "").trim();
  const d = stripName(r.description ?? "");
  if (g.startsWith("10.") || T2(/SANG NHUONG|THU CAP/, d)) return null;
  if (g.startsWith("1a")) return "luong_nvkd";
  if (g.startsWith("1c")) return "luong_admin";
  if (g.startsWith("1b")) {
    if (T2(/THUONG DOANH SO/, d)) return "thuong_ds_sale";
    if (T2(/QUANG CAO|MARKETING|FACEBOOK|ADS|TO ROI|IN AN|SU KIEN|TIEC/, d)) return "marketing";
    return "hh_sale";
  }
  if (g.startsWith("2.")) {
    if (T2(/TIEP KHACH|AN UONG|CAFE|NHA HANG/, d)) return "tiep_khach";
    if (T2(/XANG|GRAB|TAXI|DI LAI|VAN CHUYEN|GUI XE|GIAO/, d)) return "di_lai";
    return "thue_vp";
  }
  if (g.startsWith("5a") || g.startsWith("6a")) return "do_dung_vp";
  if (g.startsWith("7b")) return "thue_kbnn";
  if (g.startsWith("7")) return "thue_phi_le_phi";
  if (g.startsWith("10a")) return "opex_khac";
  if (g.startsWith("11")) return "von_gop";
  if (g.startsWith("13")) return "hoan_khach";
  if (g.startsWith("14")) return "giu_cho_ho_khach";
  if (g.startsWith("15")) return "chuyen_noi_bo";
  if (g.startsWith("12")) return "chua_phan_loai";
  return "chua_phan_loai";
}
const T2 = (re: RegExp, s: string) => re.test(s);

export function founderCashToLegs(rows: FounderCashRow[]): CashLeg[] {
  const out: CashLeg[] = [];
  for (const r of rows) {
    const cat = classifyFounderCash(r);
    if (!cat || !r.amount) continue;
    out.push({ date: r.date, channel: "cash", direction: r.direction, amount: r.amount, counterAccount: "", description: r.description, category: cat });
  }
  return out;
}
