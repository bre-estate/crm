/**
 * Commission report — HH đã ghi nhận per NV, tình trạng đã trả / còn nợ.
 * Nguồn: cost_reconciliations cost_type='sale_commission' + payments_out.
 */
import { db } from "@/lib/db";
import { costReconciliations, products, paymentsOut } from "@/lib/schema";
import { sql, and, gte, lte, eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

type SP = Promise<{ year?: string; period?: string; q?: string; month?: string }>;
function periodDates(year: number, period: string, q?: number, month?: number) {
  if (period === "month" && month) {
    const s = `${year}-${String(month).padStart(2, "0")}-01`;
    const e = new Date(year, month, 0).toISOString().slice(0, 10);
    return { start: s, end: e, label: `T${month}/${year}` };
  }
  if (period === "quarter" && q) {
    const sm = (q - 1) * 3 + 1;
    return { start: `${year}-${String(sm).padStart(2, "0")}-01`, end: new Date(year, sm + 2, 0).toISOString().slice(0, 10), label: `Q${q}/${year}` };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Năm ${year}` };
}

export default async function CommissionReportPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sp = await searchParams;
  const year = Number(sp.year) || 2025;
  const period = sp.period ?? "year";
  const q = sp.q ? Number(sp.q) : undefined;
  const month = sp.month ? Number(sp.month) : undefined;
  const { start, end, label } = periodDates(year, period, q, month);

  // HH sale theo NV
  const rows = await db.execute(sql`
    SELECT
      c.employee_name AS name,
      COUNT(DISTINCT c.product_id)::int AS units,
      COUNT(*)::int AS recons,
      COALESCE(SUM(c.amount_payable_this_time), 0)::float8 AS accrued,
      COALESCE((SELECT SUM(po.amount) FROM payments_out po WHERE po.cost_reconciliation_id IN (
        SELECT c2.id FROM cost_reconciliations c2
        WHERE c2.employee_name = c.employee_name
          AND c2.cost_type = 'sale_commission'
          AND c2.reconciliation_date BETWEEN ${start} AND ${end}
      )), 0)::float8 AS paid
    FROM cost_reconciliations c
    WHERE c.cost_type = 'sale_commission'
      AND c.reconciliation_date BETWEEN ${start} AND ${end}
    GROUP BY c.employee_name
    ORDER BY accrued DESC
  `) as any[];

  const totalAccrued = rows.reduce((s, r) => s + Number(r.accrued), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.paid), 0);

  const years = [2024, 2025, 2026];
  const quarters = [1, 2, 3, 4];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const linkTo = (params: { year?: number; period?: string; q?: number; month?: number }) => {
    const p = new URLSearchParams();
    p.set("year", String(params.year ?? year));
    p.set("period", params.period ?? period);
    if (params.q !== undefined) p.set("q", String(params.q));
    if (params.month !== undefined) p.set("month", String(params.month));
    return `/reports/commissions?${p}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs"><Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link></div>
        <h1 className="text-2xl font-bold mt-1">Báo cáo hoa hồng</h1>
        <p className="text-sm text-slate-500 mt-1">HH sale đã ghi nhận per NV theo BCDT. Kỳ: {label}</p>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 flex flex-wrap gap-3 items-center text-xs">
        <div>
          <span className="text-slate-500 mr-2">Năm:</span>
          {years.map((y) => (
            <Link key={y} href={linkTo({ year: y })} className={`inline-block px-2 py-1 rounded mr-1 ${y === year ? "bg-orange-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>{y}</Link>
          ))}
        </div>
        <div>
          <span className="text-slate-500 mr-2">Kỳ:</span>
          <Link href={linkTo({ period: "year" })} className={`inline-block px-2 py-1 rounded mr-1 ${period === "year" ? "bg-blue-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>Cả năm</Link>
          {quarters.map((qi) => (
            <Link key={qi} href={linkTo({ period: "quarter", q: qi })} className={`inline-block px-2 py-1 rounded mr-1 ${period === "quarter" && q === qi ? "bg-blue-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>Q{qi}</Link>
          ))}
        </div>
        <div>
          <span className="text-slate-500 mr-2">Tháng:</span>
          {months.map((m) => (
            <Link key={m} href={linkTo({ period: "month", month: m })} className={`inline-block px-1.5 py-1 rounded mr-1 text-[10px] ${period === "month" && month === m ? "bg-green-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>T{m}</Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card label="Tổng HH ghi nhận" value={fmt(totalAccrued)} color="orange" />
        <Card label="Đã trả" value={fmt(totalPaid)} color="green" />
        <Card label="Còn nợ NV" value={fmt(Math.max(0, totalAccrued - totalPaid))} color="red" />
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left p-2">Nhân viên</th>
              <th className="text-right p-2">Số căn</th>
              <th className="text-right p-2">Số ĐC</th>
              <th className="text-right p-2">HH ghi nhận</th>
              <th className="text-right p-2">Đã trả</th>
              <th className="text-right p-2">Còn nợ</th>
              <th className="text-right p-2 w-20">% tổng</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Không có HH trong kỳ.</td></tr>}
            {rows.map((r, i) => {
              const owed = Math.max(0, Number(r.accrued) - Number(r.paid));
              return (
                <tr key={i} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2 text-right tabular-nums">{r.units}</td>
                  <td className="p-2 text-right tabular-nums text-xs text-slate-500">{r.recons}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{fmt(Number(r.accrued))}</td>
                  <td className="p-2 text-right tabular-nums text-green-700">{fmt(Number(r.paid))}</td>
                  <td className="p-2 text-right tabular-nums font-semibold text-red-700">{owed > 0 ? fmt(owed) : ""}</td>
                  <td className="p-2 text-right text-xs">{pct(Number(r.accrued), totalAccrued)}</td>
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                <td className="p-2">TỔNG</td>
                <td className="p-2 text-right"></td>
                <td className="p-2 text-right"></td>
                <td className="p-2 text-right tabular-nums">{fmt(totalAccrued)}</td>
                <td className="p-2 text-right tabular-nums text-green-700">{fmt(totalPaid)}</td>
                <td className="p-2 text-right tabular-nums text-red-700">{fmt(Math.max(0, totalAccrued - totalPaid))}</td>
                <td className="p-2 text-right">100%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  const cls: Record<string, string> = {
    orange: "bg-orange-50 border-orange-200 text-orange-800",
    green: "bg-green-50 border-green-200 text-green-800",
    red: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[color]}`}>
      <div className="text-[11px] uppercase tracking-wide font-semibold">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
