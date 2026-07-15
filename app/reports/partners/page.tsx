import { redirect } from "next/navigation";
import { fmtMoney, fmtPctRaw } from "@/lib/format";
import { hasReportsAccess } from "@/lib/auth";
import { loadReportData, parseFilters } from "@/lib/reports";
import { ReportsHeader } from "../_shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

export default async function ReportsPartnersPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await hasReportsAccess())) redirect("/");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const data = await loadReportData(filters);
  const { grandTotals, aggregatedProjects, revReconsAll, filterLabel, yearOptions } = data;

  // Gộp theo partner (dùng partnerName vì aggregatedProjects đã có sẵn)
  type PartnerAgg = {
    name: string;
    numProjects: number;
    numProducts: number;
    totalRevenue: number;
    totalCost: number;
    numRecons: number;
    reconWithPayment: number;
    totalDaysToPay: number;
    reconWithPaymentCount: number;
  };
  const byPartner = new Map<string, PartnerAgg>();

  for (const p of aggregatedProjects) {
    const key = p.partnerName ?? "(chưa gán)";
    if (!byPartner.has(key)) {
      byPartner.set(key, {
        name: key,
        numProjects: 0,
        numProducts: 0,
        totalRevenue: 0,
        totalCost: 0,
        numRecons: 0,
        reconWithPayment: 0,
        totalDaysToPay: 0,
        reconWithPaymentCount: 0,
      });
    }
    const agg = byPartner.get(key)!;
    agg.numProjects++;
    agg.numProducts += p.numProducts;
    agg.totalRevenue += p.totalRevenueExpected;
    agg.totalCost += p.totalCostExpected;
  }

  // Compute payment speed: with revReconsAll, tính (paymentDate − reconDate) TB.
  // Không có paymentDate riêng cho từng payment; xài heuristic: recon nào paid full → tính từ reconDate → hôm nay (upper bound).
  // Better: cần join thêm payments_in. Skip cho MVP, chỉ hiển thị "% đã thu" thay thế.
  for (const r of revReconsAll) {
    const key = r.partnerName ?? "(chưa gán)";
    const agg = byPartner.get(key);
    if (!agg) continue;
    agg.numRecons++;
    if (r.paid >= r.receivable - 0.5 && r.receivable > 0) {
      agg.reconWithPayment++;
    }
  }

  const rows = [...byPartner.values()].map((p) => {
    const rev = p.totalRevenue / 1.1;
    const profit = rev - p.totalCost;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;
    const collectionRate = p.numRecons > 0 ? (p.reconWithPayment / p.numRecons) * 100 : 0;
    return { ...p, rev, profit, margin, collectionRate };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const maxRevenue = rows[0]?.totalRevenue ?? 1;

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
          Sắp xếp theo doanh thu mang lại. Biên LN cho biết partner nào ăn dày; % đã thu = số đợt đã thu đủ / tổng đợt ĐC.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Đối tác</th>
                <th className="text-center p-2">DA</th>
                <th className="text-center p-2">Căn</th>
                <th className="text-right p-2 w-56">DT mang lại</th>
                <th className="text-right p-2">Lãi gộp</th>
                <th className="text-right p-2">Biên</th>
                <th className="text-right p-2">Đợt ĐC</th>
                <th className="text-right p-2">% đã thu đủ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = maxRevenue > 0 ? (r.totalRevenue / maxRevenue) * 100 : 0;
                const marginColor = r.margin >= 15 ? "text-green-700" : r.margin >= 5 ? "text-slate-700" : "text-red-700";
                const collColor = r.collectionRate >= 80 ? "text-green-700" : r.collectionRate >= 50 ? "text-orange-700" : "text-red-700";
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
                        <div className="text-right tabular-nums text-xs font-medium w-32">
                          {fmtMoney(r.totalRevenue)}
                        </div>
                      </div>
                    </td>
                    <td
                      className={`p-2 text-right tabular-nums text-xs font-medium ${
                        r.profit >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {fmtMoney(r.profit)}
                    </td>
                    <td className={`p-2 text-right tabular-nums font-semibold ${marginColor}`}>
                      {fmtPctRaw(r.margin, 1)}
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs">{r.numRecons}</td>
                    <td className={`p-2 text-right tabular-nums font-medium ${collColor}`}>
                      {r.numRecons > 0 ? fmtPctRaw(r.collectionRate, 0) : "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-500">
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
