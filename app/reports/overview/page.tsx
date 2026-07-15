import Link from "next/link";
import { redirect } from "next/navigation";
import { fmtMoney, fmtPctRaw } from "@/lib/format";
import { hasReportsAccess } from "@/lib/auth";
import { loadReportData, parseFilters } from "@/lib/reports";
import { Card, ReportsHeader } from "../_shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

export default async function ReportsOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await hasReportsAccess())) redirect("/");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const data = await loadReportData(filters);
  const { grandTotals, profitExpected, profitRealized, financial, filterLabel, yearOptions } = data;

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
              label={`CP QL trong kỳ (${financial.monthsInPeriod} tháng)`}
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
    </div>
  );
}
