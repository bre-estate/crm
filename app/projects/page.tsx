import { db } from "@/lib/db";
import { projects, partners, products, contracts } from "@/lib/schema";
import { contractStatusLabel, fmtMoney, fmtPct, fmtPctRaw, displayPartnerName, isSecondaryPartner } from "@/lib/format";
import Link from "next/link";
import { eq, asc, count, sql } from "drizzle-orm";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  // Load all projects + contracts
  const allProjects = await db
    .select({
      id: projects.id,
      code: projects.code,
      fullCode: projects.fullCode,
      name: projects.name,
      partnerName: partners.name,
      breRole: projects.breRole,
      contractStatus: projects.contractStatus,
      defaultSaleType: projects.defaultSaleType,
      totalUnits: projects.totalUnits,
      district: projects.district,
      city: projects.city,
    })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name));

  // Chỉ show dự án sơ cấp (thứ cấp có trang riêng)
  const primaryProjects = allProjects.filter(
    (r) => r.defaultSaleType !== "secondary" && !isSecondaryPartner(r.partnerName),
  );

  // Contracts per project
  const allContracts = await db.select().from(contracts).orderBy(asc(contracts.partnerName));
  const contractsByProject = new Map<number, typeof allContracts>();
  for (const c of allContracts) {
    if (c.projectId == null) continue;
    const arr = contractsByProject.get(c.projectId) ?? [];
    arr.push(c);
    contractsByProject.set(c.projectId, arr);
  }

  // Đếm căn per project
  const breCountRaw = await db
    .select({ projectId: products.projectId, c: count() })
    .from(products)
    .groupBy(products.projectId);
  const breCountMap = new Map(breCountRaw.map((r) => [r.projectId, Number(r.c)]));

  // Contracts chưa link project (unmatched khi import)
  const orphanContracts = allContracts.filter((c) => c.projectId == null);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Dự án & Hợp đồng</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mỗi dự án có thể có nhiều hợp đồng (khác CĐT hoặc khác thời kỳ). Rates từ sheet 1_HOP DONG.
          </p>
        </div>
        <Button
          className="bg-orange-500 hover:bg-orange-600 text-white"
          render={<Link href="/projects/new" />}
        >
          + Thêm dự án
        </Button>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left p-3">Mã DA / Dự án</th>
              <th className="text-left p-3">Đối tác (hợp đồng)</th>
              <th className="text-left p-3">Biểu PMG (CĐT → BRE)</th>
              <th className="text-right p-3">%PMG_sale</th>
              <th className="text-right p-3">Phí admin</th>
              <th className="text-right p-3">CĐT thưởng sale</th>
              <th className="text-left p-3">Vai trò</th>
              <th className="text-right p-3">BRE bán / Tổng</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {primaryProjects.map((p) => {
              const projContracts = contractsByProject.get(p.id) ?? [];
              const bre = breCountMap.get(p.id) ?? 0;
              const total = p.totalUnits ?? 0;

              if (projContracts.length === 0) {
                // Project chưa có contract
                return (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-mono text-xs text-slate-500">{p.fullCode}</div>
                      <div className="font-medium">{p.name}</div>
                    </td>
                    <td className="p-3 text-slate-500">
                      {displayPartnerName(p.partnerName) || <span className="text-slate-300">—</span>}
                    </td>
                    <td colSpan={4} className="p-3 text-center text-slate-400 text-xs italic">
                      Chưa có hợp đồng — chạy <code>npx tsx scripts/import-contracts.ts</code> nếu chưa import
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded-md ${p.breRole === "f1" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                        {p.breRole === "f1" ? "BRE = F1" : "BRE = F2"}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums text-xs">
                      {total > 0 ? `${bre}/${total}` : bre > 0 ? `${bre}/?` : "—"}
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/projects/${p.id}`} className="text-blue-600 hover:underline text-sm">Sửa</Link>
                    </td>
                  </tr>
                );
              }

              // 1 project = N contracts → hiện N rows nested
              return projContracts.map((c, idx) => (
                <tr key={`${p.id}-${c.id}`} className={`border-t ${idx === 0 ? "border-slate-300" : "border-slate-100"} hover:bg-slate-50`}>
                  <td className="p-3">
                    {idx === 0 && (
                      <>
                        <div className="font-mono text-xs text-slate-500">{p.fullCode}</div>
                        <div className="font-medium">{p.name}</div>
                      </>
                    )}
                  </td>
                  <td className="p-3 text-slate-700">
                    <div className="font-medium text-sm">{c.partnerName}</div>
                    {c.contractNumber && (
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs" title={c.contractNumber}>
                        {c.contractNumber.slice(0, 50)}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {Array.isArray(c.pmgTiers) && c.pmgTiers.length > 0 ? (
                      <div className="space-y-0.5">
                        {c.pmgTiers.map((t: any, ti: number) => {
                          const metric = c.pmgMetric === "percent" ? "% giỏ" : "căn";
                          const range = t.max == null
                            ? (c.pmgMetric === "percent" ? `Y ≥ ${(t.min * 100).toFixed(0)}%` : `X ≥ ${t.min}`)
                            : (c.pmgMetric === "percent" ? `${(t.min * 100).toFixed(0)}%-${(t.max * 100).toFixed(0)}%` : `${t.min}-${t.max}`);
                          return (
                            <div key={ti} className="flex items-center gap-1.5 tabular-nums">
                              <span className="text-slate-500 min-w-16">{range}</span>
                              <span className="font-semibold text-slate-700">{fmtPct(t.rate)}</span>
                              {t.saleCap != null && (
                                <span className="text-[9px] text-orange-600">sale ≤ {fmtPct(t.saleCap)}</span>
                              )}
                            </div>
                          );
                        })}
                        {c.pmgRetroactive && <div className="text-[10px] text-blue-600 italic">↺ hồi tố</div>}
                        {c.pmgNotes && <div className="text-[10px] text-slate-500 italic">{c.pmgNotes}</div>}
                      </div>
                    ) : c.pmgLk != null ? (
                      <span className="tabular-nums">{fmtPct(c.pmgLk)} <span className="text-[10px] text-slate-400">(phẳng)</span></span>
                    ) : c.pmgStructure ? (
                      <span className="text-[10px] text-amber-600 italic" title={c.pmgStructure}>
                        Biểu phức tạp — chưa parse. Xem raw
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {c.pmgLkSale != null ? fmtPct(c.pmgLkSale) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {c.adminFee != null && c.adminFee > 0 ? fmtMoney(c.adminFee) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums text-xs">
                    {c.cdtBonusSale != null && c.cdtBonusSale > 0 ? fmtMoney(c.cdtBonusSale) : <span className="text-slate-300">—</span>}
                  </td>
                  {idx === 0 && (
                    <>
                      <td className="p-3" rowSpan={projContracts.length}>
                        <span className={`text-xs px-2 py-1 rounded-md ${p.breRole === "f1" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                          {p.breRole === "f1" ? "BRE = F1" : "BRE = F2"}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs" rowSpan={projContracts.length}>
                        {total > 0 ? (
                          <span>{bre} / {total} <span className="text-slate-400">({fmtPctRaw((bre / total) * 100, 1)})</span></span>
                        ) : bre > 0 ? `${bre}/?` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="p-3 text-right" rowSpan={projContracts.length}>
                        <Link href={`/projects/${p.id}`} className="text-blue-600 hover:underline text-sm">Sửa</Link>
                      </td>
                    </>
                  )}
                </tr>
              ));
            })}
            {primaryProjects.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có dự án sơ cấp nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {orphanContracts.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <div className="font-semibold text-amber-900 mb-2">
            ⚠️ {orphanContracts.length} hợp đồng chưa link được dự án
          </div>
          <div className="text-xs text-amber-800 mb-2">
            Dự án hoặc CĐT chưa có trong DB. Cần tạo trước rồi import lại contracts.
          </div>
          <table className="w-full text-xs">
            <tbody>
              {orphanContracts.map((c) => (
                <tr key={c.id} className="border-t border-amber-200">
                  <td className="p-1 font-mono">{c.projectCode}</td>
                  <td className="p-1">{c.partnerName}</td>
                  <td className="p-1 text-slate-600">{c.contractNumber?.slice(0, 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
