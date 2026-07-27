import { db } from "@/lib/db";
import { financialTransactions, accountingCategories, products, revenueReconciliations, costReconciliations, companySettings } from "@/lib/schema";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { sql, inArray, gte, eq, ne, and } from "drizzle-orm";
import Link from "next/link";
import { monthlyDepreciation } from "@/lib/accounting/depreciation";

export const dynamic = "force-dynamic";

// Framework 2026-07-25: OPEX chuẩn (loại CAPEX + thuế pass-through + tạm ứng + booking)
const OPEX_CATEGORIES = ["6421", "6427-rent", "6427-svc", "6417", "6428", "6425", "635"];

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtM = (n: number) => (n / 1_000_000).toFixed(1) + "M";

// nowMonth - m tháng (âm nếu m trong tương lai)
function monthDiff(from: string, to: string): number {
  const [y1, mo1] = from.split("-").map(Number);
  const [y2, mo2] = to.split("-").map(Number);
  if (!y1 || !y2) return 0;
  return (y2 - y1) * 12 + (mo2 - mo1);
}

function subMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const total = y * 12 + (mo - 1) - delta;
  const newY = Math.floor(total / 12);
  const newMo = (total % 12) + 1;
  return `${newY}-${String(newMo).padStart(2, "0")}`;
}

type SearchParams = Promise<{ year?: string }>;

