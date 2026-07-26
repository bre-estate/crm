import { db } from "@/lib/db";
import { products, projects, partners, financialTransactions } from "@/lib/schema";
import { hasReportsAccess } from "@/lib/auth";
import { eq, sql, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { displayPartnerName } from "@/lib/format";

export const dynamic = "force-dynamic";

const OPEX_CATEGORIES = ["6421", "6427-rent", "6427-svc", "6417", "6428", "6425", "635"];

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

type SortKey = "net" | "netPct" | "gross" | "grossPct" | "revenue" | "cost" | "opex" | "unitCode" | "date";
type SortOrder = "asc" | "desc";
type SearchParams = Promise<{ sort?: string; order?: string; project?: string }>;

const SORT_LABELS: Record<SortKey, string> = {
  net: "Lãi thuần",
  netPct: "Biên thuần %",
  gross: "Lãi gộp",
  grossPct: "Biên gộp %",
  revenue: "Doanh thu",
  cost: "Giá vốn",
  opex: "CP QL phân bổ",
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
  const sortKey: SortKey = (sp.sort as SortKey) in SORT_LABELS ? (sp.sort as SortKey) : "net";
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

  // ===== Phân bổ CP QL — Cách A' (chia đều bình quân toàn kỳ) =====
  // CP QL / căn = Tổng CP QL lũy kế / Tổng số căn (all time).
  // Mọi căn gánh cùng 1 con số cố định — không bị outlier do tháng
  // bất thường (VD T2/2026 thưởng tết 856M, T7/2026 chỉ 87M).
  // Reflect "cost trung bình của cty" — công bằng theo hoạt động chung.
  const [opexAll] = await db
    .select({ sum: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(inArray(financialTransactions.categoryCode, OPEX_CATEGORIES));
  const totalOpexAllTime = Number(opexAll.sum);
  const totalUnitsAllTime = rows.length;
  const opexPerUnit = totalUnitsAllTime > 0 ? totalOpexAllTime / totalUnitsAllTime : 0;

  // Compute derived per unit — mọi căn gánh cùng opexPerUnit
  const derived = rows.map((r) => {
    const rev = Number(r.totalRevenue ?? 0);
    const cost = Number(r.totalCost ?? 0);
    const grossVND = rev / 1.1 - cost;
    const grossPct = rev > 0 ? (grossVND / (rev / 1.1)) * 100 : 0;
    const allocatedOpex = opexPerUnit;
    const netVND = grossVND - allocatedOpex;
    const netPct = rev > 0 ? (netVND / (rev / 1.1)) * 100 : 0;

    return {
      ...r,
      rev,
      cost,
      grossVND,
      grossPct,
      allocatedOpex,
      netVND,
      netPct,
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
      case "net":
        return (a.netVND - b.netVND) * mult;
      case "netPct":
        return (a.netPct - b.netPct) * mult;
      case "gross":
        return (a.grossVND - b.grossVND) * mult;
      case "grossPct":
        return (a.grossPct - b.grossPct) * mult;
      case "revenue":
        return (a.rev - b.rev) * mult;
      case "cost":
        return (a.cost - b.cost) * mult;
      case "opex":
        return (a.allocatedOpex - b.allocatedOpex) * mult;
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
  const totalOpex = filtered.reduce((s, r) => s + r.allocatedOpex, 0);
  const totalNet = filtered.reduce((s, r) => s + r.netVND, 0);
  const avgGross = filtered.length > 0 ? totalGross / filtered.length : 0;
  const avgNet = filtered.length > 0 ? totalNet / filtered.length : 0;
  const avgGrossPct = totalRev > 0 ? (totalGross / (totalRev / 1.1)) * 100 : 0;
  const avgNetPct = totalRev > 0 ? (totalNet / (totalRev / 1.1)) * 100 : 0;

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
          {filtered.length} căn · <b>Lãi gộp</b> = DT/1.1 − Giá vốn · <b>CP QL phân bổ</b> chia đều
          bình quân toàn kỳ ({fmt(Math.round(opexPerUnit))} VND/căn = {fmt(Math.round(totalOpexAllTime))} tổng CP QL ÷ {totalUnitsAllTime} căn)
          · <b>Lãi thuần</b> = Lãi gộp − CP QL phân bổ. Click header cột để sort.
        </p>
      </div>

      {/* Filter + stats */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <Stat label="Tổng DT (gồm VAT)" value={fmt(totalRev)} />
          <Stat label="Tổng Giá vốn" value={fmt(totalCost)} warn />
          <Stat label="Tổng CP QL phân bổ" value={fmt(Math.round(totalOpex))} warn />
          <Stat
            label={`Lãi gộp TB / căn · biên ${avgGrossPct.toFixed(1)}%`}
            value={fmt(Math.round(avgGross))}
            highlight={avgGross >= 0}
          />
          <Stat
            label={`Lãi thuần TB / căn · biên ${avgNetPct.toFixed(1)}%`}
            value={fmt(Math.round(avgNet))}
            highlight={avgNet >= 0}
            bad={avgNet < 0}
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
                <Link href={sortLink("opex")} className="hover:underline">
                  CP QL {sortIcon("opex")}
                </Link>
              </th>
              <th className="text-right p-2 whitespace-nowrap">
                <Link href={sortLink("net")} className="hover:underline">
                  Lãi thuần {sortIcon("net")}
                </Link>
              </th>
              <th className="text-right p-2 whitespace-nowrap">
                <Link href={sortLink("netPct")} className="hover:underline">
                  Biên thuần % {sortIcon("netPct")}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const nPct = r.netPct;
              const nColor = r.netVND < 0
                ? "text-red-700"
                : nPct >= 15
                  ? "text-green-700"
                  : "text-slate-700";
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
                  <td className="p-2 text-right tabular-nums text-slate-600">
                    {fmt(Math.round(r.grossVND))}
                  </td>
                  <td className="p-2 text-right tabular-nums text-xs text-orange-700">
                    {fmt(Math.round(r.allocatedOpex))}
                  </td>
                  <td className={`p-2 text-right tabular-nums font-bold ${nColor}`}>
                    {fmt(Math.round(r.netVND))}
                  </td>
                  <td className={`p-2 text-right tabular-nums text-xs ${nColor}`}>
                    {nPct.toFixed(1)}%
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
              <td className="p-2 text-right tabular-nums text-slate-600">
                {fmt(Math.round(totalGross))}
              </td>
              <td className="p-2 text-right tabular-nums text-orange-700">
                {fmt(Math.round(totalOpex))}
              </td>
              <td
                className={`p-2 text-right tabular-nums ${
                  totalNet >= 0 ? "text-green-700" : "text-red-700"
                }`}
              >
                {fmt(Math.round(totalNet))}
              </td>
              <td
                className={`p-2 text-right tabular-nums text-xs ${
                  totalNet >= 0 ? "text-green-700" : "text-red-700"
                }`}
              >
                {avgNetPct.toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-xs text-slate-500 italic space-y-1">
        <p>
          <b>Cách phân bổ CP QL</b>: chia đều bình quân toàn kỳ. Mọi căn gánh cùng
          {" "}{fmt(Math.round(opexPerUnit))} VND. Đơn giản, không bị outlier tháng cao thấp.
        </p>
        <p>Số tô đỏ = lãi thuần âm (căn có lãi gộp thấp hơn CP QL phân bổ). Số tô xanh = biên thuần ≥ 15%. Click "Mã căn" xem breakdown chi tiết.</p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
  highlight,
  bad,
}: {
  label: string;
  value: string;
  warn?: boolean;
  highlight?: boolean;
  bad?: boolean;
}) {
  const color = bad
    ? "text-red-700"
    : warn
      ? "text-orange-700"
      : highlight
        ? "text-green-700"
        : "";
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
