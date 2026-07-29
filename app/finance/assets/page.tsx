import { db } from "@/lib/db";
import { financialTransactions } from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import {
  DEFAULT_LIFE_MONTHS,
  monthlyDepreciation,
  accumulatedDepreciation,
  netBookValue,
  monthsBetween,
} from "@/lib/accounting/depreciation";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default async function AssetsPage() {
  await requirePermission("finance");

  const nowMonth = new Date().toISOString().slice(0, 7);

  // TSCĐ/CCDC = financial_transactions category='242' (chi phí trả trước, phân bổ dần)
  const rows = await db
    .select({
      id: financialTransactions.id,
      date: financialTransactions.transactionDate,
      month: financialTransactions.transactionMonth,
      description: financialTransactions.description,
      cost: financialTransactions.amount,
      recipient: financialTransactions.recipient,
      sourceFile: financialTransactions.sourceFile,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "242"))
    .orderBy(desc(financialTransactions.transactionDate));

  // Compute per asset
  const assets = rows.map((r) => {
    const cost = Number(r.cost);
    const purchaseMonth = r.month;
    const elapsed = monthsBetween(purchaseMonth, nowMonth);
    const monthlyDep = monthlyDepreciation(purchaseMonth, cost, nowMonth);
    const accumDep = accumulatedDepreciation(purchaseMonth, cost, nowMonth);
    const netValue = netBookValue(purchaseMonth, cost, nowMonth);
    const active = monthlyDep > 0;
    return {
      ...r,
      cost,
      elapsed,
      monthlyDep,
      accumDep,
      netValue,
      active,
    };
  });

  const totalCost = assets.reduce((s, a) => s + a.cost, 0);
  const totalAccum = assets.reduce((s, a) => s + a.accumDep, 0);
  const totalNet = assets.reduce((s, a) => s + a.netValue, 0);
  const totalMonthlyDep = assets.reduce((s, a) => s + a.monthlyDep, 0);
  const activeCount = assets.filter((a) => a.active).length;

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <div className="text-xs">
          <Link href="/finance" className="text-blue-600 hover:underline">
            ← Tài chính
          </Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Tài sản cố định (TSCĐ) / Công cụ dụng cụ (CCDC)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Danh sách TSCĐ nhóm 5 (thiết bị/máy móc). Khấu hao đường thẳng đều
          <b> {DEFAULT_LIFE_MONTHS} tháng</b> (3 năm) — theo TT45/2013 cho thiết bị văn phòng.
          Khấu hao tháng cộng vào Chi phí hoạt động trong Báo cáo quản trị.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng TSCĐ (mua vào)" value={fmt(totalCost)} sub={`${rows.length} khoản`} />
        <StatCard label="Khấu hao lũy kế" value={fmt(totalAccum)} warn />
        <StatCard label="Giá trị còn lại" value={fmt(totalNet)} sub="Sổ sách" highlight />
        <StatCard
          label="Khấu hao / tháng hiện tại"
          value={fmt(totalMonthlyDep)}
          sub={`${activeCount} TSCĐ đang khấu hao`}
          warn
        />
      </div>

      {/* Bảng chi tiết */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="text-left p-2 whitespace-nowrap">Ngày mua</th>
              <th className="text-left p-2">Chi tiết</th>
              <th className="text-right p-2 whitespace-nowrap">Giá gốc</th>
              <th className="text-center p-2 whitespace-nowrap">Tuổi KH</th>
              <th className="text-center p-2 whitespace-nowrap">Đã KH (tháng)</th>
              <th className="text-right p-2 whitespace-nowrap">KH/tháng</th>
              <th className="text-right p-2 whitespace-nowrap">Đã KH lũy kế</th>
              <th className="text-right p-2 whitespace-nowrap">Giá trị còn lại</th>
              <th className="text-center p-2 whitespace-nowrap">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const status = a.active
                ? "Đang KH"
                : a.elapsed >= DEFAULT_LIFE_MONTHS
                  ? "Hết KH"
                  : "Chưa tới";
              const statusColor = a.active
                ? "bg-blue-100 text-blue-800"
                : a.elapsed >= DEFAULT_LIFE_MONTHS
                  ? "bg-slate-100 text-slate-500"
                  : "bg-amber-100 text-amber-800";
              return (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs">{a.date}</td>
                  <td className="p-2">
                    <div className="text-sm">{a.description}</div>
                    {a.recipient && (
                      <div className="text-[10px] text-slate-500">
                        NCC: {a.recipient}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmt(a.cost)}</td>
                  <td className="p-2 text-center text-xs">{DEFAULT_LIFE_MONTHS}</td>
                  <td className="p-2 text-center text-xs">
                    {Math.min(a.elapsed + 1, DEFAULT_LIFE_MONTHS)}
                  </td>
                  <td className="p-2 text-right tabular-nums text-xs">
                    {a.monthlyDep > 0 ? fmt(a.monthlyDep) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-2 text-right tabular-nums text-orange-700 text-xs">
                    {fmt(a.accumDep)}
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold text-green-700">
                    {fmt(a.netValue)}
                  </td>
                  <td className="p-2 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded ${statusColor}`}>
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {assets.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có TSCĐ nào (nhóm 5). Import qua Excel hoặc thêm giao dịch mới.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold text-sm">
            <tr>
              <td colSpan={2} className="p-2">TỔNG</td>
              <td className="p-2 text-right tabular-nums">{fmt(totalCost)}</td>
              <td colSpan={2}></td>
              <td className="p-2 text-right tabular-nums">{fmt(totalMonthlyDep)}</td>
              <td className="p-2 text-right tabular-nums text-orange-700">{fmt(totalAccum)}</td>
              <td className="p-2 text-right tabular-nums text-green-700">{fmt(totalNet)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1">
        <p className="font-semibold">Cách tính khấu hao:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <b>Đường thẳng đều</b>: Khấu hao/tháng = Giá gốc / {DEFAULT_LIFE_MONTHS} tháng
          </li>
          <li>
            <b>Bắt đầu khấu hao</b>: Từ tháng mua đến 3 năm sau, sau đó không còn khấu hao nữa
            (giá trị net = 0 sổ sách)
          </li>
          <li>
            <b>Cộng vào chi phí hoạt động</b>: Khấu hao/tháng hiện tại = {fmt(totalMonthlyDep)} VND — sẽ
            thêm vào chi phí hoạt động trong Báo cáo quản trị và Báo cáo tổng hợp
          </li>
          <li>
            <b>Bảng cân đối kế toán</b>: Tài sản 153/211 hiển thị Giá gốc − Khấu hao lũy kế = Giá trị còn lại{" "}
            <b>({fmt(totalNet)} VND)</b>
          </li>
          <li>
            <b>Tùy chỉnh thời gian khấu hao cho từng tài sản</b>: chưa hỗ trợ. Hiện dùng 3 năm cho tất cả.
            Có thể thêm bảng ghi đè sau khi công ty có tài sản đắt tiền (ví dụ ô tô 6-10 năm).
          </li>
        </ul>
      </div>
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
  const color = warn ? "text-orange-700" : highlight ? "text-green-700" : "";
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
        {label}
      </div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
