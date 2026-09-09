import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import {
  loadAllContext,
  summarizePeriod,
  listPeriodKeys,
  currentPeriodKey,
  periodLabel,
  parsePeriodKey,
} from "@/lib/period-commission";

export const dynamic = "force-dynamic";

export default async function PeriodsPage() {
  if (!(await hasPermission("periods", "view"))) notFound();
  const ctx = await loadAllContext();
  const keys = new Set(listPeriodKeys(ctx));
  keys.add(currentPeriodKey());
  const rows = [...keys]
    .sort((a, b) => b.localeCompare(a))
    .map((k) => summarizePeriod(ctx, k))
    .filter((s): s is NonNullable<typeof s> => !!s);
  const noPeriod = ctx.products.filter((p) => !p.periodKey).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Kỳ hoa hồng & thưởng</h1>
        <p className="text-sm text-slate-500 mt-1">
          Mỗi kỳ 2 tháng. Doanh thu cá nhân và phòng theo kỳ quyết định mức %HH sale, KPI TPKD và thưởng doanh số.
          Chính sách áp theo ngày cuối kỳ.
        </p>
      </div>

      {noPeriod > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {noPeriod} căn chưa xác định được kỳ (thiếu ngày cọc, tháng ghi nhận và đợt doanh thu). Vào trang căn điền Tháng ghi nhận.
        </div>
      )}

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-2">Kỳ</th>
              <th className="text-right p-2">Số căn</th>
              <th className="text-right p-2">Doanh thu</th>
              <th className="text-right p-2">NVKD</th>
              <th className="text-right p-2">Phòng</th>
              <th className="text-right p-2">Thưởng DS</th>
              <th className="text-right p-2" title="Chênh cần hồi tố tăng, chưa tạo ĐC">Hồi tố treo</th>
              <th className="text-right p-2" title="Chi dư cần hoàn, chưa tạo ĐC">Chi dư treo</th>
              <th className="text-left p-2">Chính sách NVKD</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const ref = parsePeriodKey(s.key)!;
              const isCurrent = s.key === currentPeriodKey();
              return (
                <tr key={s.key} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2">
                    <Link href={`/periods/${s.key}`} className="font-medium text-blue-600 hover:underline">
                      {periodLabel(ref)}
                    </Link>
                    <span className="ml-2 text-[11px] text-slate-400 font-mono">{s.key}</span>
                    {isCurrent && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">hiện tại</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{s.totals.unitCount}</td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(s.totals.revenue)}</td>
                  <td className="p-2 text-right tabular-nums">{s.nvkd.length}</td>
                  <td className="p-2 text-right tabular-nums">{s.depts.length}</td>
                  <td className="p-2 text-right tabular-nums">{s.totals.bonusTotal ? fmtMoney(s.totals.bonusTotal) : "—"}</td>
                  <td className={`p-2 text-right tabular-nums ${s.totals.retroPlus ? "text-red-600 font-medium" : "text-slate-400"}`}>
                    {s.totals.retroPlus ? fmtMoney(s.totals.retroPlus) : "—"}
                  </td>
                  <td className={`p-2 text-right tabular-nums ${s.totals.retroMinus ? "text-purple-700 font-medium" : "text-slate-400"}`}>
                    {s.totals.retroMinus ? fmtMoney(s.totals.retroMinus) : "—"}
                  </td>
                  <td className="p-2 text-xs text-slate-600">
                    {s.policies.nvkd
                      ? `${((Number(s.policies.nvkd.baseRate) || 0) * 100).toFixed(0)}% / ${((s.policies.nvkd.tiers?.[0]?.rate ?? 0) * 100).toFixed(0)}% từ ${fmtMoney(s.policies.nvkd.tiers?.[0]?.threshold ?? 0)}`
                      : "Chưa có"}
                  </td>
                  <td className="p-2 text-right">
                    <Link href={`/periods/${s.key}`} className="text-xs text-blue-600 hover:underline">
                      Chi tiết
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