export default async function ManagementReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  const sp = await searchParams;
  const nowMonth = new Date().toISOString().slice(0, 7);

  // ===== 1. OPEX rows toàn thời gian — filter theo năm cho breakdown table =====
  const opexRows = await db
    .select({
      month: financialTransactions.transactionMonth,
      code: financialTransactions.categoryCode,
      group: financialTransactions.managementGroup,
      sum: sql<number>`sum(amount)::float8`,
      n: sql<number>`count(*)::int`,
    })
    .from(financialTransactions)
    .where(inArray(financialTransactions.categoryCode, OPEX_CATEGORIES))
    .groupBy(
      financialTransactions.transactionMonth,
      financialTransactions.categoryCode,
      financialTransactions.managementGroup,
    );

  // Xác định các năm có data
  const yearsSet = new Set<string>();
  for (const r of opexRows) {
    if (r.month) yearsSet.add(r.month.slice(0, 4));
  }
  const yearList = [...yearsSet].sort().reverse();
  const currentYear = nowMonth.slice(0, 4);
  const selectedYear = sp.year && yearsSet.has(sp.year) ? sp.year : (yearsSet.has(currentYear) ? currentYear : yearList[0] ?? currentYear);

  // Grid: group × month (filter theo năm selected)
  const groupsSet = new Set<string>();
  const monthsSet = new Set<string>();
  const grid = new Map<string, Map<string, number>>();
  const groupTotals = new Map<string, number>();
  for (const r of opexRows) {
    const g = r.group ?? r.code;
    if (!r.month) continue;
    if (r.month.slice(0, 4) !== selectedYear) continue;
    groupsSet.add(g);
    monthsSet.add(r.month);
    if (!grid.has(g)) grid.set(g, new Map());
    grid.get(g)!.set(r.month, Number(r.sum));
    groupTotals.set(g, (groupTotals.get(g) ?? 0) + Number(r.sum));
  }
  const groupList = [...groupsSet].sort();
  const monthList = [...monthsSet].sort();
  const yearlyTotal = [...groupTotals.values()].reduce((s, v) => s + v, 0);
  const monthsWithData = monthList.length || 1;

  // Break-even dùng NĂM HIỆN TẠI YTD (2026-01 → nowMonth) — chốt 2026-07-25.
  // Phản ánh chi tiêu thực tế năm nay, không bị pha loãng bởi tháng cũ.
  const monthsSoFar = Number(nowMonth.slice(5)); // T7 → 7
  const opexCurrentYear = opexRows
    .filter((r) => r.month?.startsWith(currentYear))
    .reduce((s, r) => s + Number(r.sum), 0);
  const opexPureAvg = monthsSoFar > 0 ? opexCurrentYear / monthsSoFar : 0;

  // ===== Khấu hao TSCĐ (chốt 2026-07-26) — cộng vào CP HĐ tháng =====
  const tscdRows = await db
    .select({
      month: financialTransactions.transactionMonth,
      cost: financialTransactions.amount,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "153-211"));
  const monthlyDepTotal = tscdRows.reduce(
    (s, a) => s + monthlyDepreciation(a.month, Number(a.cost), nowMonth),
    0,
  );
  const avgOpexMonth = opexPureAvg + monthlyDepTotal;

  // ===== 2. P&L monthly (accrual — rev + cost gộp theo tháng cọc căn) =====
  const allProducts = await db.select({ id: products.id, depositDate: products.depositDate }).from(products);
  const productMonthMap = new Map<number, string>();
  for (const p of allProducts) {
    if (p.depositDate) productMonthMap.set(p.id, p.depositDate.slice(0, 7));
  }

  const [revs, costs] = await Promise.all([
    db.select({
      productId: revenueReconciliations.productId,
      receivable: revenueReconciliations.totalReceivableThisTime,
    }).from(revenueReconciliations),
    db.select({
      productId: costReconciliations.productId,
      payable: costReconciliations.amountPayableThisTime,
    }).from(costReconciliations),
  ]);

  type MonthlyPnL = { month: string; revenue: number; cost: number; opex: number };
  const pnl = new Map<string, MonthlyPnL>();
  const getM = (m: string) => {
    if (!pnl.has(m)) pnl.set(m, { month: m, revenue: 0, cost: 0, opex: 0 });
    return pnl.get(m)!;
  };
  for (const r of revs) {
    const m = productMonthMap.get(r.productId);
    if (!m) continue;
    getM(m).revenue += Number(r.receivable ?? 0);
  }
  for (const cst of costs) {
    const m = productMonthMap.get(cst.productId);
    if (!m) continue;
    getM(cst.productId ? m : "?").cost += Number(cst.payable ?? 0);
  }
  for (const [g, mmap] of grid) {
    for (const [m, v] of mmap) {
      getM(m).opex += v;
    }
  }
  // P&L monthly: filter theo năm selected (không dùng 12-month rolling)
  const pnlMonths = [...pnl.values()]
    .filter((p) => p.month.slice(0, 4) === selectedYear)
    .sort((a, b) => b.month.localeCompare(a.month));

  // ===== 3. Break-even =====
  // Lãi gộp TB / căn (toàn bộ căn)
  const productStats = await db
    .select({
      revExp: sql<number>`coalesce(sum(total_revenue), 0)::float8`,
      costExp: sql<number>`coalesce(sum(total_cost), 0)::float8`,
      n: sql<number>`count(*)::int`,
    })
    .from(products);
  const totalRev = Number(productStats[0]?.revExp ?? 0);
  const totalCost = Number(productStats[0]?.costExp ?? 0);
  const numUnits = Number(productStats[0]?.n ?? 0);
  const avgGrossProfitPerUnit = numUnits > 0 ? (totalRev / 1.1 - totalCost) / numUnits : 0;
  const breakEvenUnits = avgGrossProfitPerUnit > 0 && avgOpexMonth > 0
    ? avgOpexMonth / avgGrossProfitPerUnit
    : null;

  // Avg units bán / tháng — theo năm hiện tại YTD (nhất quán với avgOpexMonth).
  // Chia cho monthsSoFar (không chia số tháng có bán) để bao gồm cả tháng ế
  // → BE comparison đúng: "TB căn/tháng kể cả tháng 0 căn".
  const unitsCurrentYear = allProducts.filter((p) =>
    p.depositDate?.startsWith(currentYear),
  ).length;
  const avgUnitsPerMonth = monthsSoFar > 0
    ? unitsCurrentYear / monthsSoFar
    : 0;

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">
            ← Báo cáo
          </Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Báo cáo quản trị</h1>
        <p className="text-sm text-slate-500 mt-1">
          3 chỉ số then chốt cho chủ cty: <b>Điểm hòa vốn</b>, <b>Cơ cấu CP HĐ</b>,
          <b> Lãi/lỗ theo tháng</b>. Tính theo Năm {currentYear} đến hiện tại ({monthsSoFar} tháng). Đã loại
          chi phí đầu tư TSCĐ + thuế nộp thay (GTGT/TNDN/TNCN) + booking (theo framework 2026-07-25).
        </p>
      </div>

      {/* ===== SECTION 1: Điểm hòa vốn ===== */}
      <section>
        <h2 className="text-lg font-semibold mb-1">⚖️ Điểm hòa vốn</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="CP HĐ TB / tháng"
            value={fmt(avgOpexMonth)}
            sub={`CP tiền mặt ${fmt(opexPureAvg)} + KH TSCĐ ${fmt(monthlyDepTotal)}`}
            warn
          />
          <StatCard label="Lãi gộp TB / căn" value={fmt(avgGrossProfitPerUnit)} sub={`${numUnits} căn`} />
          <StatCard
            label="Điểm hòa vốn"
            value={breakEvenUnits !== null ? `${breakEvenUnits.toFixed(1)} căn/tháng` : "—"}
            sub="CP HĐ / Lãi TB/căn"
            warn
          />
          <StatCard
            label="Thực tế đang bán"
            value={`${avgUnitsPerMonth.toFixed(1)} căn/tháng`}
            sub={`Năm ${currentYear} YTD`}
            highlight={breakEvenUnits !== null && avgUnitsPerMonth >= breakEvenUnits}
          />
        </div>
        {breakEvenUnits !== null && (
          <div
            className={`mt-3 rounded-lg p-3 text-sm ${
              avgUnitsPerMonth >= breakEvenUnits
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            {avgUnitsPerMonth >= breakEvenUnits ? (
              <>
                ✅ Đang <b>vượt điểm hòa vốn</b> {(avgUnitsPerMonth - breakEvenUnits).toFixed(1)} căn/tháng — lãi thuần dương.
              </>
            ) : (
              <>
                ⚠️ Đang <b>dưới điểm hòa vốn</b> {(breakEvenUnits - avgUnitsPerMonth).toFixed(1)} căn/tháng — cần bán thêm để cover CP HĐ.
              </>
            )}
          </div>
        )}
      </section>

      {/* ===== SECTION 2: CP HĐ breakdown theo nhóm × tháng (tabs năm) ===== */}
      <section>
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-lg font-semibold">💼 CP HĐ — phân tích theo nhóm × tháng</h2>
          <YearTabs years={yearList} selected={selectedYear} />
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Đã loại: Thiết bị (chi phí đầu tư riêng), thuế GTGT/TNDN/TNCN (nộp thay), booking hoàn/cọc hộ khách, HH sale (nằm ở giá vốn CRM).
        </p>
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-slate-50 whitespace-nowrap">Nhóm</th>
                {monthList.map((m) => (
                  <th key={m} className="text-right p-2 whitespace-nowrap">
                    <Link
                      href={`/reports/management/${m}`}
                      className="text-blue-600 hover:underline"
                      title="Xem chi tiết tháng này"
                    >
                      T{Number(m.slice(5))}
                    </Link>
                  </th>
                ))}
                <th className="text-right p-2 whitespace-nowrap bg-slate-100">TỔNG {selectedYear}</th>
                <th className="text-right p-2 whitespace-nowrap">TB/tháng</th>
                <th className="text-right p-2 whitespace-nowrap">% tổng</th>
              </tr>
            </thead>
            <tbody>
              {groupList.map((g) => {
                const total = groupTotals.get(g) ?? 0;
                const pct = yearlyTotal > 0 ? (total / yearlyTotal) * 100 : 0;
                return (
                  <tr key={g} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2 sticky left-0 bg-white whitespace-nowrap font-medium">{g}</td>
                    {monthList.map((m) => {
                      const v = grid.get(g)?.get(m) ?? 0;
                      return (
                        <td key={m} className="p-2 text-right tabular-nums">
                          {v > 0 ? fmtM(v) : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="p-2 text-right tabular-nums font-semibold bg-slate-50">
                      {fmt(total)}
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmt(total / monthsWithData)}</td>
                    <td className="p-2 text-right tabular-nums">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {groupList.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-500">
                    Chưa có CP HĐ trong năm {selectedYear}.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-100 font-bold">
              <tr>
                <td className="p-2 sticky left-0 bg-slate-100">TỔNG CP HĐ</td>
                {monthList.map((m) => {
                  const monthTotal = [...grid.values()].reduce(
                    (s, mm) => s + (mm.get(m) ?? 0),
                    0,
                  );
                  return (
                    <td key={m} className="p-2 text-right tabular-nums">
                      {fmtM(monthTotal)}
                    </td>
                  );
                })}
                <td className="p-2 text-right tabular-nums">{fmt(yearlyTotal)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(yearlyTotal / monthsWithData)}</td>
                <td className="p-2 text-right">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ===== SECTION 3: P&L monthly ===== */}
      <section>
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-lg font-semibold">📈 Lãi/lỗ theo tháng — {selectedYear}</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Accrual: DT + Giá vốn gộp theo tháng cọc căn. CP HĐ gộp theo tháng phát sinh.
          Lãi thuần = DT/1.1 − Giá vốn − CP HĐ.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="text-left p-2">Tháng</th>
                <th className="text-right p-2">DT (gồm VAT)</th>
                <th className="text-right p-2">Giá vốn</th>
                <th className="text-right p-2">CP HĐ</th>
                <th className="text-right p-2">Lãi gộp</th>
                <th className="text-right p-2 w-64">Lãi thuần</th>
              </tr>
            </thead>
            <tbody>
              {pnlMonths.map((p) => {
                const gross = p.revenue / 1.1 - p.cost;
                const net = gross - p.opex;
                const maxAbs = Math.max(...pnlMonths.map((x) => Math.abs(x.revenue / 1.1 - x.cost - x.opex)), 1);
                const pct = (Math.abs(net) / maxAbs) * 100;
                const positive = net >= 0;
                return (
                  <tr key={p.month} className="border-t border-slate-100">
                    <td className="p-2 font-mono">
                      <Link
                        href={`/reports/management/${p.month}`}
                        className="text-blue-600 hover:underline"
                      >
                        {p.month}
                      </Link>
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs">
                      {p.revenue > 0 ? fmt(p.revenue) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs text-orange-700">
                      {p.cost > 0 ? fmt(p.cost) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs text-orange-700">
                      {p.opex > 0 ? fmt(p.opex) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`p-2 text-right tabular-nums text-xs font-medium ${gross >= 0 ? "text-slate-700" : "text-red-700"}`}>
                      {fmt(gross)}
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
                          className={`text-right tabular-nums text-xs font-semibold w-28 ${
                            positive ? "text-green-700" : "text-red-700"
                          }`}
                        >
                          {fmt(net)}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pnlMonths.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500 text-sm">
                    Chưa có data Năm {currentYear} YTD ({monthsSoFar} tháng).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function YearTabs({ years, selected }: { years: string[]; selected: string }) {
  if (years.length <= 1) return null;
  return (
    <div className="flex gap-1">
      {years.map((y) => {
        const active = y === selected;
        return (
          <Link
            key={y}
            href={`/reports/management?year=${y}`}
            className={
              active
                ? "px-3 py-1 rounded text-xs font-semibold bg-orange-500 text-white"
                : "px-3 py-1 rounded text-xs bg-slate-100 text-slate-700 hover:bg-slate-200"
            }
          >
            {y}
          </Link>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  warn,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  highlight?: boolean;
}) {
  const border = highlight ? "border-green-300" : warn ? "border-orange-200" : "border-slate-200";
  return (
    <div className={`bg-white border ${border} rounded-xl p-4`}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
