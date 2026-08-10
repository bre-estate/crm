/**
 * Sales report — DT bán hàng chi tiết per dự án / CĐT / NV / phòng.
 * Nguồn: revenue_reconciliations (BCDT kế toán). Filter theo năm + kỳ.
 * Tab: [Theo dự án] [Theo CĐT] [Theo NV] [Theo phòng]
 */
import { db } from "@/lib/db";
import { revenueReconciliations, products, invoices, projects, partners, departments } from "@/lib/schema";
import { sql, and, gte, lte, eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

type SP = Promise<{ year?: string; period?: string; q?: string; month?: string; tab?: string }>;

function periodDates(year: number, period: string, q?: number, month?: number) {
  if (period === "month" && month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(year, month, 0).toISOString().slice(0, 10);
    return { start, end, label: `T${month}/${year}` };
  }
  if (period === "quarter" && q) {
    const startMonth = (q - 1) * 3 + 1;
    const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const end = new Date(year, startMonth + 2, 0).toISOString().slice(0, 10);
    return { start, end, label: `Q${q}/${year}` };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Năm ${year}` };
}

const TABS = [
  { key: "project", label: "Theo dự án" },
  { key: "partner", label: "Theo CĐT" },
  { key: "sales_person", label: "Theo nhân viên" },
  { key: "department", label: "Theo phòng" },
] as const;
type TabKey = typeof TABS[number]["key"];

export default async function SalesReportPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sp = await searchParams;
  const year = Number(sp.year) || 2025;
  const period = sp.period ?? "year";
  const q = sp.q ? Number(sp.q) : undefined;
  const month = sp.month ? Number(sp.month) : undefined;
  const tab: TabKey = (TABS.find(t => t.key === sp.tab)?.key ?? "project") as TabKey;
  const { start, end, label } = periodDates(year, period, q, month);

  const whereClauses = and(
    gte(revenueReconciliations.reconciliationDate, start),
    lte(revenueReconciliations.reconciliationDate, end),
  );

  // Total 4 số quan trọng cho toàn kỳ
  const [totals] = await db
    .select({
      totalRev: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8`,
      cntRecon: sql<number>`count(*)::int`,
      cntUnits: sql<number>`count(distinct ${revenueReconciliations.productId})::int`,
    })
    .from(revenueReconciliations)
    .where(whereClauses);

  // Data per tab
  let breakdown: Array<{ key: string; label: string; sub?: string; rev: number; count: number; units: number }> = [];

  if (tab === "project") {
    const rows = await db
      .select({
        projectId: products.projectId,
        projectName: projects.name,
        rev: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8`,
        count: sql<number>`count(*)::int`,
        units: sql<number>`count(distinct ${revenueReconciliations.productId})::int`,
      })
      .from(revenueReconciliations)
      .innerJoin(products, eq(products.id, revenueReconciliations.productId))
      .innerJoin(projects, eq(projects.id, products.projectId))
      .where(whereClauses)
      .groupBy(products.projectId, projects.name)
      .orderBy(desc(sql`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)`));
    breakdown = rows.map(r => ({
      key: String(r.projectId),
      label: r.projectName ?? "?",
      rev: Number(r.rev),
      count: r.count,
      units: r.units,
    }));
  } else if (tab === "partner") {
    // Partner = CĐT — join qua projects.partner_id
    const rows = await db
      .select({
        partnerId: projects.partnerId,
        partnerName: partners.name,
        rev: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8`,
        count: sql<number>`count(*)::int`,
        units: sql<number>`count(distinct ${revenueReconciliations.productId})::int`,
      })
      .from(revenueReconciliations)
      .innerJoin(products, eq(products.id, revenueReconciliations.productId))
      .innerJoin(projects, eq(projects.id, products.projectId))
      .leftJoin(partners, eq(partners.id, projects.partnerId))
      .where(whereClauses)
      .groupBy(projects.partnerId, partners.name)
      .orderBy(desc(sql`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)`));
    breakdown = rows.map(r => ({
      key: String(r.partnerId ?? "null"),
      label: r.partnerName ?? "(Chưa gán CĐT)",
      rev: Number(r.rev),
      count: r.count,
      units: r.units,
    }));
  } else if (tab === "sales_person") {
    const rows = await db
      .select({
        salesPerson: products.salesPerson,
        deptName: products.deptName,
        rev: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8`,
        count: sql<number>`count(*)::int`,
        units: sql<number>`count(distinct ${revenueReconciliations.productId})::int`,
      })
      .from(revenueReconciliations)
      .innerJoin(products, eq(products.id, revenueReconciliations.productId))
      .where(whereClauses)
      .groupBy(products.salesPerson, products.deptName)
      .orderBy(desc(sql`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)`));
    breakdown = rows.map(r => ({
      key: r.salesPerson ?? "?",
      label: r.salesPerson ?? "(Chưa gán NV)",
      sub: r.deptName ?? "",
      rev: Number(r.rev),
      count: r.count,
      units: r.units,
    }));
  } else if (tab === "department") {
    const rows = await db
      .select({
        deptName: products.deptName,
        rev: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8`,
        count: sql<number>`count(*)::int`,
        units: sql<number>`count(distinct ${revenueReconciliations.productId})::int`,
        salesCount: sql<number>`count(distinct ${products.salesPerson})::int`,
      })
      .from(revenueReconciliations)
      .innerJoin(products, eq(products.id, revenueReconciliations.productId))
      .where(whereClauses)
      .groupBy(products.deptName)
      .orderBy(desc(sql`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)`));
    breakdown = rows.map(r => ({
      key: r.deptName ?? "?",
      label: r.deptName ?? "(Chưa gán phòng)",
      sub: `${r.salesCount} NV`,
      rev: Number(r.rev),
      count: r.count,
      units: r.units,
    }));
  }

  const revTotal = Number(totals?.totalRev ?? 0);

  // Links
  const years = [2024, 2025, 2026];
  const quarters = [1, 2, 3, 4];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const linkTo = (params: { year?: number; period?: string; q?: number; month?: number; tab?: string }) => {
    const p = new URLSearchParams();
    p.set("year", String(params.year ?? year));
    p.set("period", params.period ?? period);
    if (params.q !== undefined) p.set("q", String(params.q));
    if (params.month !== undefined) p.set("month", String(params.month));
    p.set("tab", params.tab ?? tab);
    return `/reports/sales?${p}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs"><Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link></div>
        <h1 className="text-2xl font-bold mt-1">Báo cáo bán hàng</h1>
        <p className="text-sm text-slate-500 mt-1">
          Doanh thu ghi nhận theo BCDT kế toán. Kỳ: {label}. Tab: {TABS.find(t=>t.key===tab)?.label}
        </p>
      </div>

      {/* Period selector */}
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

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Tổng doanh thu (gồm VAT)" value={fmt(revTotal)} highlight />
        <Card label="Doanh thu không VAT" value={fmt(revTotal / 1.1)} />
        <Card label="Số căn chốt" value={String(totals?.cntUnits ?? 0)} sub={`${totals?.cntRecon ?? 0} đối chiếu`} />
        <Card label="TB DT/căn" value={fmt(totals?.cntUnits ? revTotal / totals.cntUnits : 0)} />
      </div>

      {/* Tabs */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-1 inline-flex">
        {TABS.map(t => (
          <Link key={t.key} href={linkTo({ tab: t.key })}
            className={`px-3 py-1.5 rounded text-sm ${t.key === tab ? "bg-orange-500 text-white" : "hover:bg-slate-100"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {/* Breakdown table */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left p-2">{TABS.find(t=>t.key===tab)?.label}</th>
              <th className="text-right p-2">Số căn</th>
              <th className="text-right p-2">Số ĐC</th>
              <th className="text-right p-2">Doanh thu</th>
              <th className="text-right p-2 w-24">% tổng</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-slate-500">Không có dữ liệu trong kỳ.</td></tr>
            )}
            {breakdown.map(r => (
              <tr key={r.key} className="border-t hover:bg-slate-50">
                <td className="p-2">
                  <div className="font-medium">{r.label}</div>
                  {r.sub && <div className="text-[11px] text-slate-500">{r.sub}</div>}
                </td>
                <td className="p-2 text-right tabular-nums">{r.units}</td>
                <td className="p-2 text-right text-xs text-slate-500 tabular-nums">{r.count}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{fmt(r.rev)}</td>
                <td className="p-2 text-right text-xs">{pct(r.rev, revTotal)}</td>
              </tr>
            ))}
            {breakdown.length > 0 && (
              <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                <td className="p-2">TỔNG</td>
                <td className="p-2 text-right tabular-nums">{totals?.cntUnits ?? 0}</td>
                <td className="p-2 text-right tabular-nums text-xs">{totals?.cntRecon ?? 0}</td>
                <td className="p-2 text-right tabular-nums">{fmt(revTotal)}</td>
                <td className="p-2 text-right">100%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200"}`}>
      <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-600">{label}</div>
      <div className={`tabular-nums mt-1 ${highlight ? "text-2xl font-bold" : "text-lg font-semibold"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
