import { redirect } from "next/navigation";
import { fmtMoney } from "@/lib/format";
import { hasReportsAccess } from "@/lib/auth";
import { loadReportData, parseFilters, effectiveYM } from "@/lib/reports";
import { ReportsHeader } from "../_shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

export default async function ReportsTimePage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await hasReportsAccess())) redirect("/");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const data = await loadReportData(filters);
  const { grandTotals, prodRows, prodRowsAll, filterLabel, yearOptions } = data;

  // DT ghi nhận tại thời điểm cọc → group theo tháng của deposit_date.
  const byMonth = new Map<
    string,
    { month: string; numProducts: number; totalRevenue: number }
  >();
  for (const p of prodRows) {
    const ym = effectiveYM(null, p.depositDate);
    const key = ym ? `${ym.y}-${String(ym.mo).padStart(2, "0")}` : "(chưa có ngày cọc)";
    if (!byMonth.has(key))
      byMonth.set(key, { month: key, numProducts: 0, totalRevenue: 0 });
    const agg = byMonth.get(key)!;
    agg.numProducts++;
    agg.totalRevenue += Number(p.totalRevenue ?? 0);
  }
  const monthSorted = Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month));

  // Seasonal (cross-year — dùng prodRowsAll để không bị filter năm ảnh hưởng)
  const monthNames = ["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12"];
  const buckets = Array.from({ length: 12 }, () => ({ units: 0, revenue: 0 }));
  for (const p of prodRowsAll) {
    const ym = effectiveYM(null, p.depositDate);
    if (!ym) continue;
    buckets[ym.mo - 1].units++;
    buckets[ym.mo - 1].revenue += Number(p.totalRevenue ?? 0);
  }
  const maxUnits = Math.max(...buckets.map((b) => b.units), 1);
  const totalUnits = buckets.reduce((s, b) => s + b.units, 0);

  return (
    <div className="space-y-6">
      <ReportsHeader
        activePath="/reports/time"
        filters={filters}
        yearOptions={yearOptions}
        filterLabel={filterLabel}
        totalProducts={grandTotals.products}
      />

      <div>
        <h2 className="text-lg font-semibold mb-1">Ghi nhận DT theo tháng — {filterLabel}</h2>
        <p className="text-xs text-slate-500 mb-3">
          DT ghi nhận tại thời điểm cọc → group theo tháng của ngày cọc.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Tháng</th>
                <th className="text-center p-2">Số căn</th>
                <th className="text-right p-2">Tổng DT</th>
              </tr>
            </thead>
            <tbody>
              {monthSorted.map((m) => (
                <tr key={m.month} className="border-t border-slate-100">
                  <td className="p-2 font-mono text-sm">{m.month}</td>
                  <td className="p-2 text-center">{m.numProducts}</td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(m.totalRevenue)}</td>
                </tr>
              ))}
              {monthSorted.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-slate-500">
                    Không có dữ liệu trong khoảng đã chọn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Mùa vụ — căn bán theo tháng (gộp mọi năm)</h2>
        <p className="text-xs text-slate-500 mb-3">
          Gộp tất cả năm để thấy pattern theo mùa. Không bị filter năm/quý ảnh hưởng.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="space-y-2">
            {buckets.map((b, i) => {
              const pct = maxUnits > 0 ? (b.units / maxUnits) * 100 : 0;
              const share = totalUnits > 0 ? (b.units / totalUnits) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-10 text-xs text-slate-600 font-medium">{monthNames[i]}</div>
                  <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-purple-500 flex items-center justify-end pr-2 text-white text-xs font-medium"
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    >
                      {b.units > 0 && b.units}
                    </div>
                  </div>
                  <div className="w-16 text-right text-xs text-slate-500 tabular-nums">
                    {share.toFixed(1)}%
                  </div>
                  <div className="w-32 text-right text-xs text-slate-500 tabular-nums">
                    {fmtMoney(b.revenue)}
                  </div>
                </div>
              );
            })}
          </div>
          {totalUnits === 0 && (
            <div className="p-4 text-center text-slate-500 text-sm">Không có dữ liệu.</div>
          )}
        </div>
      </div>
    </div>
  );
}
