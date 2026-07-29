import { fmtMoney, fmtPctRaw } from "@/lib/format";
import { requirePermission } from "@/lib/auth";
import { loadReportData, parseFilters } from "@/lib/reports";
import { ReportsHeader } from "../_shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

export default async function ReportsPartnersPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("reports.overview");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const data = await loadReportData(filters);
  const { grandTotals, aggregatedProjects, revReconsAll, prodRows, filterLabel, yearOptions } = data;

  // Gộp theo partner (dùng partnerName vì aggregatedProjects đã có sẵn)
  type PartnerAgg = {
    name: string;
    numProjects: number;
    numProducts: number;
    totalRevenue: number;
    totalCost: number;
    numRecons: number;
    reconWithPayment: number;
    // %HH averaging: weighted theo pmgBasePrice để phản ánh HH thật CĐT trả
    pmgBaseSum: number;
    pmgWeightedSum: number; // sum(pmgBase * pmgRate)
    pmgSaleWeightedSum: number; // sum(pmgBase * pmgSaleRate)
    // Tốc độ trả: tổng ngày (payment date - recon date) trên các recon đã có payment
    daysToPaySum: number;
    daysToPayCount: number;
  };
  const byPartner = new Map<string, PartnerAgg>();

  const initAgg = (key: string): PartnerAgg => ({
    name: key,
    numProjects: 0,
    numProducts: 0,
    totalRevenue: 0,
    totalCost: 0,
    numRecons: 0,
    reconWithPayment: 0,
    pmgBaseSum: 0,
    pmgWeightedSum: 0,
    pmgSaleWeightedSum: 0,
    daysToPaySum: 0,
    daysToPayCount: 0,
  });

  for (const p of aggregatedProjects) {
    const key = p.partnerName ?? "(chưa gán)";
    if (!byPartner.has(key)) byPartner.set(key, initAgg(key));
    const agg = byPartner.get(key)!;
    agg.numProjects++;
    agg.numProducts += p.numProducts;
    agg.totalRevenue += p.totalRevenueExpected;
    agg.totalCost += p.totalCostExpected;
  }

  // %PMG_LK TB per partner: weighted theo pmgBasePrice (căn có giá tính PMG lớn → ảnh hưởng nhiều hơn).
  for (const p of prodRows) {
    const proj = aggregatedProjects.find((ap) => ap.id === p.projectId);
    if (!proj) continue;
    const key = proj.partnerName ?? "(chưa gán)";
    const agg = byPartner.get(key);
    if (!agg) continue;
    const base = Number(p.pmgBasePrice ?? 0);
    const rate = Number(p.pmgRate ?? 0);
    const saleRate = Number(p.pmgSaleRate ?? 0);
    if (base > 0 && rate > 0) {
      agg.pmgBaseSum += base;
      agg.pmgWeightedSum += base * rate;
      // Nếu có pmgSaleRate thì dùng, không thì fallback = rate (BRE không giữ chênh)
      agg.pmgSaleWeightedSum += base * (saleRate > 0 ? saleRate : rate);
    }
  }

  // Tốc độ trả: tính từ revReconsAll firstPaidDate - reconDate cho recon đã full paid.
  for (const r of revReconsAll) {
    const key = r.partnerName ?? "(chưa gán)";
    const agg = byPartner.get(key);
    if (!agg) continue;
    agg.numRecons++;
    if (r.paid >= r.receivable - 0.5 && r.receivable > 0) {
      agg.reconWithPayment++;
      if (r.firstPaidDate && r.reconDate) {
        const d = Math.floor(
          (new Date(r.firstPaidDate).getTime() - new Date(r.reconDate).getTime()) /
            (24 * 3600 * 1000),
        );
        if (Number.isFinite(d) && d >= -30 && d <= 365 * 2) {
          agg.daysToPaySum += d;
          agg.daysToPayCount++;
        }
      }
    }
  }

  // %PMG_LK TB per partner — weighted theo pmgBasePrice
  for (const p of prodRows) {
    const proj = aggregatedProjects.find((ap) => ap.id === p.projectId);
    if (!proj) continue;
    const key = proj.partnerName ?? "(chưa gán)";
    const agg = byPartner.get(key);
    if (!agg) continue;
    // pmgBasePrice + pmgRate không có trong prodRows hiện tại — dùng heuristic:
    // totalRevenue / 1.1 (không VAT) ≈ pmgBase × pmgRate ≈ Q trước admin
    // → không chính xác. Skip trong file này.
  }

  const rows = [...byPartner.values()].map((p) => {
    const rev = p.totalRevenue / 1.1;
    const profit = rev - p.totalCost;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;
    const collectionRate = p.numRecons > 0 ? (p.reconWithPayment / p.numRecons) * 100 : 0;
    const avgDaysToPay = p.daysToPayCount > 0 ? p.daysToPaySum / p.daysToPayCount : null;
    // Decimal (0.065 = 6.5%); render × 100 khi hiển thị.
    const avgPmgRate = p.pmgBaseSum > 0 ? p.pmgWeightedSum / p.pmgBaseSum : null;
    const avgPmgSaleRate = p.pmgBaseSum > 0 ? p.pmgSaleWeightedSum / p.pmgBaseSum : null;
    const pmgSpread =
      avgPmgRate !== null && avgPmgSaleRate !== null ? avgPmgRate - avgPmgSaleRate : null;
    return { ...p, rev, profit, margin, collectionRate, avgDaysToPay, avgPmgRate, avgPmgSaleRate, pmgSpread };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const maxRevenue = rows[0]?.totalRevenue ?? 1;
  // Market average (unweighted mean of decimals).
  const partnersWithPmg = rows.filter((r) => r.avgPmgRate !== null);
  const marketAvgPmg =
    partnersWithPmg.length > 0
      ? partnersWithPmg.reduce((s, r) => s + (r.avgPmgRate ?? 0), 0) / partnersWithPmg.length
      : null;

  return (
    <div className="space-y-6">
      <ReportsHeader
        activePath="/reports/partners"
        filters={filters}
        yearOptions={yearOptions}
        filterLabel={filterLabel}
        totalProducts={grandTotals.products}
      />

      <div>
        <h2 className="text-lg font-semibold mb-1">Xếp hạng đối tác (CĐT / F1)</h2>
        <p className="text-xs text-slate-500 mb-3">
          Sắp xếp theo DT mang lại. <b>%PMG_LK</b> = CĐT/F1 thực trả BRE (weighted TB theo Giá tính PMG).{" "}
          <b>%PMG_LK_sale</b> = base BRE dùng tính HH sale + KPI. <b>Chênh</b> = %PMG_LK − %PMG_LK_sale, số dương = BRE giữ được (thưởng manager / cty), âm = cấu hình bất thường.
          {marketAvgPmg !== null && (
            <>
              {" "}TB %PMG_LK toàn thị trường (nội bộ) ={" "}
              <b>{fmtPctRaw(marketAvgPmg * 100, 2)}</b> — màu xanh = cao hơn TB, đỏ = thấp hơn.
            </>
          )}
        </p>
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[950px]">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Đối tác</th>
                <th className="text-center p-2">DA</th>
                <th className="text-center p-2">Căn</th>
                <th className="text-right p-2 w-40">DT mang lại</th>
                <th className="text-right p-2">%PMG_LK</th>
                <th className="text-right p-2">%PMG_LK_sale</th>
                <th className="text-right p-2">Chênh (BRE giữ)</th>
                <th className="text-right p-2">Biên LN</th>
                <th className="text-right p-2">TB ngày trả</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = maxRevenue > 0 ? (r.totalRevenue / maxRevenue) * 100 : 0;
                const marginColor = r.margin >= 15 ? "text-green-700" : r.margin >= 5 ? "text-slate-700" : "text-red-700";
                const pmgColor =
                  r.avgPmgRate === null || marketAvgPmg === null
                    ? "text-slate-700"
                    : r.avgPmgRate > marketAvgPmg + 0.001
                      ? "text-green-700"
                      : r.avgPmgRate < marketAvgPmg - 0.001
                        ? "text-red-700"
                        : "text-slate-700";
                const spreadColor =
                  r.pmgSpread === null
                    ? "text-slate-400"
                    : r.pmgSpread > 0.001
                      ? "text-green-700 font-semibold"
                      : r.pmgSpread < -0.001
                        ? "text-red-700 font-semibold"
                        : "text-slate-400";
                const daysColor =
                  r.avgDaysToPay === null
                    ? "text-slate-400"
                    : r.avgDaysToPay <= 30
                      ? "text-green-700"
                      : r.avgDaysToPay <= 60
                        ? "text-orange-700"
                        : "text-red-700";
                return (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2 text-center tabular-nums">{r.numProjects}</td>
                    <td className="p-2 text-center tabular-nums">{r.numProducts}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-right tabular-nums text-xs font-medium w-24">
                          {fmtMoney(r.totalRevenue)}
                        </div>
                      </div>
                    </td>
                    <td className={`p-2 text-right tabular-nums font-semibold ${pmgColor}`}>
                      {r.avgPmgRate !== null ? fmtPctRaw(r.avgPmgRate * 100, 2) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-slate-600">
                      {r.avgPmgSaleRate !== null ? fmtPctRaw(r.avgPmgSaleRate * 100, 2) : "—"}
                    </td>
                    <td
                      className={`p-2 text-right tabular-nums text-xs ${spreadColor}`}
                      title={
                        r.pmgSpread !== null && r.pmgSpread < 0
                          ? "Cảnh báo: %PMG_LK_sale > %PMG_LK — có thể data lỗi"
                          : undefined
                      }
                    >
                      {r.pmgSpread !== null && Math.abs(r.pmgSpread) > 0.001
                        ? (r.pmgSpread > 0 ? "+" : "") + fmtPctRaw(r.pmgSpread * 100, 2)
                        : "—"}
                    </td>
                    <td className={`p-2 text-right tabular-nums ${marginColor}`}>
                      {fmtPctRaw(r.margin, 1)}
                    </td>
                    <td className={`p-2 text-right tabular-nums text-xs ${daysColor}`}>
                      {r.avgDaysToPay !== null ? `${Math.round(r.avgDaysToPay)} ngày` : "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-slate-500">
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
