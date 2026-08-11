import { db } from "@/lib/db";
import { projects, partners, products } from "@/lib/schema";
import { fmtMoney, fmtPct, fmtPctRaw, displayPartnerName, isSecondaryPartner } from "@/lib/format";
import Link from "next/link";
import { eq, asc, sql } from "drizzle-orm";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const allProjects = await db
    .select({
      id: projects.id,
      code: projects.code,
      fullCode: projects.fullCode,
      name: projects.name,
      partnerName: partners.name,
      breRole: projects.breRole,
      defaultSaleType: projects.defaultSaleType,
      totalUnits: projects.totalUnits,
      adminFee: projects.adminFee,
      adminFeeSale: projects.adminFeeSale,
    })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name));

  // Chỉ show dự án sơ cấp (thứ cấp có trang riêng)
  const primaryProjects = allProjects.filter(
    (r) => r.defaultSaleType !== "secondary" && !isSecondaryPartner(r.partnerName),
  );

  // Aggregate stats per project từ products (căn chốt)
  const statsRows = await db
    .select({
      projectId: products.projectId,
      breCount: sql<number>`count(*)::int`,
      soldCount: sql<number>`count(*) filter (where deposit_date is not null)::int`,
      avgPmg: sql<number>`avg(pmg_rate) filter (where deposit_date is not null and pmg_rate is not null)::float8`,
      minPmg: sql<number>`min(pmg_rate) filter (where deposit_date is not null and pmg_rate is not null)::float8`,
      maxPmg: sql<number>`max(pmg_rate) filter (where deposit_date is not null and pmg_rate is not null)::float8`,
      latestPmg: sql<number>`(array_agg(pmg_rate order by deposit_date desc nulls last, id desc) filter (where deposit_date is not null))[1]::float8`,
      latestSaleRate: sql<number>`(array_agg(pmg_sale_rate order by deposit_date desc nulls last, id desc) filter (where deposit_date is not null))[1]::float8`,
    })
    .from(products)
    .groupBy(products.projectId);
  const statsMap = new Map(statsRows.map((r) => [r.projectId, r]));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Dự án</h1>
          <p className="text-sm text-slate-500 mt-1">
            %PMG_LK do BRE quyết định linh động per căn — thống kê tổng hợp từ căn đã cọc.
          </p>
        </div>
        <Button
          className="bg-orange-500 hover:bg-orange-600 text-white"
          render={<Link href="/projects/new" />}
        >
          + Thêm dự án
        </Button>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left p-2 whitespace-nowrap">Mã / Dự án</th>
              <th className="text-left p-2">CĐT</th>
              <th className="text-right p-2 whitespace-nowrap">%PMG latest</th>
              <th className="text-right p-2 whitespace-nowrap">Range PMG</th>
              <th className="text-right p-2 whitespace-nowrap">%sale latest</th>
              <th className="text-right p-2 whitespace-nowrap">Phí admin</th>
              <th className="text-right p-2 whitespace-nowrap">Admin sale</th>
              <th className="text-left p-2 whitespace-nowrap">Vai trò</th>
              <th className="text-right p-2 whitespace-nowrap">BRE / Tổng</th>
              <th className="text-right p-2 whitespace-nowrap">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {primaryProjects.map((p) => {
              const st = statsMap.get(p.id);
              const bre = st?.breCount ?? 0;
              const sold = st?.soldCount ?? 0;
              const total = p.totalUnits ?? 0;
              const hasRateRange = st?.minPmg != null && st?.maxPmg != null && st.minPmg !== st.maxPmg;
              return (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50 align-middle">
                  <td className="p-2">
                    <div className="font-mono text-[10px] text-slate-500">{p.fullCode}</div>
                    <div className="font-medium text-sm">{p.name}</div>
                  </td>
                  <td className="p-2 text-slate-700 text-xs">
                    {displayPartnerName(p.partnerName) || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap">
                    {st?.latestPmg != null ? (
                      <span className="font-semibold">{fmtPct(Number(st.latestPmg))}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap text-xs">
                    {hasRateRange ? (
                      <span className="text-slate-500">{fmtPct(Number(st!.minPmg))} - {fmtPct(Number(st!.maxPmg))}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap text-xs">
                    {st?.latestSaleRate != null ? fmtPct(Number(st.latestSaleRate)) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap text-xs">
                    {p.adminFee && p.adminFee > 0 ? fmtMoney(p.adminFee) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap text-xs">
                    {p.adminFeeSale && p.adminFeeSale > 0 ? fmtMoney(p.adminFeeSale) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.breRole === "f1" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                      {p.breRole === "f1" ? "BRE=F1" : "BRE=F2"}
                    </span>
                  </td>
                  <td className="p-2 text-right tabular-nums text-xs whitespace-nowrap">
                    {total > 0 ? (
                      <span>{bre}/{total} <span className="text-slate-400">({fmtPctRaw((bre / total) * 100, 0)})</span></span>
                    ) : bre > 0 ? `${bre}/?` : <span className="text-slate-300">—</span>}
                    {sold < bre && bre > 0 && (
                      <div className="text-[10px] text-slate-400">{sold} đã cọc</div>
                    )}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <Link href={`/projects/${p.id}`} className="text-blue-600 hover:underline text-xs">Sửa</Link>
                  </td>
                </tr>
              );
            })}
            {primaryProjects.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có dự án sơ cấp nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
