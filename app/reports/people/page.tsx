import { redirect } from "next/navigation";
import { fmtMoney, fmtPctRaw } from "@/lib/format";
import { hasReportsAccess } from "@/lib/auth";
import { loadReportData, parseFilters } from "@/lib/reports";
import { ReportsHeader } from "../_shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

export default async function ReportsPeoplePage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await hasReportsAccess())) redirect("/");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const data = await loadReportData(filters);
  const { grandTotals, prodRows, filterLabel, yearOptions } = data;

  // Theo phòng
  const byDept = new Map<string, { name: string; numProducts: number; totalRevenue: number; totalCost: number }>();
  for (const p of prodRows) {
    const key = p.departmentName ?? "(Chưa phân phòng)";
    if (!byDept.has(key))
      byDept.set(key, { name: key, numProducts: 0, totalRevenue: 0, totalCost: 0 });
    const agg = byDept.get(key)!;
    agg.numProducts++;
    agg.totalRevenue += Number(p.totalRevenue ?? 0);
    agg.totalCost += Number(p.totalCost ?? 0);
  }
  const deptSorted = Array.from(byDept.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Top NVKD
  const byNvkd = new Map<string, { name: string; numProducts: number; totalRevenue: number }>();
  for (const p of prodRows) {
    const key = p.salesPerson?.trim() || "(Chưa có NVKD)";
    if (!byNvkd.has(key)) byNvkd.set(key, { name: key, numProducts: 0, totalRevenue: 0 });
    const agg = byNvkd.get(key)!;
    agg.numProducts++;
    agg.totalRevenue += Number(p.totalRevenue ?? 0);
  }
  const nvkdSorted = Array.from(byNvkd.values())
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 15);

  return (
    <div className="space-y-6">
      <ReportsHeader
        activePath="/reports/people"
        filters={filters}
        yearOptions={yearOptions}
        filterLabel={filterLabel}
        totalProducts={grandTotals.products}
      />

      <div>
        <h2 className="text-lg font-semibold mb-3">Theo phòng — {filterLabel}</h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Phòng</th>
                <th className="text-center p-2">Số căn</th>
                <th className="text-right p-2">Tổng DT</th>
                <th className="text-right p-2">Giá vốn</th>
                <th className="text-right p-2">Lãi gộp (không VAT)</th>
                <th className="text-right p-2">% trên tổng</th>
              </tr>
            </thead>
            <tbody>
              {deptSorted.map((d) => {
                const profit = d.totalRevenue / 1.1 - d.totalCost;
                const pct = grandTotals.revenueExp ? (d.totalRevenue / grandTotals.revenueExp) * 100 : 0;
                return (
                  <tr key={d.name} className="border-t border-slate-100">
                    <td className="p-2 font-medium">{d.name}</td>
                    <td className="p-2 text-center">{d.numProducts}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(d.totalRevenue)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(d.totalCost)}</td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${
                        profit >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {fmtMoney(profit)}
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmtPctRaw(pct, 1)}</td>
                  </tr>
                );
              })}
              {deptSorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    Không có dữ liệu trong khoảng đã chọn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Top NVKD theo doanh thu — {filterLabel}</h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Hạng</th>
                <th className="text-left p-2">NVKD</th>
                <th className="text-center p-2">Số căn</th>
                <th className="text-right p-2">Tổng DT (gồm VAT)</th>
              </tr>
            </thead>
            <tbody>
              {nvkdSorted.map((n, i) => (
                <tr key={n.name} className="border-t border-slate-100">
                  <td className="p-2 text-xs">#{i + 1}</td>
                  <td className="p-2 font-medium">{n.name}</td>
                  <td className="p-2 text-center">{n.numProducts}</td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(n.totalRevenue)}</td>
                </tr>
              ))}
              {nvkdSorted.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-500">
                    Không có dữ liệu trong khoảng đã chọn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
