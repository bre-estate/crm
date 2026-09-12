/**
 * Tách tiền trả cho nhân sự trên sao kê theo NGƯỜI NHẬN (danh sách nhân viên, vị trí) và
 * LOẠI TIỀN (diễn giải: lương cứng, thù lao/phụ cấp, hoa hồng, thưởng doanh số...).
 * Lệnh chuyển gộp "lương + hoa hồng" tách bằng lương tháng gần nhất của chính người đó,
 * không có thì dùng lương cơ bản trong chính sách. Hàm thuần.
 */
import { resolvePolicy, type CommissionPolicy, type Role } from "./commission-policy";

export interface EmployeeLite { id: number; name: string; position: string; note?: string | null }
export interface PayRow { date: string; partnerName: string; amount: number; description: string }

export type PayGroup = "kinh_doanh" | "quan_ly";
export type PayKind = "luong_cung" | "thu_lao_phu_cap" | "hoa_hong" | "thuong_doanh_so" | "thuong_khac" | "dich_vu_ke_toan" | "khac" | "khong_tinh";
export const PAY_KINDS: PayKind[] = ["luong_cung", "thu_lao_phu_cap", "hoa_hong", "thuong_doanh_so", "thuong_khac", "dich_vu_ke_toan", "khac", "khong_tinh"];
export const PAY_KIND_LABEL: Record<PayKind, string> = {
  luong_cung: "Lương cứng",
  thu_lao_phu_cap: "Thù lao, phụ cấp, hỗ trợ",
  hoa_hong: "Hoa hồng, thưởng nóng, KPI",
  thuong_doanh_so: "Thưởng doanh số",
  thuong_khac: "Thưởng khác",
  dich_vu_ke_toan: "Phí kế toán dịch vụ",
  khac: "Chưa rõ loại",
  khong_tinh: "Không phải thu nhập (hoàn YCTV, ứng chi phí, hoàn thuế)",
};
export const PAY_GROUP_LABEL: Record<PayGroup, string> = { kinh_doanh: "Khối kinh doanh (NVKD, TPKD, CTV)", quan_ly: "Khối quản lý, admin, kế toán, marketing" };

export function stripName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}

export function matchEmployee(partnerName: string | null | undefined, employees: EmployeeLite[]): EmployeeLite | null {
  const p = stripName(partnerName ?? "");
  if (!p) return null;
  let best: EmployeeLite | null = null;
  for (const e of employees) {
    const n = stripName(e.name);
    if (!n) continue;
    if (p === n) return e;
    if (p.startsWith(n + " ") && (!best || n.length > stripName(best.name).length)) best = e;
  }
  return best;
}

export function groupOf(e: EmployeeLite): PayGroup {
  const note = stripName(e.note ?? "");
  if (/KE TOAN/.test(note)) return "quan_ly";
  return ["nvkd", "tpkd", "ctv"].includes(e.position) ? "kinh_doanh" : "quan_ly";
}

export function classifyPayDescription(description: string): PayKind | "luong_va_hh" {
  const s = stripName(description);
  if (/UNG CHI PHI|HOAN TIEN|HOAN TRA|TIEP KHACH|YCTV|GIU CHO|DAT COC/.test(s)) return "khong_tinh";
  if (/PHI DICH VU|TOKEN|HDDT|KE TOAN|CHUAN HOA SO/.test(s)) return "dich_vu_ke_toan";
  const hasLuong = /LUONG/.test(s);
  const hasHH = /HOA HONG|THUONG NONG|\bHH\b|KPI/.test(s);
  if (hasLuong && hasHH) return "luong_va_hh";
  if (/THUONG DOANH SO/.test(s)) return "thuong_doanh_so";
  if (hasHH) return "hoa_hong";
  if (/THUONG/.test(s)) return "thuong_khac";
  if (hasLuong) return "luong_cung";
  if (/THU LAO|PHU CAP|HO TRO/.test(s)) return "thu_lao_phu_cap";
  return "khac";
}

const ROLE_OF: Record<string, Role | undefined> = { nvkd: "nvkd", ctv: "ctv", tpkd: "tpkd", admin: "admin", hr: "admin" };

