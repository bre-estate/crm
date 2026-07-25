import { db } from "@/lib/db";
import { products, projects, partners, costReconciliations } from "@/lib/schema";
import { hasReportsAccess } from "@/lib/auth";
import { eq, sql, inArray, asc, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { displayPartnerName } from "@/lib/format";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("vi-VN");
const fmtM = (n: number) => (n / 1_000_000).toFixed(1) + "M";

type SortKey = "gross" | "grossPct" | "revenue" | "cost" | "unitCode" | "date";
type SortOrder = "asc" | "desc";
type SearchParams = Promise<{ sort?: string; order?: string; project?: string }>;

const SORT_LABELS: Record<SortKey, string> = {
  gross: "Lãi gộp",
  grossPct: "Biên lợi nhuận %",
  revenue: "Doanh thu",
  cost: "Giá vốn",
  unitCode: "Mã căn",
  date: "Ngày cọc",
};

export default async function UnitProfitabilityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await hasReportsAccess())) redirect("/");
  const sp = await searchParams;
  const sortKey: SortKey = (sp.sort as SortKey) in SORT_LABELS ? (sp.sort as SortKey) : "gross";
  const order: SortOrder = sp.order === "asc" ? "asc" : "desc";
  const projectFilter = sp.project ? Number(sp.project) : null;

  // Query products + join project + partner
  const rows = await db
    .select({
      id: products.id,
      unitCode: products.unitCode,
      projectId: products.projectId,
      projectName: projects.name,
      partnerName: partners.name,
      salesPerson: products.salesPerson,
      depositDate: products.depositDate,
      pmgBasePrice: products.pmgBasePrice,
      pmgRate: products.pmgRate,
      totalRevenue: products.totalRevenue,
      totalCost: products.totalCost,
      saleType: products.saleType,
    })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id));

  // Compute derived
  const derived = rows.map((r) => {
    const rev = Number(r.totalRevenue ?? 0);
    const cost = Number(r.totalCost ?? 0);
    const grossVND = rev / 1.1 - cost;
    const grossPct = rev > 0 ? (grossVND / (rev / 1.1)) * 100 : 0;
    return {
      ...r,
      rev,
      cost,
      grossVND,
      grossPct,
    };
  });

  // Filter by project
  const filtered = projectFilter
    ? derived.filter((r) => r.projectId === projectFilter)
    : derived;

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const mult = order === "asc" ? 1 : -1;
    switch (sortKey) {
      case "gross":
        return (a.grossVND - b.grossVND) * mult;
      case "grossPct":
        return (a.grossPct - b.grossPct) * mult;
      case "revenue":
        return (a.rev - b.rev) * mult;
      case "cost":
        return (a.cost - b.cost) * mult;
      case "unitCode":
        return a.unitCode.localeCompare(b.unitCode) * mult;
      case "date":
        return (a.depositDate ?? "").localeCompare(b.depositDate ?? "") * mult;
      default:
        return 0;
    }
  });

  // Totals + averages
  const totalRev = filtered.reduce((s, r) => s + r.rev, 0);
  const totalCost = filtered.reduce((s, r) => s + r.cost, 0);
  const totalGross = filtered.reduce((s, r) => s + r.grossVND, 0);
  const avgGross = filtered.length > 0 ? totalGross / filtered.length : 0;
  const avgGrossPct = totalRev > 0 ? (totalGross / (totalRev / 1.1)) * 100 : 0;

  // Distinct projects for filter
  const projectList = [
    ...new Map(rows.map((r) => [r.projectId, { id: r.projectId, name: r.projectName }])).values(),
  ]
    .filter((p) => p.name)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const sortLink = (key: SortKey) => {
    const newOrder = sortKey === key && order === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();
    params.set("sort", key);
    params.set("order", newOrder);
    if (projectFilter) params.set("project", String(projectFilter));
    return `/reports/unit-profitability?${params.toString()}`;
  };
  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-slate-300">↕</span>;
    return order === "desc" ? <span>↓</span> : <span>↑</span>;
  };

  return (
    <div className="max-w-7xl space-y-4">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">
            ← Báo cáo
          </Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Lợi nhuận từng căn</h1>
        <p className="text-sm text-slate-500 mt-1">
          {filtered.length} căn · Doanh thu = HH cty thu từ CĐT · Giá vốn = HH trả nội bộ +
          KPI + thưởng · Lãi gộp = DT/1.1 − Giá vốn (chưa trừ CP quản lý). Click header cột để sort.
        </p>
      </div>

      {/* Filter + stats */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Tổng DT (gồm VAT)" value={fmt(totalRev)} />
          <Stat label="Tổng Giá vốn" value={fmt(totalCost)} warn />
          <Stat
            label="Tổng Lãi gộp"
            value={fmt(Math.round(totalGross))}
            highlight={totalGross >= 0}
          />
          <Stat
            label={`Lãi gộp TB / căn · Biên ${avgGrossPct.toFixed(1)}%`}
            value={fmt(Math.round(avgGross))}
          />
        </div>
        <form className="flex gap-2 items-end">
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Dự án</label>
            <select
              name="project"
              defaultValue={projectFilter ?? ""}
              className="input text-sm min-w-48"
            >
              <option value="">— Tất cả —</option>
              {projectList.map((p) => (
                <option key={p.id} value={p.id ?? ""}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="order" value={order} />
          <button className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-200">
            Lọc
          </button>
          {projectFilter && (
            <Link
              href={`/reports/unit-profitability?sort=${sortKey}&order=${order}`}
              className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-200"
            >
              Reset
            </Link>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="text-left p-2 whitespace-nowrap">
                <Link href={sortLink("unitCode")} className="hover:underline">
                  Mã căn {sortIcon("unitCode")}
                </Link>
              </th>
              <th className="text-left p-2">Dự án / Đối tác</th>
              <th className="text-left p-2 whitespace-nowrap">NVKD</th>
              <th className="text-right p-2 whitespace-nowrap">
                <Link href={sortLink("date")} className="hover:underline">
                  Ngày cọc {sortIcon("date")}
                </Link>
              </th>
              <th className="text-right p-2 whitespace-nowrap">
                <Link href={sortLink("revenue")} className="hover:underline">
                  DT {sortIcon("revenue")}
                </Link>
              </th>
              <th className="text-right p-2 whitespace-nowrap">
                <Link href={sortLink("cost")} className="hover:underline">
                  Giá vốn {sortIcon("cost")}
                </Link>
              </th>
              <th className="text-right p-2 whitespace-nowrap">
                <Link href={sortLink("gross")} className="hover:underline">
                  Lãi gộp {sortIcon("gross")}
                </Link>
              </th>
              <th className="text-right p-2 whitespace-nowrap">
                <Link href={sortLink("grossPct")} className="hover:underline">
                  Biên % {sortIcon("grossPct")}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const gPct = r.grossPct;
              const gColor = gPct >= 40 ? "text-green-700" : gPct >= 30 ? "text-slate-700" : "text-orange-700";
              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs">
                    <Link href={`/products/${r.id}`} className="text-blue-600 hover:underline">
                      {r.unitCode}
                    </Link>
                  </td>
                  <td className="p-2">
                    <div className="font-medium text-xs">{r.projectName ?? "—"}</div>
                    <div className="text-[10px] text-slate-500">{displayPartnerName(r.partnerName)}</div>
                  </td>
                  <td className="p-2 text-xs">{r.salesPerson ?? "—"}</td>
                  <td className="p-2 text-right font-mono text-xs">{r.depositDate ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(r.rev)}</td>
                  <td className="p-2 text-right tabular-nums text-orange-700">{fmt(r.cost)}</td>
                  <td className={`p-2 text-right tabular-nums font-semibold ${gColor}`}>
                    {fmt(Math.round(r.grossVND))}
                  </td>
                  <td className={`p-2 text-right tabular-nums text-xs ${gColor}`}>
                    {gPct.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold text-sm">
            <tr>
              <td colSpan={4} className="p-2 text-right">
                TỔNG ({filtered.length} căn):
              </td>
              <td className="p-2 text-right tabular-nums">{fmt(totalRev)}</td>
              <td className="p-2 text-right tabular-nums text-orange-700">{fmt(totalCost)}</td>
              <td className="p-2 text-right tabular-nums text-green-700">
                {fmt(Math.round(totalGross))}
              </td>
              <td className="p-2 text-right tabular-nums text-green-700">
                {avgGrossPct.toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-xs text-slate-500 italic">
        Note: Số tô đỏ = biên &lt; 30%. Số tô xanh = biên ≥ 40%. Click "Mã căn" để xem chi tiết breakdown DT/chi phí/lợi nhuận của từng căn.
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
  highlight,
}: {
  label: string;
  value: string;
  warn?: boolean;
  highlight?: boolean;
}) {
  const color = warn ? "text-orange-700" : highlight ? "text-green-700" : "";
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
