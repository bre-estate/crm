import Link from "next/link";
import { redirect } from "next/navigation";
import { fmtMoney, fmtPctRaw } from "@/lib/format";
import { hasReportsAccess, getOwnerEmail } from "@/lib/auth";
import { loadReportData, parseFilters, effectiveYM } from "@/lib/reports";
import { Card, ReportsHeader } from "../_shared";
import { db } from "@/lib/db";
import { companyExpenses, financialTransactions } from "@/lib/schema";
import { inArray, sql, eq } from "drizzle-orm";
import { monthlyDepreciation } from "@/lib/accounting/depreciation";

// Framework chốt 2026-07-25:
//   - Bỏ 153-211 (Thiết bị/TSCĐ = CAPEX, khấu hao riêng)
//   - Bỏ 3331-3334 (Thuế GTGT/TNDN/TNCN pass-through, không giảm lãi)
//   - 6425 chỉ còn thuế môn bài + công đoàn (OPEX thật)
const OPEX_CATEGORIES = [
  "6421", "6427-rent", "6427-svc", "6417", "6428", "6425", "635",
];

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

// nowMonth - m (số tháng cách hiện tại). Format "YYYY-MM".
function monthDiff(m: string, now: string): number {
  const [y1, mo1] = m.split("-").map(Number);
  const [y2, mo2] = now.split("-").map(Number);
  if (!y1 || !y2) return 999;
  return (y2 - y1) * 12 + (mo2 - mo1);
}

