/**
 * Break-even analysis — điểm hòa vốn.
 * Formula: Break-even DT = Chi phí cố định / (1 - Tỷ lệ giá vốn/DT)
 * Với biên gộp hiện tại, cần bao nhiêu DT/căn/tháng để hòa vốn.
 */
import { db } from "@/lib/db";
import { revenueReconciliations, accountingJournal, yearEndAccruals } from "@/lib/schema";
import { sql, and, gte, lte, ne } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtM = (n: number) => (n / 1_000_000).toFixed(0) + "M";

type SP = Promise<{ year?: string }>;

export default async function BreakEvenPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sp = await searchParams;
  const year = Number(sp.year) || 2025;
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  // DT không VAT
  const [rev] = await db.execute(sql`
    SELECT COALESCE(SUM(total_receivable_this_time), 0)::float8 as total,
      COUNT(DISTINCT product_id)::int as units
    FROM revenue_reconciliations
    WHERE reconciliation_date BETWEEN ${start} AND ${end}
  `) as any[];
  const dtGross = Number(rev?.total ?? 0);
  const dtNet = dtGross / 1.1;
  const units = Number(rev?.units ?? 0);

  // Giá vốn + OPEX từ classifier (accrual)
  const nkc = await db.execute(sql`
    SELECT category, COALESCE(SUM(amount), 0)::float8 as s
    FROM accounting_journal
    WHERE substr(entry_date,1,4) = ${String(year)}
      AND credit_account != '911'
      AND category IS NOT NULL
    GROUP BY category
  `) as any[];
  const catMap = new Map<string, number>();
  for (const r of nkc) catMap.set(r.category, Number(r.s));

  // Add trích trước
  if (year === 2025) {
    const [ac] = await db.execute(sql`
      SELECT COALESCE(SUM(hh_sale),0)::float8 hh, COALESCE(SUM(cdt_bonus_sale),0)::float8 cdt,
        COALESCE(SUM(cty_bonus_ql),0)::float8 ql, COALESCE(SUM(kpi_ceo),0)::float8 ceo,
        COALESCE(SUM(kpi_tpkd),0)::float8 tpkd, COALESCE(SUM(bonus_admin),0)::float8 adm,
        COALESCE(SUM(customer_support),0)::float8 ct
      FROM year_end_accruals
    `) as any[];
    const addTo = (k: string, v: number) => catMap.set(k, (catMap.get(k) ?? 0) + v);
    addTo("hh_sale", Number(ac.hh)); addTo("cdt_thuong_nvkd", Number(ac.cdt));
    addTo("cty_thuong_ql", Number(ac.ql)); addTo("cty_thuong_ceo", Number(ac.ceo));
    addTo("cty_thuong_tpkd", Number(ac.tpkd)); addTo("cty_thuong_admin", Number(ac.adm));
    addTo("ho_tro_khach", Number(ac.ct));
  }

  const get = (k: string) => catMap.get(k) ?? 0;
  const cogs = ["hh_sale","ho_tro_khach","cdt_thuong_nvkd","cdt_thuong_ql","cty_thuong_ql","cty_thuong_tpkd","cty_thuong_admin","cty_thuong_ceo"].reduce((s,k) => s+get(k), 0);
  const fixed = ["luong_nvkd","thuong_ds_sale","luong_admin","marketing","thue_vp","do_dung_vp","di_lai","tiep_khach","dich_vu_ngoai","thue_phi_le_phi","opex_khac"].reduce((s,k) => s+get(k), 0);

  const laiGop = dtNet - cogs;
  const laiThuan = laiGop - fixed;
  const cogsRate = dtNet > 0 ? cogs / dtNet : 0;
  const grossMarginRate = 1 - cogsRate;

  // Break-even DT (dồn tích): fixed / gross margin rate
  const breakEvenRev = grossMarginRate > 0 ? fixed / grossMarginRate : 0;
  const breakEvenUnits = units > 0 ? (breakEvenRev / dtNet) * units : 0;
  const breakEvenMonths = 12 / (units / breakEvenUnits > 0 ? units / breakEvenUnits : 1);

  // Runway / safety margin
  const marginOfSafety = dtNet > 0 ? ((dtNet - breakEvenRev) / dtNet) * 100 : 0;
  const avgRevPerUnit = units > 0 ? dtNet / units : 0;
  const avgUnitsPerMonth = units / 12;

  const years = [2024, 2025, 2026];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs"><Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link></div>
        <h1 className="text-2xl font-bold mt-1">Phân tích điểm hòa vốn</h1>
        <p className="text-sm text-slate-500 mt-1">
          Năm {year}. Cần bao nhiêu DT / căn / tháng để hòa vốn.
          Nguồn: NKC dồn tích + trích trước.
        </p>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 flex gap-2 text-xs">
        <span className="text-slate-500 mr-2">Năm:</span>
        {years.map((y) => (
          <Link key={y} href={`/reports/break-even?year=${y}`}
            className={`inline-block px-2 py-1 rounded ${y === year ? "bg-orange-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>{y}</Link>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card label="Doanh thu thực (không VAT)" value={fmt(dtNet)} sub={`${units} căn`} color="blue" />
        <Card label="Điểm hòa vốn (DT cần)" value={fmt(breakEvenRev)} sub={`≈ ${Math.round(breakEvenUnits)} căn`} color="orange" />
        <Card
          label="Biên an toàn (Margin of Safety)"
          value={`${marginOfSafety.toFixed(1)}%`}
          sub={marginOfSafety > 20 ? "🟢 An toàn" : marginOfSafety > 0 ? "🟡 Vừa hòa" : "🔴 Chưa hòa vốn"}
          color={marginOfSafety > 20 ? "green" : marginOfSafety > 0 ? "amber" : "red"}
        />
      </div>

      {/* Cost structure */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left p-2">Cơ cấu chi phí</th>
              <th className="text-right p-2">Số tiền</th>
              <th className="text-right p-2">% DT</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="p-2">Doanh thu không VAT</td>
              <td className="p-2 text-right tabular-nums font-semibold">{fmt(dtNet)}</td>
              <td className="p-2 text-right">100.0%</td>
            </tr>
            <tr className="border-t">
              <td className="p-2 text-red-700">(−) Giá vốn trực tiếp (biến phí)</td>
              <td className="p-2 text-right tabular-nums text-red-700">{fmt(cogs)}</td>
              <td className="p-2 text-right text-red-700">{(cogsRate * 100).toFixed(1)}%</td>
            </tr>
            <tr className="border-t bg-green-50 font-semibold">
              <td className="p-2 text-green-700">= Lãi gộp (Contribution)</td>
              <td className="p-2 text-right tabular-nums text-green-700">{fmt(laiGop)}</td>
              <td className="p-2 text-right text-green-700">{(grossMarginRate * 100).toFixed(1)}%</td>
            </tr>
            <tr className="border-t">
              <td className="p-2 text-red-700">(−) Chi phí cố định (fixed)</td>
              <td className="p-2 text-right tabular-nums text-red-700">{fmt(fixed)}</td>
              <td className="p-2 text-right text-red-700">{dtNet > 0 ? ((fixed / dtNet) * 100).toFixed(1) : "0"}%</td>
            </tr>
            <tr className="border-t-2 bg-blue-50 font-bold">
              <td className="p-2">= Lãi thuần</td>
              <td className={`p-2 text-right tabular-nums ${laiThuan >= 0 ? "text-blue-800" : "text-red-700"}`}>{fmt(laiThuan)}</td>
              <td className={`p-2 text-right ${laiThuan >= 0 ? "text-blue-800" : "text-red-700"}`}>{dtNet > 0 ? ((laiThuan / dtNet) * 100).toFixed(1) : "0"}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Analysis */}
      <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm space-y-2">
        <div className="font-semibold text-blue-900">📊 Phân tích:</div>
        <ul className="text-sm space-y-1 pl-4 list-disc text-slate-700">
          <li>Với biên gộp <b>{(grossMarginRate * 100).toFixed(1)}%</b>, mỗi 1đ DT sinh ra <b>{fmt(grossMarginRate * 1000)}đ</b>/1.000đ lãi gộp.</li>
          <li>Chi phí cố định năm {year}: <b>{fmt(fixed)}</b> — cần <b>{fmt(breakEvenRev)}</b> DT để hòa vốn.</li>
          <li>DT thực tế năm {year}: <b>{fmt(dtNet)}</b> — {dtNet >= breakEvenRev ? `vượt hòa vốn ${fmt(dtNet - breakEvenRev)}` : `còn thiếu ${fmt(breakEvenRev - dtNet)} để hòa vốn`}.</li>
          <li>TB {fmt(avgRevPerUnit)}/căn × {Math.round(breakEvenUnits)} căn = {fmt(breakEvenRev)} → cần chốt <b>{Math.round(breakEvenUnits)} căn/năm</b> để hòa vốn (~{(breakEvenUnits / 12).toFixed(1)} căn/tháng).</li>
          <li>Tốc độ hiện tại: <b>{avgUnitsPerMonth.toFixed(1)} căn/tháng</b> → {avgUnitsPerMonth >= breakEvenUnits / 12 ? "🟢 vượt điểm hòa vốn" : `🔴 cần tăng ${((breakEvenUnits / 12 - avgUnitsPerMonth) / avgUnitsPerMonth * 100).toFixed(0)}%`}.</li>
        </ul>
      </div>

      <div className="text-xs text-slate-500 italic">
        Công thức: Break-even DT = Chi phí cố định ÷ Biên gộp %. Cần user override /finance/nkc-review để bucket phân loại chính xác — số này ballpark.
      </div>
    </div>
  );
}

function Card({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const cls: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    orange: "bg-orange-50 border-orange-200 text-orange-800",
    green: "bg-green-50 border-green-200 text-green-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[color]}`}>
      <div className="text-[11px] uppercase tracking-wide font-semibold">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-80">{sub}</div>}
    </div>
  );
}
