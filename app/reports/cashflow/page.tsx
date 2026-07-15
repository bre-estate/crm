import { redirect } from "next/navigation";
import { fmtMoney, fmtPctRaw, displayPartnerName } from "@/lib/format";
import { hasReportsAccess } from "@/lib/auth";
import { getOwnerEmail } from "@/lib/auth";
import { loadReportData, parseFilters } from "@/lib/reports";
import { Card, ReportsHeader } from "../_shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

// Chỉ owner mới xem được page này vì có info nhạy cảm (công nợ, risk).
export default async function ReportsCashflowPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await hasReportsAccess())) redirect("/");
  if (!(await getOwnerEmail())) redirect("/reports/overview");

  const sp = await searchParams;
  const filters = parseFilters(sp);
  const data = await loadReportData(filters);
  const { grandTotals, filterLabel, yearOptions, revReconsAll, costReconsAll, prodRowsAll, partnerNames } = data;

  const TODAY = new Date();
  const daysBetween = (d: string | null): number => {
    if (!d) return 0;
    const t = new Date(d);
    if (isNaN(t.getTime())) return 0;
    return Math.floor((TODAY.getTime() - t.getTime()) / (24 * 3600 * 1000));
  };

  // ===== Aging: outstanding recon (chưa thu / chưa trả) =====
  type Aging = { b0: number; b30: number; b60: number; b90: number };
  const emptyAging = (): Aging => ({ b0: 0, b30: 0, b60: 0, b90: 0 });
  const bucketAdd = (a: Aging, amount: number, days: number) => {
    if (days <= 30) a.b0 += amount;
    else if (days <= 60) a.b30 += amount;
    else if (days <= 90) a.b60 += amount;
    else a.b90 += amount;
  };

  // Công nợ THU (CĐT/F1 nợ BRE)
  const arAging = emptyAging();
  let arCount = 0;
  const arRecons = revReconsAll
    .filter((r) => r.receivable - r.paid > 0.5)
    .map((r) => ({ ...r, outstanding: r.receivable - r.paid, days: daysBetween(r.reconDate) }))
    .sort((a, b) => b.outstanding - a.outstanding);
  for (const r of arRecons) {
    bucketAdd(arAging, r.outstanding, r.days);
    arCount++;
  }
  const arTotal = arAging.b0 + arAging.b30 + arAging.b60 + arAging.b90;

  // Aging per partner — thấy CĐT nào chây lì
  type PartnerAging = {
    name: string;
    b0: number;
    b30: number;
    b60: number;
    b90: number;
    total: number;
    count: number;
    maxDays: number;
  };
  const agingByPartner = new Map<string, PartnerAging>();
  for (const r of arRecons) {
    const key = r.partnerName ?? "(chưa gán)";
    if (!agingByPartner.has(key)) {
      agingByPartner.set(key, {
        name: key,
        b0: 0,
        b30: 0,
        b60: 0,
        b90: 0,
        total: 0,
        count: 0,
        maxDays: 0,
      });
    }
    const a = agingByPartner.get(key)!;
    if (r.days <= 30) a.b0 += r.outstanding;
    else if (r.days <= 60) a.b30 += r.outstanding;
    else if (r.days <= 90) a.b60 += r.outstanding;
    else a.b90 += r.outstanding;
    a.total += r.outstanding;
    a.count++;
    if (r.days > a.maxDays) a.maxDays = r.days;
  }
  // Sort: partner nào có nhiều tiền chậm (>30 ngày) trước, rồi theo tổng
  const partnerAgingRows = [...agingByPartner.values()].sort((a, b) => {
    const aOverdue = a.b30 + a.b60 + a.b90;
    const bOverdue = b.b30 + b.b60 + b.b90;
    if (bOverdue !== aOverdue) return bOverdue - aOverdue;
    return b.total - a.total;
  });

  // Tốc độ trả CĐT: TB ngày (payment date - recon date) trên các recon đã thu đủ.
  const paidReconsWithDate = revReconsAll.filter(
    (r) => r.paid >= r.receivable - 0.5 && r.receivable > 0 && r.firstPaidDate && r.reconDate,
  );
  const daysDiffs = paidReconsWithDate
    .map((r) =>
      Math.floor(
        (new Date(r.firstPaidDate!).getTime() - new Date(r.reconDate!).getTime()) /
          (24 * 3600 * 1000),
      ),
    )
    .filter((d) => Number.isFinite(d) && d >= -30 && d <= 365 * 2);
  const avgDaysAll =
    daysDiffs.length > 0 ? daysDiffs.reduce((s, x) => s + x, 0) / daysDiffs.length : null;
  const medianDaysAll = (() => {
    if (daysDiffs.length === 0) return null;
    const sorted = [...daysDiffs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  })();

  // TB ngày trả per partner
  type PartnerPaySpeed = { name: string; count: number; avgDays: number; minDays: number; maxDays: number };
  const speedByPartner = new Map<string, { days: number[] }>();
  for (const r of paidReconsWithDate) {
    const key = r.partnerName ?? "(chưa gán)";
    if (!speedByPartner.has(key)) speedByPartner.set(key, { days: [] });
    const d = Math.floor(
      (new Date(r.firstPaidDate!).getTime() - new Date(r.reconDate!).getTime()) /
        (24 * 3600 * 1000),
    );
    if (Number.isFinite(d) && d >= -30 && d <= 365 * 2) speedByPartner.get(key)!.days.push(d);
  }
  const partnerSpeeds: PartnerPaySpeed[] = [...speedByPartner.entries()]
    .filter(([, v]) => v.days.length >= 2) // cần ít nhất 2 data point
    .map(([name, v]) => ({
      name,
      count: v.days.length,
      avgDays: v.days.reduce((s, x) => s + x, 0) / v.days.length,
      minDays: Math.min(...v.days),
      maxDays: Math.max(...v.days),
    }))
    .sort((a, b) => a.avgDays - b.avgDays);

  // Partner có đợt nhanh nhất / chậm nhất (để show trong sub của KPI card)
  const fastestPartner = partnerSpeeds.length > 0
    ? partnerSpeeds.reduce((best, p) => (p.minDays < best.minDays ? p : best))
    : null;
  const slowestPartner = partnerSpeeds.length > 0
    ? partnerSpeeds.reduce((worst, p) => (p.maxDays > worst.maxDays ? p : worst))
    : null;

  // Công nợ TRẢ (BRE nợ NVKD/KPI/thưởng)
  const apAging = emptyAging();
  let apCount = 0;
  const apRecons = costReconsAll
    .filter((r) => r.payable - r.paid > 0.5)
    .map((r) => ({ ...r, outstanding: r.payable - r.paid, days: daysBetween(r.reconDate) }))
    .sort((a, b) => b.outstanding - a.outstanding);
  for (const r of apRecons) {
    bucketAdd(apAging, r.outstanding, r.days);
    apCount++;
  }
  const apTotal = apAging.b0 + apAging.b30 + apAging.b60 + apAging.b90;

  // ===== Dự báo dòng tiền: sắp thu / sắp trả theo tháng ĐC =====
  const nextInflowByMonth = new Map<string, number>();
  for (const r of arRecons) {
    const m = r.reconDate?.slice(0, 7) ?? "(N/A)";
    nextInflowByMonth.set(m, (nextInflowByMonth.get(m) ?? 0) + r.outstanding);
  }
  const nextOutflowByMonth = new Map<string, number>();
  for (const r of apRecons) {
    const m = r.reconDate?.slice(0, 7) ?? "(N/A)";
    nextOutflowByMonth.set(m, (nextOutflowByMonth.get(m) ?? 0) + r.outstanding);
  }
  const allMonths = new Set([...nextInflowByMonth.keys(), ...nextOutflowByMonth.keys()]);
  const cashflowMonths = [...allMonths].sort().reverse();

  // ===== Concentration risk =====
  const projShare = new Map<number, { name: string; partner: string | null; revenue: number }>();
  const partnerShare = new Map<number, { name: string; revenue: number }>();
  const nvkdShare = new Map<string, { revenue: number; units: number }>();
  let totalRevAll = 0;
  for (const p of prodRowsAll) {
    const rev = Number(p.totalRevenue ?? 0);
    totalRevAll += rev;
    // Project share
    const pjProj = data.aggregatedProjects.find((ap) => ap.id === p.projectId);
    const projName = pjProj?.name ?? String(p.projectId);
    const partnerName = pjProj?.partnerName ?? null;
    if (!projShare.has(p.projectId))
      projShare.set(p.projectId, { name: projName, partner: partnerName, revenue: 0 });
    projShare.get(p.projectId)!.revenue += rev;
    // Partner share
    if (partnerName) {
      // Reverse lookup: partnerId? use aggregate name-key
      const key = pjProj?.partnerName ? -1 : -1;
      void key;
    }
  }
  // Partner share from partnerNames map:
  for (const [pid, pname] of partnerNames) {
    const rev = data.aggregatedProjects
      .filter((ap) => ap.partnerName === pname)
      .reduce((s, ap) => s + ap.totalRevenueExpected, 0);
    if (rev > 0) partnerShare.set(pid, { name: pname, revenue: rev });
  }
  // NVKD share (theo salesPerson text)
  for (const p of prodRowsAll) {
    const key = p.salesPerson?.trim() || "(chưa gán)";
    if (!nvkdShare.has(key)) nvkdShare.set(key, { revenue: 0, units: 0 });
    const agg = nvkdShare.get(key)!;
    agg.revenue += Number(p.totalRevenue ?? 0);
    agg.units++;
  }

  const topProj = [...projShare.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topPartner = [...partnerShare.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topNvkd = [...nvkdShare.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const share = (n: number) => (totalRevAll > 0 ? (n / totalRevAll) * 100 : 0);
  const riskLevel = (pct: number) =>
    pct >= 40 ? "critical" : pct >= 25 ? "warning" : "ok";
  const riskColor = (lvl: string) =>
    lvl === "critical" ? "text-red-700 bg-red-50 border-red-300"
      : lvl === "warning" ? "text-orange-700 bg-orange-50 border-orange-300"
      : "text-green-700 bg-green-50 border-green-300";

  return (
    <div className="space-y-6">
      <ReportsHeader
        activePath="/reports/cashflow"
        filters={filters}
        yearOptions={yearOptions}
        filterLabel={filterLabel}
        totalProducts={grandTotals.products}
      />

      {/* ============ Overview cards ============ */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Công nợ tổng quan (tất cả các năm)</h2>
        <p className="text-xs text-slate-500 mb-3">
          Tổng khoản chưa thu/chưa trả trên tất cả đợt đối chiếu, không phụ thuộc bộ lọc năm.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card
            label={`Đang thu (CĐT/F1 nợ BRE)`}
            value={fmtMoney(arTotal)}
            sub={`${arCount} đợt chưa thu đủ`}
            warn
          />
          <Card
            label={`Đang trả (BRE nợ NV/CTV)`}
            value={fmtMoney(apTotal)}
            sub={`${apCount} đợt chưa trả đủ`}
            warn
          />
          <Card
            label="Thu − Trả (chênh ròng)"
            value={fmtMoney(arTotal - apTotal)}
            highlight={arTotal - apTotal >= 0}
            sub="Dương = BRE đang nắm giữ, âm = phải bù"
          />
          <Card
            label="Quá hạn > 90 ngày"
            value={fmtMoney(arAging.b90 + apAging.b90)}
            sub={`Thu: ${fmtMoney(arAging.b90)} · Trả: ${fmtMoney(apAging.b90)}`}
            highlight={arAging.b90 + apAging.b90 <= 0}
          />
        </div>
      </div>

      {/* ============ Tốc độ CĐT chuyển tiền ============ */}
      <div>
        <h2 className="text-lg font-semibold mb-1">⏱️ Tốc độ CĐT chuyển tiền (tất cả các năm)</h2>
        <p className="text-xs text-slate-500 mb-3">
          Số ngày từ ngày ký biên bản đối chiếu → CĐT thực chuyển tiền vào TK BRE. Tính trên các đợt đã thu đủ.
          <br />
          <span className="text-slate-400">
            Số âm = CĐT chuyển tiền TRƯỚC ngày ký BB (tạm ứng theo tiến độ, ký BB chốt sau) — nghiệp vụ hợp lệ, không phải sai dữ liệu.
          </span>
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card
            label="Trung bình"
            value={avgDaysAll !== null ? `${Math.round(avgDaysAll)} ngày` : "—"}
            sub={`${daysDiffs.length} đợt đã thu đủ có ngày`}
            highlight={avgDaysAll !== null && avgDaysAll <= 30}
          />
          <Card
            label="Trung vị"
            value={medianDaysAll !== null ? `${Math.round(medianDaysAll)} ngày` : "—"}
            sub="ít bị ảnh hưởng bởi giá trị cá biệt"
          />
          <Card
            label="Nhanh nhất"
            value={daysDiffs.length > 0 ? `${Math.min(...daysDiffs)} ngày` : "—"}
            sub={fastestPartner ? `${fastestPartner.name}` : undefined}
          />
          <Card
            label="Chậm nhất"
            value={daysDiffs.length > 0 ? `${Math.max(...daysDiffs)} ngày` : "—"}
            sub={slowestPartner ? `${slowestPartner.name}` : undefined}
            warn
          />
        </div>
        {partnerSpeeds.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="text-left p-2">Đối tác</th>
                  <th className="text-center p-2">Số đợt (đã thu đủ)</th>
                  <th className="text-right p-2">TB ngày trả</th>
                  <th className="text-right p-2">Nhanh nhất</th>
                  <th className="text-right p-2">Lâu nhất</th>
                </tr>
              </thead>
              <tbody>
                {partnerSpeeds.map((p) => {
                  const avgColor =
                    p.avgDays <= 30 ? "text-green-700" : p.avgDays <= 60 ? "text-orange-700" : "text-red-700";
                  const minColor = p.minDays < 0 ? "text-green-700 font-medium" : "text-slate-500";
                  return (
                    <tr key={p.name} className="border-t border-slate-100">
                      <td className="p-2 font-medium">{p.name}</td>
                      <td className="p-2 text-center tabular-nums">{p.count}</td>
                      <td className={`p-2 text-right tabular-nums font-semibold ${avgColor}`}>
                        {Math.round(p.avgDays)} ngày
                      </td>
                      <td className={`p-2 text-right tabular-nums text-xs ${minColor}`}>
                        {p.minDays} ngày
                      </td>
                      <td className="p-2 text-right tabular-nums text-xs text-slate-500">
                        {p.maxDays} ngày
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {partnerSpeeds.length === 0 && (
          <div className="text-xs text-slate-500 italic">
            Chưa đủ dữ liệu thanh toán thực tế (cần ≥2 đợt đã thu đủ / đối tác) để tính tốc độ.
          </div>
        )}
      </div>

      {/* ============ Tuổi nợ tổng ============ */}
      <AgingTable title="Tuổi nợ tổng — CĐT/F1 nợ BRE" aging={arAging} />

      {/* ============ Tuổi nợ theo đối tác ============ */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Tuổi nợ theo đối tác</h2>
        <p className="text-xs text-slate-500 mb-3">
          Mỗi CĐT/F1 chia theo nhóm tuổi nợ (0-30 / 31-60 / 61-90 / {">"}90 ngày kể từ ngày đối chiếu). Xếp: đối tác có nhiều tiền quá hạn ({">"}30 ngày) lên trước. <b>Bấm ▶ để xem danh sách căn cụ thể</b>.
        </p>
        <div className="space-y-2">
          {partnerAgingRows.map((r) => {
            const overdue = r.b30 + r.b60 + r.b90;
            const overduePct = r.total > 0 ? (overdue / r.total) * 100 : 0;
            const maxColor =
              r.maxDays > 90 ? "text-red-700 font-semibold"
                : r.maxDays > 60 ? "text-orange-700"
                : r.maxDays > 30 ? "text-amber-600"
                : "text-slate-500";
            const partnerRecons = arRecons
              .filter((rc) => (rc.partnerName ?? "(chưa gán)") === r.name)
              .sort((a, b) => b.days - a.days);
            return (
              <details
                key={r.name}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                <summary className="cursor-pointer list-none p-3 hover:bg-slate-50">
                  <div className="grid grid-cols-12 gap-3 items-center text-sm">
                    <div className="col-span-3 font-medium">
                      <span className="mr-2 text-slate-400 inline-block transition-transform group-open:rotate-90">▶</span>
                      {r.name}
                    </div>
                    <div className="col-span-1 text-center tabular-nums text-xs text-slate-500">
                      {r.count} đợt
                    </div>
                    <div className="col-span-1 text-right tabular-nums text-xs text-slate-700">
                      {r.b0 > 0 ? fmtMoney(r.b0) : ""}
                    </div>
                    <div className="col-span-1 text-right tabular-nums text-xs text-amber-700 font-medium">
                      {r.b30 > 0 ? fmtMoney(r.b30) : ""}
                    </div>
                    <div className="col-span-1 text-right tabular-nums text-xs text-orange-700 font-medium">
                      {r.b60 > 0 ? fmtMoney(r.b60) : ""}
                    </div>
                    <div className="col-span-1 text-right tabular-nums text-xs text-red-700 font-bold">
                      {r.b90 > 0 ? fmtMoney(r.b90) : ""}
                    </div>
                    <div className="col-span-2 text-right tabular-nums font-semibold">
                      {fmtMoney(r.total)}
                      {overduePct > 0 && (
                        <div className="text-[10px] text-orange-600 font-normal">
                          {fmtPctRaw(overduePct, 0)} quá hạn
                        </div>
                      )}
                    </div>
                    <div className={`col-span-2 text-right tabular-nums text-xs ${maxColor}`}>
                      Đợt lâu nhất: {r.maxDays} ngày
                    </div>
                  </div>
                </summary>
                <div className="border-t border-slate-100 bg-slate-50 p-3">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="text-left p-1">Căn</th>
                        <th className="text-left p-1">Dự án</th>
                        <th className="text-left p-1">Ngày ĐC</th>
                        <th className="text-right p-1">Số ngày</th>
                        <th className="text-right p-1">Số tiền còn nợ</th>
                        <th className="text-right p-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {partnerRecons.map((rc) => {
                        const dayColor =
                          rc.days > 90 ? "text-red-700 font-bold"
                            : rc.days > 60 ? "text-orange-700 font-medium"
                            : rc.days > 30 ? "text-amber-700"
                            : "text-slate-500";
                        return (
                          <tr key={rc.id} className="border-t border-slate-200">
                            <td className="p-1 font-mono text-xs">{rc.productCode}</td>
                            <td className="p-1 text-xs text-slate-600">{rc.projectName}</td>
                            <td className="p-1 text-xs text-slate-500">{rc.reconDate ?? "—"}</td>
                            <td className={`p-1 text-right tabular-nums text-xs ${dayColor}`}>
                              {rc.days} ngày
                            </td>
                            <td className="p-1 text-right tabular-nums text-xs font-medium">
                              {fmtMoney(rc.outstanding)}
                            </td>
                            <td className="p-1 text-right">
                              <a
                                href={`/revenues/${rc.id}/edit`}
                                className="text-blue-600 hover:underline text-xs"
                              >
                                Sửa
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
          {partnerAgingRows.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-sm">
              Không có công nợ nào — tất cả CĐT/F1 đã thanh toán đủ.
            </div>
          )}
        </div>
      </div>

      {/* ============ Dự báo dòng tiền theo tháng ============ */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Dự báo dòng tiền theo tháng</h2>
        <p className="text-xs text-slate-500 mb-3">
          Gom số outstanding theo tháng ký biên bản đối chiếu.{" "}
          <b>Sắp thu</b> = đợt đối chiếu doanh thu đã chốt nhưng CĐT/F1 chưa chuyển tiền vào TK BRE.{" "}
          <b>Sắp trả</b> = đợt đối chiếu giá vốn đã chốt nhưng BRE chưa chuyển cho NVKD/CTV/quản lý.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Tháng đối chiếu</th>
                <th className="text-center p-2">Đợt thu</th>
                <th className="text-right p-2">Sắp thu</th>
                <th className="text-center p-2">Đợt trả</th>
                <th className="text-right p-2">Sắp trả</th>
                <th className="text-right p-2">Ròng</th>
              </tr>
            </thead>
            <tbody>
              {cashflowMonths.map((m) => {
                const inflow = nextInflowByMonth.get(m) ?? 0;
                const outflow = nextOutflowByMonth.get(m) ?? 0;
                const net = inflow - outflow;
                const nIn = arRecons.filter((r) => (r.reconDate?.slice(0, 7) ?? "(N/A)") === m).length;
                const nOut = apRecons.filter((r) => (r.reconDate?.slice(0, 7) ?? "(N/A)") === m).length;
                return (
                  <tr key={m} className="border-t border-slate-100">
                    <td className="p-2 font-mono text-sm">{m}</td>
                    <td className="p-2 text-center tabular-nums text-xs text-slate-500">
                      {nIn > 0 ? nIn : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-blue-700">
                      {inflow > 0 ? fmtMoney(inflow) : "—"}
                    </td>
                    <td className="p-2 text-center tabular-nums text-xs text-slate-500">
                      {nOut > 0 ? nOut : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-orange-700">
                      {outflow > 0 ? fmtMoney(outflow) : "—"}
                    </td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${
                        net >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {fmtMoney(net)}
                    </td>
                  </tr>
                );
              })}
              {cashflowMonths.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500 text-sm">
                    Không có khoản chưa thu/trả nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ Concentration risk ============ */}
      <div className="border-t border-slate-300 pt-6">
        <h2 className="text-lg font-semibold mb-1">🎯 Rủi ro tập trung</h2>
        <p className="text-xs text-slate-500 mb-3">
          % doanh thu phụ thuộc top nguồn (dự án / CĐT / NVKD). Cảnh báo khi 1 nguồn ≥ 40% (đỏ) hoặc ≥ 25% (cam).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RiskCard
            title="Top dự án"
            rows={topProj.map((r) => ({
              name: r.name,
              sub: displayPartnerName(r.partner),
              pct: share(r.revenue),
              amount: r.revenue,
            }))}
            riskLevel={riskLevel}
            riskColor={riskColor}
          />
          <RiskCard
            title="Top CĐT / F1"
            rows={topPartner.map((r) => ({
              name: r.name,
              sub: null,
              pct: share(r.revenue),
              amount: r.revenue,
            }))}
            riskLevel={riskLevel}
            riskColor={riskColor}
          />
          <RiskCard
            title="Top NVKD"
            rows={topNvkd.map((r) => ({
              name: r.name,
              sub: `${r.units} căn`,
              pct: share(r.revenue),
              amount: r.revenue,
            }))}
            riskLevel={riskLevel}
            riskColor={riskColor}
          />
        </div>
      </div>
    </div>
  );
}

function AgingTable({ title, aging }: { title: string; aging: { b0: number; b30: number; b60: number; b90: number } }) {
  const total = aging.b0 + aging.b30 + aging.b60 + aging.b90;
  const rows = [
    { label: "0-30 ngày", val: aging.b0, cls: "text-slate-700" },
    { label: "31-60 ngày", val: aging.b30, cls: "text-slate-700" },
    { label: "61-90 ngày", val: aging.b60, cls: "text-orange-700" },
    { label: "> 90 ngày", val: aging.b90, cls: "text-red-700 font-semibold" },
  ];
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => {
              const pct = total > 0 ? (r.val / total) * 100 : 0;
              return (
                <tr key={r.label} className="border-b border-slate-100 last:border-0">
                  <td className="p-2 text-xs">{r.label}</td>
                  <td className={`p-2 text-right tabular-nums text-sm ${r.cls}`}>{fmtMoney(r.val)}</td>
                  <td className="p-2 text-right text-xs text-slate-500 tabular-nums w-16">{fmtPctRaw(pct, 1)}</td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-semibold">
              <td className="p-2 text-xs">Tổng</td>
              <td className="p-2 text-right tabular-nums">{fmtMoney(total)}</td>
              <td className="p-2 text-right text-xs">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RiskCard({
  title,
  rows,
  riskLevel,
  riskColor,
}: {
  title: string;
  rows: { name: string; sub: string | null; pct: number; amount: number }[];
  riskLevel: (pct: number) => string;
  riskColor: (lvl: string) => string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-3 bg-slate-50 border-b border-slate-200 text-sm font-semibold">
        {title}
      </div>
      <div className="p-3 space-y-2">
        {rows.map((r, i) => {
          const lvl = riskLevel(r.pct);
          return (
            <div key={i} className={`rounded-lg p-2 border ${riskColor(lvl)}`}>
              <div className="flex justify-between items-baseline gap-2">
                <div className="text-xs font-medium truncate">{r.name}</div>
                <div className="text-sm font-bold tabular-nums whitespace-nowrap">
                  {fmtPctRaw(r.pct, 1)}
                </div>
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between mt-0.5">
                {r.sub && <span>{r.sub}</span>}
                <span className="tabular-nums ml-auto">{fmtMoney(r.amount)}</span>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="text-xs text-slate-400 text-center py-2">Không có dữ liệu.</div>
        )}
      </div>
    </div>
  );
}
