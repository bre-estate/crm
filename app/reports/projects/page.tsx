import { redirect } from "next/navigation";
import { fmtMoney, fmtPctRaw, displayPartnerName, isSecondaryPartner } from "@/lib/format";
import { hasReportsAccess } from "@/lib/auth";
import { loadReportData, parseFilters, effectiveYM } from "@/lib/reports";
import { ReportsHeader } from "../_shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

export default async function ReportsProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await hasReportsAccess())) redirect("/");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const data = await loadReportData(filters);
  const {
    grandTotals,
    profitExpected,
    profitRealized,
    filterLabel,
    yearOptions,
    aggregatedProjects,
    prodRows,
  } = data;

  // Chart C data: absorption
  type Absorption = {
    projectId: number;
    code: string;
    name: string;
    partnerName: string | null;
    units: number;
    firstMonth: string | null;
    lastMonth: string | null;
    monthsActive: number;
    perMonth: number;
  };
  const byProj = new Map<number, { units: number; months: Set<string> }>();
  for (const p of prodRows) {
    const ym = effectiveYM(null, p.depositDate);
    if (!ym) continue;
    const key = p.projectId;
    if (!byProj.has(key)) byProj.set(key, { units: 0, months: new Set() });
    const a = byProj.get(key)!;
    a.units++;
    a.months.add(`${ym.y}-${String(ym.mo).padStart(2, "0")}`);
  }
  const absRows: Absorption[] = [];
  for (const [pjId, d] of byProj) {
    const proj = aggregatedProjects.find((p) => p.id === pjId);
    if (!proj) continue;
    const sortedMonths = [...d.months].sort();
    const first = sortedMonths[0];
    const last = sortedMonths[sortedMonths.length - 1];
    const [fy, fm] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);
    const span = (ly - fy) * 12 + (lm - fm) + 1;
    absRows.push({
      projectId: pjId,
      code: proj.code,
      name: proj.name,
      partnerName: proj.partnerName,
      units: d.units,
      firstMonth: first,
      lastMonth: last,
      monthsActive: span,
      perMonth: span > 0 ? d.units / span : d.units,
    });
  }
  absRows.sort((a, b) => b.perMonth - a.perMonth);
  const maxPerMonth = absRows[0]?.perMonth ?? 1;

  // Chart E data: margin comparison
  const marginRows = aggregatedProjects
    .map((p) => {
      const rev = p.totalRevenueExpected / 1.1;
      const profit = rev - p.totalCostExpected;
      const margin = rev > 0 ? (profit / rev) * 100 : 0;
      return { ...p, rev, profit, margin };
    })
    .sort((a, b) => b.margin - a.margin);
  const maxAbsMargin = Math.max(...marginRows.map((r) => Math.abs(r.margin)), 1);

  return (
    <div className="space-y-6">
      <ReportsHeader
        activePath="/reports/projects"
        filters={filters}
        yearOptions={yearOptions}
        filterLabel={filterLabel}
        totalProducts={grandTotals.products}
      />

      {/* Bảng chi tiết theo dự án */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Chi tiết theo dự án — {filterLabel}</h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Mã DA</th>
                <th className="text-left p-2">Dự án / Đối tác</th>
                <th className="text-center p-2">Vai trò</th>
                <th className="text-center p-2">Số căn</th>
                <th className="text-right p-2">DT dự kiến</th>
                <th className="text-right p-2">GV dự kiến</th>
                <th className="text-right p-2">Lãi dự kiến</th>
                <th className="text-right p-2">DT đã ĐC</th>
                <th className="text-right p-2">GV đã ĐC</th>
                <th className="text-right p-2">Lãi thực (đã ĐC)</th>
              </tr>
            </thead>
            <tbody>
              {aggregatedProjects.map((p) => {
                const profitExp = p.totalRevenueExpected / 1.1 - p.totalCostExpected;
                const profitRec = p.totalRevReconciled / 1.1 - p.totalCostReconciled;
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="p-2 font-mono text-xs">{p.code}</td>
                    <td className="p-2">
                      <div className="text-xs font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{displayPartnerName(p.partnerName)}</div>
                    </td>
                    <td className="p-2 text-center">
                      {isSecondaryPartner(p.partnerName) ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">Thứ cấp</span>
                      ) : (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            p.breRole === "f1"
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {p.breRole === "f1" ? "F1" : "F2"}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center">{p.numProducts}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(p.totalRevenueExpected)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(p.totalCostExpected)}</td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${
                        profitExp >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {fmtMoney(profitExp)}
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(p.totalRevReconciled)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(p.totalCostReconciled)}</td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${
                        profitRec >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {fmtMoney(profitRec)}
                    </td>
                  </tr>
                );
              })}
              {aggregatedProjects.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-slate-500">
                    Không có dự án nào có căn trong khoảng đã chọn.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
              <tr className="font-bold">
                <td colSpan={3} className="p-2">
                  Tổng cộng
                </td>
                <td className="p-2 text-center">{grandTotals.products}</td>
                <td className="p-2 text-right tabular-nums">{fmtMoney(grandTotals.revenueExp)}</td>
                <td className="p-2 text-right tabular-nums">{fmtMoney(grandTotals.costExp)}</td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    profitExpected >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {fmtMoney(profitExpected)}
                </td>
                <td className="p-2 text-right tabular-nums">{fmtMoney(grandTotals.revRec)}</td>
                <td className="p-2 text-right tabular-nums">{fmtMoney(grandTotals.costRec)}</td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    profitRealized >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {fmtMoney(profitRealized)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Chart C: Absorption */}
      <div>
        <h3 className="text-base font-semibold mb-2">Tốc độ hấp thụ (căn / tháng)</h3>
        <p className="text-xs text-slate-500 mb-3">
          Số căn bán được / tháng, tính từ tháng đầu → tháng cuối có căn của dự án đó. Xếp cao xuống thấp trong khoảng đã chọn.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Dự án</th>
                <th className="text-center p-2">Từ → Đến</th>
                <th className="text-center p-2">Số căn</th>
                <th className="text-center p-2">Số tháng</th>
                <th className="text-right p-2 w-64">Căn / tháng</th>
              </tr>
            </thead>
            <tbody>
              {absRows.map((r) => {
                const pct = maxPerMonth > 0 ? (r.perMonth / maxPerMonth) * 100 : 0;
                return (
                  <tr key={r.projectId} className="border-t border-slate-100">
                    <td className="p-2">
                      <div className="font-medium text-xs">{r.name}</div>
                      <div className="text-xs text-slate-500">{displayPartnerName(r.partnerName)}</div>
                    </td>
                    <td className="p-2 text-center text-xs font-mono">
                      {r.firstMonth} → {r.lastMonth}
                    </td>
                    <td className="p-2 text-center tabular-nums">{r.units}</td>
                    <td className="p-2 text-center tabular-nums">{r.monthsActive}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-right tabular-nums font-semibold w-16">
                          {r.perMonth.toFixed(2)}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {absRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-500">
                    Không có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart E: Margin */}
      <div>
        <h3 className="text-base font-semibold mb-2">Biên lợi nhuận so sánh giữa dự án</h3>
        <p className="text-xs text-slate-500 mb-3">
          Lãi gộp (không VAT) / Doanh thu không VAT. Cao là ăn dày, thấp/âm là ăn mỏng hoặc lỗ.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Dự án</th>
                <th className="text-center p-2">Số căn</th>
                <th className="text-right p-2">DT (không VAT)</th>
                <th className="text-right p-2">Lãi gộp</th>
                <th className="text-right p-2 w-64">Biên</th>
              </tr>
            </thead>
            <tbody>
              {marginRows.map((r) => {
                const pct = (Math.abs(r.margin) / maxAbsMargin) * 100;
                const positive = r.margin >= 0;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="p-2">
                      <div className="font-medium text-xs">{r.name}</div>
                      <div className="text-xs text-slate-500">{displayPartnerName(r.partnerName)}</div>
                    </td>
                    <td className="p-2 text-center tabular-nums">{r.numProducts}</td>
                    <td className="p-2 text-right tabular-nums text-xs">{fmtMoney(r.rev)}</td>
                    <td
                      className={`p-2 text-right tabular-nums font-medium text-xs ${
                        positive ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {fmtMoney(r.profit)}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden">
                          <div
                            className={`h-full ${positive ? "bg-green-500" : "bg-red-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div
                          className={`text-right tabular-nums font-semibold w-16 ${
                            positive ? "text-green-700" : "text-red-700"
                          }`}
                        >
                          {fmtPctRaw(r.margin, 1)}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {marginRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-500">
                    Không có dữ liệu.
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
