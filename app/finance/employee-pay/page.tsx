/**
 * Tiền trả cho nhân sự theo người nhận, từ sao kê. Lọc theo kỳ và người, sắp xếp theo cột.
 * Cách phân loại: lib/employee-pay-core.ts.
 */
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { loadEmployeePay, PAY_GROUP_LABEL, PAY_KIND_LABEL, type PayGroup, type PayKind, type PersonPay } from "@/lib/cash-pnl";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const KINDS: PayKind[] = ["luong_cung", "thu_lao_phu_cap", "hoa_hong", "thuong_doanh_so", "thuong_khac", "dich_vu_ke_toan", "khac"];
const SORT_KEYS = ["total", ...KINDS] as const;
type SortKey = (typeof SORT_KEYS)[number];

type SP = Promise<{ year?: string; from?: string; to?: string; emp?: string; group?: string; sort?: string; dir?: string }>;

export default async function EmployeePayPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("finance");
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const start = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : `${year}-01-01`;
  const end = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : `${year}-12-31`;
  const empId = sp.emp ? Number(sp.emp) : null;
  const group = sp.group === "kinh_doanh" || sp.group === "quan_ly" ? (sp.group as PayGroup) : null;
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as SortKey) : "total";
  const dir = sp.dir === "asc" ? "asc" : "desc";

  const pay = await loadEmployeePay({ start, end });
  const valueOf = (p: PersonPay) => (sort === "total" ? p.total : p.byKind[sort]);
  const people = pay.people
    .filter((p) => !group || p.group === group)
    .sort((a, b) => (dir === "asc" ? valueOf(a) - valueOf(b) : valueOf(b) - valueOf(a)));
  const selected = empId ? pay.people.find((p) => p.employee.id === empId) ?? null : null;

  const link = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { year: String(year), from: sp.from ?? null, to: sp.to ?? null, emp: sp.emp ?? null, group: sp.group ?? null, sort, dir, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/finance/employee-pay?${p}`;
  };
  const sortLink = (k: SortKey) => link({ sort: k, dir: sort === k && dir === "desc" ? "asc" : "desc" });
  const arrow = (k: SortKey) => (sort === k ? (dir === "desc" ? " ↓" : " ↑") : "");
  const totalAll = people.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs"><Link href="/finance" className="text-blue-600 hover:underline">← Kế toán</Link></div>
        <h1 className="text-2xl font-bold mt-1">Tiền trả nhân sự</h1>
        <p className="text-sm text-slate-500 mt-1">
          Từng lệnh chuyển trên sao kê cho người có trong danh sách nhân viên, {start} đến {end}. Loại tiền đọc từ diễn giải lệnh chuyển. Không gồm hoàn YCTV, ứng chi phí, hoàn thuế.
        </p>
      </div>

      <form className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 flex flex-wrap gap-3 items-end text-sm">
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <label className="flex flex-col text-xs text-slate-500">Năm
          <select name="year" defaultValue={String(year)} className="input min-w-24">
            {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500">Từ ngày<input type="date" name="from" defaultValue={sp.from ?? ""} className="input" /></label>
        <label className="flex flex-col text-xs text-slate-500">Đến ngày<input type="date" name="to" defaultValue={sp.to ?? ""} className="input" /></label>
        <label className="flex flex-col text-xs text-slate-500">Khối
          <select name="group" defaultValue={sp.group ?? ""} className="input min-w-40">
            <option value="">Tất cả</option>
            <option value="kinh_doanh">{PAY_GROUP_LABEL.kinh_doanh}</option>
            <option value="quan_ly">{PAY_GROUP_LABEL.quan_ly}</option>
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500">Người
          <select name="emp" defaultValue={sp.emp ?? ""} className="input min-w-48">
            <option value="">Tất cả</option>
            {pay.people.map((p) => <option key={p.employee.id} value={p.employee.id}>{p.employee.name}</option>)}
          </select>
        </label>
        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white rounded-md px-3 py-1.5 text-sm">Lọc</button>
        <Link href={`/finance/employee-pay?year=${year}`} className="text-xs text-slate-500 underline">Bỏ lọc</Link>
      </form>

      {selected && (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
          <div className="px-3 pt-3 text-sm font-semibold">
            {selected.employee.name} · {selected.employee.position} · {PAY_GROUP_LABEL[selected.group]} · tổng {fmt(selected.total)}
          </div>
          <table className="w-full text-xs mt-2">
            <thead className="text-slate-500">
              <tr><th className="text-left p-2">Ngày</th><th className="text-left p-2">Diễn giải</th><th className="text-left p-2">Loại</th><th className="text-right p-2">Số tiền</th><th className="text-left p-2">Tách lương / hoa hồng</th></tr>
            </thead>
            <tbody>
              {selected.items.map((it, i) => (
                <tr key={i} className={`border-t border-slate-100 ${it.kind === "khong_tinh" ? "text-slate-400" : ""}`}>
                  <td className="p-2 tabular-nums">{it.date}</td>
                  <td className="p-2">{it.description}</td>
                  <td className="p-2">{it.kind === "luong_va_hh" ? "Lương + hoa hồng" : PAY_KIND_LABEL[it.kind]}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(it.amount)}</td>
                  <td className="p-2">{it.kind === "luong_va_hh" ? `lương ${fmt(it.luong!)}, hoa hồng ${fmt(it.hoaHong!)} (${it.basis})` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left p-2">Người nhận</th>
              <th className="text-left p-2">Vị trí</th>
              <th className="text-left p-2">Khối</th>
              {KINDS.map((k) => <th key={k} className="text-right p-2"><Link href={sortLink(k)} className="hover:underline">{PAY_KIND_LABEL[k]}{arrow(k)}</Link></th>)}
              <th className="text-right p-2"><Link href={sortLink("total")} className="hover:underline font-semibold">Tổng{arrow("total")}</Link></th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.employee.id} className={`border-t border-slate-100 ${selected?.employee.id === p.employee.id ? "bg-orange-50" : ""}`}>
                <td className="p-2"><Link href={link({ emp: String(p.employee.id) })} className="text-blue-600 hover:underline">{p.employee.name}</Link>{p.lumpSplits.length > 0 && <span className="text-slate-400"> · {p.lumpSplits.length} lệnh gộp</span>}</td>
                <td className="p-2 text-slate-500">{p.employee.position}</td>
                <td className="p-2 text-slate-500">{p.group === "kinh_doanh" ? "Kinh doanh" : "Quản lý"}</td>
                {KINDS.map((k) => <td key={k} className="p-2 text-right tabular-nums">{p.byKind[k] ? fmt(p.byKind[k]) : ""}</td>)}
                <td className="p-2 text-right tabular-nums font-medium">{fmt(p.total)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
              <td className="p-2" colSpan={3}>Cộng {people.length} người</td>
              {KINDS.map((k) => <td key={k} className="p-2 text-right tabular-nums">{fmt(people.reduce((s, p) => s + p.byKind[k], 0))}</td>)}
              <td className="p-2 text-right tabular-nums">{fmt(totalAll)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {pay.unmatched.length > 0 && (
        <div className="text-xs text-slate-500">
          Chuyển cho cá nhân không có trong danh sách nhân viên (không tính): {Array.from(new Set(pay.unmatched.map((u) => u.partnerName))).join(", ")}.
        </div>
      )}
    </div>
  );
}
