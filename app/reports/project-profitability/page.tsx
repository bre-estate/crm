/**
 * Project profitability — DT − COGS per dự án. Biên gộp %.
 * Nguồn: revenue_reconciliations - cost_reconciliations grouped by project.
 */
import { db } from "@/lib/db";
import { revenueReconciliations, costReconciliations, products, projects } from "@/lib/schema";
import { sql, and, gte, lte, eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

type SP = Promise<{ year?: string; period?: string; q?: string; month?: string }>;
function periodDates(year: number, period: string, q?: number, month?: number) {
  if (period === "month" && month) return { start: `${year}-${String(month).padStart(2,"0")}-01`, end: new Date(year, month, 0).toISOString().slice(0,10), label: `T${month}/${year}` };
  if (period === "quarter" && q) { const sm = (q-1)*3+1; return { start: `${year}-${String(sm).padStart(2,"0")}-01`, end: new Date(year, sm+2, 0).toISOString().slice(0,10), label: `Q${q}/${year}` }; }
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Năm ${year}` };
}

export default async function ProjectProfitabilityPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sp = await searchParams;
  const year = Number(sp.year) || 2025;
  const period = sp.period ?? "year";
  const q = sp.q ? Number(sp.q) : undefined;
  const month = sp.month ? Number(sp.month) : undefined;
  const { start, end, label } = periodDates(year, period, q, month);

  // DT per project (từ BCDT revenue)
  const revRows = await db
    .select({
      projectId: products.projectId,
      projectName: projects.name,
      rev: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8`,
      units: sql<number>`count(distinct ${revenueReconciliations.productId})::int`,
    })
    .from(revenueReconciliations)
    .innerJoin(products, eq(products.id, revenueReconciliations.productId))
    .innerJoin(projects, eq(projects.id, products.projectId))
    .where(and(gte(revenueReconciliations.reconciliationDate, start), lte(revenueReconciliations.reconciliationDate, end)))
    .groupBy(products.projectId, projects.name);

  // COGS per project (từ BCDT cost, all cost_type)
  const costRows = await db
    .select({
      projectId: products.projectId,
      cogs: sql<number>`coalesce(sum(${costReconciliations.amountPayableThisTime}), 0)::float8`,
    })
    .from(costReconciliations)
    .innerJoin(products, eq(products.id, costReconciliations.productId))
    .where(and(gte(costReconciliations.reconciliationDate, start), lte(costReconciliations.reconciliationDate, end)))
    .groupBy(products.projectId);

  const cogsMap = new Map<number, number>();
  for (const c of costRows) cogsMap.set(c.projectId!, Number(c.cogs));

  const merged = revRows.map(r => {
    const rev = Number(r.rev);
    const revNet = rev / 1.1;
    const cogs = cogsMap.get(r.projectId!) ?? 0;
    const laiGop = revNet - cogs;
    const marginPct = revNet > 0 ? (laiGop / revNet) * 100 : 0;
    return {
      projectId: r.projectId,
      projectName: r.projectName ?? "?",
      units: r.units,
      revGross: rev,
      revNet,
      cogs,
      laiGop,
      marginPct,
    };
  }).sort((a, b) => b.revNet - a.revNet);

  const totalRevGross = merged.reduce((s, r) => s + r.revGross, 0);
  const totalRevNet = totalRevGross / 1.1;
  const totalCogs = merged.reduce((s, r) => s + r.cogs, 0);
  const totalLaiGop = totalRevNet - totalCogs;
  const totalMargin = totalRevNet > 0 ? (totalLaiGop / totalRevNet) * 100 : 0;

  const years = [2024, 2025, 2026];
  const quarters = [1, 2, 3, 4];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const linkTo = (params: { year?: number; period?: string; q?: number; month?: number }) => {
    const p = new URLSearchParams();
    p.set("year", String(params.year ?? year));
    p.set("period", params.period ?? period);
    if (params.q !== undefined) p.set("q", String(params.q));
    if (params.month !== undefined) p.set("month", String(params.month));
    return `/reports/project-profitability?${p}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs"><Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link></div>
        <h1 className="text-2xl font-bold mt-1">Lãi/lỗ theo dự án</h1>
        <p className="text-sm text-slate-500 mt-1">DT − Giá vốn per dự án. Biên lãi gộp % giúp so sánh dự án. Kỳ: {label}</p>
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

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white text-xs">
            <tr>
              <th className="text-left p-2">Dự án</th>
              <th className="text-right p-2">Số căn</th>
              <th className="text-right p-2">DT không VAT</th>
              <th className="text-right p-2">Giá vốn</th>
              <th className="text-right p-2">Lãi gộp</th>
              <th className="text-right p-2 w-20">Biên %</th>
            </tr>
          </thead>
          <tbody>
            {merged.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Không có dữ liệu.</td></tr>}
            {merged.map(r => (
              <tr key={r.projectId} className="border-t hover:bg-slate-50">
                <td className="p-2 font-medium">{r.projectName}</td>
                <td className="p-2 text-right tabular-nums">{r.units}</td>
                <td className="p-2 text-right tabular-nums">{fmt(r.revNet)}</td>
                <td className="p-2 text-right tabular-nums text-red-700">{fmt(r.cogs)}</td>
                <td className={`p-2 text-right tabular-nums font-semibold ${r.laiGop >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(r.laiGop)}</td>
                <td className={`p-2 text-right ${r.marginPct >= 30 ? "text-green-700" : r.marginPct >= 15 ? "text-amber-700" : "text-red-700"}`}>
                  {r.marginPct.toFixed(1)}%
                </td>
              </tr>
            ))}
            {merged.length > 0 && (
              <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                <td className="p-2">TỔNG</td>
                <td className="p-2 text-right">{merged.reduce((s, r) => s + r.units, 0)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(totalRevNet)}</td>
                <td className="p-2 text-right tabular-nums text-red-700">{fmt(totalCogs)}</td>
                <td className={`p-2 text-right tabular-nums ${totalLaiGop >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(totalLaiGop)}</td>
                <td className="p-2 text-right">{totalMargin.toFixed(1)}%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 italic">
        Lãi gộp = DT không VAT − Giá vốn trực tiếp (HH sale + hỗ trợ + KPI + thưởng). Chưa trừ CP cố định.
        Biên &gt;30% = 🟢 tốt / 15-30% = 🟡 trung bình / &lt;15% = 🔴 cần xem xét.
      </div>
    </div>
  );
}