export interface PayItem { date: string; amount: number; description: string; kind: PayKind | "luong_va_hh"; luong?: number; hoaHong?: number; basis?: string }

export interface PersonPay {
  employee: EmployeeLite;
  group: PayGroup;
  byKind: Record<PayKind, number>;
  total: number;           // không gồm khong_tinh
  lumpSplits: { date: string; amount: number; luong: number; hoaHong: number; basis: string }[];
  items: PayItem[];
}

export interface EmployeePaySummary {
  people: PersonPay[];
  groups: Record<PayGroup, Record<PayKind, number>>;
  /** Tiền lương nghĩa rộng (lương cứng + thù lao/phụ cấp + phí kế toán) từng khối, dùng chia dòng lương */
  salaryByGroup: Record<PayGroup, number>;
  unmatched: PayRow[];     // trả cho cá nhân không có trong danh sách nhân viên
}

const zeroKinds = () => Object.fromEntries(PAY_KINDS.map((k) => [k, 0])) as Record<PayKind, number>;

export function summarizeEmployeePay(rows: PayRow[], employees: EmployeeLite[], policies: CommissionPolicy[]): EmployeePaySummary {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const people = new Map<number, PersonPay>();
  const lastSalary = new Map<number, number>();
  const unmatched: PayRow[] = [];

  for (const r of sorted) {
    const e = matchEmployee(r.partnerName, employees);
    if (!e) { if (looksLikePerson(r.partnerName)) unmatched.push(r); continue; }
    let pp = people.get(e.id);
    if (!pp) { pp = { employee: e, group: groupOf(e), byKind: zeroKinds(), total: 0, lumpSplits: [], items: [] }; people.set(e.id, pp); }
    const kind = classifyPayDescription(r.description);
    if (kind === "luong_va_hh") {
      let luong = lastSalary.get(e.id) ?? 0;
      let basis = "lương tháng gần nhất";
      if (!luong) {
        const role = ROLE_OF[e.position];
        const pol = role ? resolvePolicy(policies, role, r.date) : null;
        luong = pol ? Number(pol.baseSalary ?? 0) : 0;
        basis = pol ? "lương cơ bản theo chính sách" : "không tách được";
      }
      luong = Math.min(luong, r.amount);
      pp.byKind.luong_cung += luong;
      pp.byKind.hoa_hong += r.amount - luong;
      pp.total += r.amount;
      pp.lumpSplits.push({ date: r.date, amount: r.amount, luong, hoaHong: r.amount - luong, basis });
      pp.items.push({ date: r.date, amount: r.amount, description: r.description, kind, luong, hoaHong: r.amount - luong, basis });
      continue;
    }
    pp.items.push({ date: r.date, amount: r.amount, description: r.description, kind });
    pp.byKind[kind] += r.amount;
    if (kind !== "khong_tinh") pp.total += r.amount;
    if (kind === "luong_cung") lastSalary.set(e.id, r.amount);
  }

  const groups: Record<PayGroup, Record<PayKind, number>> = { kinh_doanh: zeroKinds(), quan_ly: zeroKinds() };
  for (const pp of people.values()) for (const k of PAY_KINDS) groups[pp.group][k] += pp.byKind[k];
  const salary = (g: Record<PayKind, number>) => g.luong_cung + g.thu_lao_phu_cap + g.dich_vu_ke_toan;

  return {
    people: [...people.values()].sort((a, b) => b.total - a.total),
    groups,
    salaryByGroup: { kinh_doanh: Math.round(salary(groups.kinh_doanh)), quan_ly: Math.round(salary(groups.quan_ly)) },
    unmatched,
  };
}

function looksLikePerson(partner: string | null | undefined): boolean {
  const p = stripName(partner ?? "");
  if (!p) return false;
  const words = p.split(" ").length;
  return words >= 2 && words <= 5 && !/CTY|CONG TY|BANK|KHO BAC|BAO HIEM|BHXH|CTCP|JSC|CN |PHONG|COMPANY|VIET NAM|SERVICE/.test(p);
}