export default async function ReportsOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await hasReportsAccess())) redirect("/");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const data = await loadReportData(filters);
  const { grandTotals, profitExpected, profitRealized, financial, filterLabel, yearOptions, revReconsAll, costReconsAll } = data;
  const isOwner = (await getOwnerEmail()) !== null;

  // ===== Monthly P&L (owner-only) =====
  type MonthlyPnl = {
    month: string;
    revenue: number; // đã ĐC (nếu 0 thì dùng expected? Prefer đã ĐC vì chỉ tháng có ĐC mới có realized)
    cost: number;
    expense: number;
    profitGross: number; // rev/1.1 - cost
    profitNet: number; // profitGross - expense
  };
  const pnlByMonth = new Map<string, MonthlyPnl>();
  const getOrInitMonth = (m: string): MonthlyPnl => {
    if (!pnlByMonth.has(m))
      pnlByMonth.set(m, { month: m, revenue: 0, cost: 0, expense: 0, profitGross: 0, profitNet: 0 });
    return pnlByMonth.get(m)!;
  };

  let allExpenses: Array<{ month: string; amount: number }> = [];
  let breakEvenUnits: number | null = null;
  let avgUnitsPerMonth: number | null = null;
  let avgMonthlyExpense = 0;
  let avgProfitPerUnit = 0;

  if (isOwner) {
    // Nguồn chi phí quản lý mới (Phase 1): financial_transactions với TK nhóm 1-8.
    // Nếu chưa có transaction → fallback company_expenses (legacy) để không
    // vỡ trang khi DB rỗng data mới.
    const txExpenses = await db
      .select({
        month: financialTransactions.transactionMonth,
        amount: financialTransactions.amount,
      })
      .from(financialTransactions)
      .where(inArray(financialTransactions.categoryCode, OPEX_CATEGORIES));
    if (txExpenses.length > 0) {
      allExpenses = txExpenses.map((e) => ({
        month: e.month,
        amount: Number(e.amount ?? 0),
      }));
    } else {
      const expenseRows = await db.select().from(companyExpenses);
      allExpenses = expenseRows.map((e) => ({
        month: e.expenseMonth ?? "",
        amount: Number(e.amount ?? 0),
      }));
    }

    // Dồn tích theo NGÀY ĐC (Kim confirm 2026-07-27) — chuẩn kế toán VN.
    // KHÔNG dùng ngày cọc căn (ngày cọc chỉ cho tính thưởng NVKD).
    for (const r of revReconsAll) {
      if (!r.reconDate) continue;
      const m = r.reconDate.slice(0, 7);
      getOrInitMonth(m).revenue += r.receivable;
    }
    for (const c of costReconsAll) {
      if (!c.reconDate) continue;
      const m = c.reconDate.slice(0, 7);
      getOrInitMonth(m).cost += c.payable;
    }
    for (const e of allExpenses) {
      if (!e.month) continue;
      getOrInitMonth(e.month).expense += e.amount;
    }
    for (const pnl of pnlByMonth.values()) {
      pnl.profitGross = pnl.revenue / 1.1 - pnl.cost;
      pnl.profitNet = pnl.profitGross - pnl.expense;
    }

    // Break-even: cần bao nhiêu căn/tháng để cover CP HĐ?
    // avgMonthlyExpense = TB năm hiện tại YTD (chốt 2026-07-25) — phản ánh
    // chi tiêu thực tế năm nay, không pha loãng bởi tháng cũ.
    const nowMonth = new Date().toISOString().slice(0, 7);
    const currentYear = nowMonth.slice(0, 4);
    const monthsSoFar = Number(nowMonth.slice(5));
    const currentYearExpenses = allExpenses.filter((e) => e.month?.startsWith(currentYear));
    const totalExpenseCurYear = currentYearExpenses.reduce((s, e) => s + e.amount, 0);
    const opexPureAvg = monthsSoFar > 0 ? totalExpenseCurYear / monthsSoFar : 0;

    // Cộng khấu hao TSCĐ (nhóm 5) vào CP HĐ — chốt 2026-07-26
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
    avgMonthlyExpense = opexPureAvg + monthlyDepTotal;

    // avgProfitPerUnit từ toàn bộ data hiện có (không lọc period)
    const totalGrossProfit = data.aggregatedProjects.reduce(
      (s, p) => s + (p.totalRevenueExpected / 1.1 - p.totalCostExpected),
      0,
    );
    const totalUnits = data.aggregatedProjects.reduce((s, p) => s + p.numProducts, 0);
    avgProfitPerUnit = totalUnits > 0 ? totalGrossProfit / totalUnits : 0;

    if (avgProfitPerUnit > 0 && avgMonthlyExpense > 0) {
      breakEvenUnits = avgMonthlyExpense / avgProfitPerUnit;
    }

    // Avg units bán / tháng — theo năm hiện tại YTD (chia đều monthsSoFar,
    // kể cả tháng ế). Nhất quán với avgMonthlyExpense.
    const unitsCurrentYear = data.prodRowsAll.filter((p) =>
      p.depositDate?.startsWith(currentYear),
    ).length;
    avgUnitsPerMonth = monthsSoFar > 0 ? unitsCurrentYear / monthsSoFar : 0;
  }

  const pnlMonths = [...pnlByMonth.values()].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div className="space-y-6">
      <ReportsHeader
        activePath="/reports/overview"
        filters={filters}
        yearOptions={yearOptions}
        filterLabel={filterLabel}
        totalProducts={grandTotals.products}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Tổng doanh thu dự kiến (gồm VAT)" value={fmtMoney(grandTotals.revenueExp)} sub="từ Tab Giao dịch" />
        <Card label="Tổng giá vốn dự kiến" value={fmtMoney(grandTotals.costExp)} warn />
        <Card
          label="Lãi gộp dự kiến (không VAT)"
          value={fmtMoney(profitExpected)}
          highlight={profitExpected >= 0}
        />
        <Card
          label="Biên lợi nhuận"
          value={
            grandTotals.revenueExp > 0
              ? fmtPctRaw((profitExpected / (grandTotals.revenueExp / 1.1)) * 100, 1)
              : "0%"
          }
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Doanh thu đã ĐC" value={fmtMoney(grandTotals.revRec)} />
        <Card label="Giá vốn đã ĐC" value={fmtMoney(grandTotals.costRec)} warn />
        <Card
          label="Lãi thực (không VAT, đã ĐC)"
          value={fmtMoney(profitRealized)}
          highlight={profitRealized >= 0}
        />
        <Card
          label="Công nợ thuần"
          value={fmtMoney(grandTotals.revRec - grandTotals.paidIn - (grandTotals.costRec - grandTotals.paidOut))}
          sub={`Thu: ${fmtMoney(grandTotals.paidIn)} · Chi: ${fmtMoney(grandTotals.paidOut)}`}
        />
      </div>

      {financial && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold">Lãi thuần sau CP quản lý + thuế TNDN</h2>
            <Link href="/finance" className="text-sm text-blue-600 hover:underline">
              → Cấu hình đầu tư / CP quản lý
            </Link>
          </div>
          {financial.totalInvestment === 0 && financial.filteredExpensesCount === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-3">
              Chưa nhập vốn đầu tư và chi phí quản lý. Số Lãi thuần bên dưới ={" "}
              <b>Lãi gộp × (1 − thuế TNDN)</b>. Vào{" "}
              <Link href="/finance" className="underline font-medium">
                Tài chính
              </Link>{" "}
              để nhập chi tiết → có ROI + Payback.
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card
              label={`CP HĐ trong kỳ (${financial.monthsInPeriod} tháng)`}
              value={fmtMoney(financial.totalExpense)}
              sub={`${financial.filteredExpensesCount} dòng chi phí`}
              warn
            />
            <Card
              label={`Thuế TNDN (${fmtPctRaw(financial.taxRate * 100, 0)})`}
              value={fmtMoney(financial.preTaxExpected > 0 ? financial.preTaxExpected * financial.taxRate : 0)}
              sub="Nếu lãi trước thuế > 0"
              warn
            />
            <Card
              label="Lãi thuần dự kiến"
              value={fmtMoney(financial.netExpected)}
              highlight={financial.netExpected >= 0}
              sub={`Biên: ${fmtPctRaw(financial.netMarginExpected, 1)}`}
            />
            <Card
              label="Lãi thuần thực (đã ĐC)"
              value={fmtMoney(financial.netRealized)}
              highlight={financial.netRealized >= 0}
            />
          </div>
          {financial.totalInvestment > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              <Card
                label="Tổng vốn đầu tư"
                value={fmtMoney(financial.totalInvestment)}
                sub={`${financial.invRows.length} khoản`}
              />
              <Card
                label="ROI dự kiến"
                value={financial.roiExpected !== null ? fmtPctRaw(financial.roiExpected, 1) : "—"}
                highlight={(financial.roiExpected ?? 0) >= 0}
                sub="Lãi thuần / Vốn đầu tư"
              />
              <Card
                label="Thời gian hoàn vốn"
                value={
                  financial.paybackMonths !== null
                    ? financial.paybackMonths < 12
                      ? `${financial.paybackMonths.toFixed(1)} tháng`
                      : `${(financial.paybackMonths / 12).toFixed(1)} năm`
                    : "—"
                }
                sub={
                  financial.monthlyNet > 0
                    ? `Lãi thuần TB/tháng: ${fmtMoney(financial.monthlyNet)}`
                    : "Chưa có lãi dương"
                }
              />
            </div>
          )}
        </div>
      )}

      {/* ===== Break-even + P&L monthly (owner-only, cross-year) ===== */}
      {isOwner && (
        <>
          <div>
            <h2 className="text-lg font-semibold mb-1">⚖️ Điểm hòa vốn</h2>
            <p className="text-xs text-slate-500 mb-3">
              Số căn/tháng cần bán để cover CP quản lý. TB CP HĐ + căn bán tính theo năm hiện tại YTD (chốt 2026-07-25).
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card
                label="CP HĐ TB / tháng"
                value={fmtMoney(avgMonthlyExpense)}
                sub="Năm hiện tại YTD"
                warn
              />
              <Card
                label="Lãi gộp TB / căn"
                value={fmtMoney(avgProfitPerUnit)}
                sub="Toàn bộ căn đã có"
              />
              <Card
                label="Điểm hòa vốn"
                value={
                  breakEvenUnits !== null
                    ? `${breakEvenUnits.toFixed(1)} căn/tháng`
                    : "—"
                }
                sub="CP HĐ / Lãi TB/căn"
                warn
              />
              <Card
                label="Thực tế đang bán"
                value={
                  avgUnitsPerMonth !== null
                    ? `${avgUnitsPerMonth.toFixed(1)} căn/tháng`
                    : "—"
                }
                sub="Năm hiện tại YTD"
                highlight={
                  avgUnitsPerMonth !== null &&
                  breakEvenUnits !== null &&
                  avgUnitsPerMonth >= breakEvenUnits
                }
              />
            </div>
            {breakEvenUnits !== null && avgUnitsPerMonth !== null && (
              <div
                className={`mt-3 rounded-lg p-3 text-sm ${
                  avgUnitsPerMonth >= breakEvenUnits
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : "bg-red-50 border border-red-200 text-red-800"
                }`}
              >
                {avgUnitsPerMonth >= breakEvenUnits ? (
                  <>
                    ✅ Đang <b>vượt điểm hòa vốn</b> {(avgUnitsPerMonth - breakEvenUnits).toFixed(1)} căn/tháng.
                    Lãi thuần dương.
                  </>
                ) : (
                  <>
                    ⚠️ Đang <b>dưới điểm hòa vốn</b> {(breakEvenUnits - avgUnitsPerMonth).toFixed(1)} căn/tháng.
                    Cần bán thêm để cover CP HĐ.
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-1">📈 Lãi/lỗ theo tháng</h2>
            <p className="text-xs text-slate-500 mb-3">
              Dồn tích theo ngày đối chiếu (chuẩn kế toán VN — Kim confirm 2026-07-27).
              CP HĐ gộp theo tháng phát sinh.
            </p>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="text-left p-2">Tháng</th>
                    <th className="text-right p-2">DT ĐC (gồm VAT)</th>
                    <th className="text-right p-2">Giá vốn ĐC</th>
                    <th className="text-right p-2">CP HĐ</th>
                    <th className="text-right p-2">Lãi gộp</th>
                    <th className="text-right p-2 w-56">Lãi thuần</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const maxAbsNet = Math.max(...pnlMonths.map((p) => Math.abs(p.profitNet)), 1);
                    return pnlMonths.map((p) => {
                      const pct = (Math.abs(p.profitNet) / maxAbsNet) * 100;
                      const positive = p.profitNet >= 0;
                      return (
                        <tr key={p.month} className="border-t border-slate-100">
                          <td className="p-2 font-mono text-sm">{p.month}</td>
                          <td className="p-2 text-right tabular-nums text-xs">
                            {p.revenue > 0 ? fmtMoney(p.revenue) : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums text-xs">
                            {p.cost > 0 ? fmtMoney(p.cost) : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums text-xs text-orange-700">
                            {p.expense > 0 ? fmtMoney(p.expense) : "—"}
                          </td>
                          <td
                            className={`p-2 text-right tabular-nums text-xs font-medium ${
                              p.profitGross >= 0 ? "text-slate-700" : "text-red-700"
                            }`}
                          >
                            {fmtMoney(p.profitGross)}
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
                                className={`text-right tabular-nums text-xs font-semibold w-24 ${
                                  positive ? "text-green-700" : "text-red-700"
                                }`}
                              >
                                {fmtMoney(p.profitNet)}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                  {pnlMonths.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 text-sm">
                        Chưa có dữ liệu lãi/lỗ theo tháng.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
