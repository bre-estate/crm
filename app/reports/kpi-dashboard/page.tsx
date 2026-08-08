/**
 * KPI Dashboard — 1 trang tổng hợp cho lãnh đạo.
 * Aggregate số từ tất cả reports Phase 1+2.
 */
import { db } from "@/lib/db";
import {
  revenueReconciliations, costReconciliations, paymentsIn, paymentsOut,
  accountingJournal, yearEndAccruals, bankTransactions, trialBalance,
} from "@/lib/schema";
import { sql, and, gte, lte, eq, ne, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtM = (n: number) => Math.abs(n) >= 1_000_000_000 ? (n / 1_000_000_000).toFixed(1) + " tỷ" : (n / 1_000_000).toFixed(0) + "M";

type SP = Promise<{ year?: string }>;

export default async function KpiDashboardPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sp = await searchParams;
  const year = Number(sp.year) || 2025;
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  // 1) DOANH THU YTD (từ BCDT)
  const [rev] = await db.execute(sql`
    SELECT COALESCE(SUM(total_receivable_this_time), 0)::float8 as total,
      COUNT(DISTINCT product_id)::int as units
    FROM revenue_reconciliations WHERE reconciliation_date BETWEEN ${start} AND ${end}
  `) as any[];
  const dtGross = Number(rev?.total ?? 0);
  const dtNet = dtGross / 1.1;
  const units = Number(rev?.units ?? 0);

  // 2) DT tháng này
  const [revMonth] = await db.execute(sql`
    SELECT COALESCE(SUM(total_receivable_this_time), 0)::float8 as total,
      COUNT(DISTINCT product_id)::int as units
    FROM revenue_reconciliations WHERE substr(reconciliation_date,1,7) = ${currentMonth}
  `) as any[];

  // 3) Giá vốn + OPEX từ classifier (accrual)
  const nkcRows = await db.execute(sql`
    SELECT category, COALESCE(SUM(amount), 0)::float8 as s
    FROM accounting_journal
    WHERE substr(entry_date,1,4) = ${String(year)} AND credit_account != '911' AND category IS NOT NULL
    GROUP BY category
  `) as any[];
  const catMap = new Map<string, number>();
  for (const r of nkcRows) catMap.set(r.category, Number(r.s));

  if (year === 2025) {
    const [ac] = await db.execute(sql`
      SELECT COALESCE(SUM(hh_sale),0)::float8 hh, COALESCE(SUM(cdt_bonus_sale),0)::float8 cdt,
        COALESCE(SUM(cty_bonus_ql),0)::float8 ql, COALESCE(SUM(kpi_ceo),0)::float8 ceo,
        COALESCE(SUM(kpi_tpkd),0)::float8 tpkd, COALESCE(SUM(bonus_admin),0)::float8 adm,
        COALESCE(SUM(customer_support),0)::float8 ct FROM year_end_accruals
    `) as any[];
    const add = (k: string, v: number) => catMap.set(k, (catMap.get(k) ?? 0) + v);
    add("hh_sale", Number(ac.hh)); add("cdt_thuong_nvkd", Number(ac.cdt));
    add("cty_thuong_ql", Number(ac.ql)); add("cty_thuong_ceo", Number(ac.ceo));
    add("cty_thuong_tpkd", Number(ac.tpkd)); add("cty_thuong_admin", Number(ac.adm));
    add("ho_tro_khach", Number(ac.ct));
  }
  const get = (k: string) => catMap.get(k) ?? 0;
  const cogs = ["hh_sale","ho_tro_khach","cdt_thuong_nvkd","cdt_thuong_ql","cty_thuong_ql","cty_thuong_tpkd","cty_thuong_admin","cty_thuong_ceo"].reduce((s,k) => s+get(k), 0);
  const opex = ["luong_nvkd","thuong_ds_sale","luong_admin","marketing","thue_vp","do_dung_vp","di_lai","tiep_khach","dich_vu_ngoai","thue_phi_le_phi","opex_khac"].reduce((s,k) => s+get(k), 0);
  const laiGop = dtNet - cogs;
  const laiThuan = laiGop - opex;
  const bienGop = dtNet > 0 ? (laiGop / dtNet) * 100 : 0;
  const bienRong = dtNet > 0 ? (laiThuan / dtNet) * 100 : 0;

  // 4) Tiền mặt (từ trial_balance)
  const [cash] = await db.execute(sql`
    SELECT COALESCE(SUM(closing_debit - closing_credit), 0)::float8 as s
    FROM trial_balance
    WHERE period_end = ${year + '-12-31'} AND (account_code = '111' OR account_code = '112')
  `) as any[];
  const cashBalance = Number(cash?.s ?? 0);

  // 5) Runway = cashBalance / avg monthly opex
  const monthlyOpex = opex / 12;
  const runway = monthlyOpex > 0 ? cashBalance / monthlyOpex : 0;

  // 6) Còn thu / Còn nợ
  const [pin] = await db.select({ s: sql<number>`coalesce(sum(amount),0)::float8` }).from(paymentsIn);
  const stillReceivable = Math.max(0, dtGross - Number(pin?.s ?? 0));
  const [costAll] = await db
    .select({ s: sql<number>`coalesce(sum(${costReconciliations.amountPayableThisTime}),0)::float8` })
    .from(costReconciliations)
    .where(and(gte(costReconciliations.reconciliationDate, start), lte(costReconciliations.reconciliationDate, end)));
  const [pout] = await db.select({ s: sql<number>`coalesce(sum(amount),0)::float8` }).from(paymentsOut);
  const owedSale = Math.max(0, Number(costAll?.s ?? 0) - Number(pout?.s ?? 0));

  // 7) Top 3 sale + Top 3 dự án + Top 3 CĐT
  const topSale = await db.execute(sql`
    SELECT p.sales_person as name, COALESCE(SUM(r.total_receivable_this_time), 0)::float8 as rev
    FROM revenue_reconciliations r JOIN products p ON p.id = r.product_id
    WHERE r.reconciliation_date BETWEEN ${start} AND ${end} AND p.sales_person IS NOT NULL
    GROUP BY p.sales_person ORDER BY rev DESC LIMIT 3
  `) as any[];
  const topProject = await db.execute(sql`
    SELECT pj.name, COALESCE(SUM(r.total_receivable_this_time), 0)::float8 as rev
    FROM revenue_reconciliations r JOIN products p ON p.id = r.product_id JOIN projects pj ON pj.id = p.project_id
    WHERE r.reconciliation_date BETWEEN ${start} AND ${end}
    GROUP BY pj.name ORDER BY rev DESC LIMIT 3
  `) as any[];

  const years = [2024, 2025, 2026];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs"><Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link></div>
        <h1 className="text-2xl font-bold mt-1">Bảng điều khiển KPI</h1>
        <p className="text-sm text-slate-500 mt-1">Tổng hợp các chỉ số quan trọng cho lãnh đạo. Năm {year}.</p>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 flex gap-2 text-xs">
        <span className="text-slate-500 mr-2">Năm:</span>
        {years.map((y) => (
          <Link key={y} href={`/reports/kpi-dashboard?year=${y}`}
            className={`inline-block px-2 py-1 rounded ${y === year ? "bg-orange-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>{y}</Link>
        ))}
      </div>

      {/* Row 1: Cash + Runway + Revenue this month */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <BigCard label="💰 Tiền mặt cuối kỳ" value={fmt(cashBalance)} sub="TK 111 + 112" color="green" link="/reports/balance-sheet" />
        <BigCard
          label="⏱️ Runway"
          value={`${runway.toFixed(1)} tháng`}
          sub={`OPEX TB ${fmtM(monthlyOpex)}/tháng`}
          color={runway > 6 ? "green" : runway > 3 ? "amber" : "red"}
        />
        <BigCard label={`📈 DT ${currentMonth}`} value={fmt(Number(revMonth?.total ?? 0))} sub={`${revMonth?.units ?? 0} căn`} color="blue" link="/reports/sales" />
        <BigCard label={`📈 DT YTD ${year}`} value={fmt(dtGross)} sub={`${units} căn`} color="blue" link="/reports/sales" />
      </div>

      {/* Row 2: P&L snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Lãi gộp" value={fmt(laiGop)} sub={`Biên ${bienGop.toFixed(1)}%`} color={laiGop >= 0 ? "green" : "red"} />
        <MetricCard label="Lãi thuần" value={fmt(laiThuan)} sub={`Biên ${bienRong.toFixed(1)}%`} color={laiThuan >= 0 ? "green" : "red"} />
        <MetricCard label="Còn thu CĐT" value={fmt(stillReceivable)} sub="→ AR aging" color="orange" link="/reports/ar-aging" />
        <MetricCard label="Còn nợ sale" value={fmt(owedSale)} sub="→ AP aging" color="red" link="/reports/ap-aging" />
      </div>

      {/* Top rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <div className="bg-slate-800 text-white p-3 font-bold text-sm">🏆 Top 3 nhân viên (DT YTD)</div>
          <table className="w-full text-sm">
            <tbody>
              {topSale.map((s: any, i: number) => (
                <tr key={i} className="border-t">
                  <td className="p-2">
                    <span className="text-xs text-slate-500 mr-2">#{i+1}</span>
                    <span className="font-medium">{s.name}</span>
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmt(Number(s.rev))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <div className="bg-slate-800 text-white p-3 font-bold text-sm">🏗️ Top 3 dự án (DT YTD)</div>
          <table className="w-full text-sm">
            <tbody>
              {topProject.map((p: any, i: number) => (
                <tr key={i} className="border-t">
                  <td className="p-2">
                    <span className="text-xs text-slate-500 mr-2">#{i+1}</span>
                    <span className="font-medium">{p.name}</span>
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmt(Number(p.rev))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick links */}
      <div className="bg-slate-50 rounded-xl p-4">
        <div className="text-sm font-semibold mb-2">Đi tới báo cáo chi tiết:</div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/reports/profit-detail" className="bg-white border rounded px-3 py-1.5 hover:bg-slate-100">Lãi/lỗ chi tiết →</Link>
          <Link href="/reports/cash-flow" className="bg-white border rounded px-3 py-1.5 hover:bg-slate-100">Dòng tiền →</Link>
          <Link href="/reports/sales" className="bg-white border rounded px-3 py-1.5 hover:bg-slate-100">Bán hàng →</Link>
          <Link href="/reports/commissions" className="bg-white border rounded px-3 py-1.5 hover:bg-slate-100">Hoa hồng →</Link>
          <Link href="/reports/project-profitability" className="bg-white border rounded px-3 py-1.5 hover:bg-slate-100">Lãi/lỗ dự án →</Link>
          <Link href="/reports/expenses" className="bg-white border rounded px-3 py-1.5 hover:bg-slate-100">Phân tích CP →</Link>
          <Link href="/reports/break-even" className="bg-white border rounded px-3 py-1.5 hover:bg-slate-100">Hòa vốn →</Link>
          <Link href="/reports/balance-sheet" className="bg-white border rounded px-3 py-1.5 hover:bg-slate-100">Bảng cân đối →</Link>
        </div>
      </div>
    </div>
  );
}

function BigCard({ label, value, sub, color, link }: { label: string; value: string; sub?: string; color: string; link?: string }) {
  const cls: Record<string, string> = {
    green: "bg-green-50 border-green-300",
    amber: "bg-amber-50 border-amber-300",
    red: "bg-red-50 border-red-300",
    blue: "bg-blue-50 border-blue-300",
  };
  const inner = (
    <div className={`rounded-xl border-2 p-4 ${cls[color]} ${link ? "hover:shadow-md transition" : ""}`}>
      <div className="text-xs uppercase font-semibold text-slate-600">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
  return link ? <Link href={link}>{inner}</Link> : inner;
}
function MetricCard({ label, value, sub, color, link }: { label: string; value: string; sub?: string; color: string; link?: string }) {
  const cls: Record<string, string> = {
    green: "bg-green-50 border-green-200",
    red: "bg-red-50 border-red-200",
    orange: "bg-orange-50 border-orange-200",
    blue: "bg-blue-50 border-blue-200",
  };
  const inner = (
    <div className={`rounded-xl border p-3 ${cls[color]} ${link ? "hover:shadow-sm transition" : ""}`}>
      <div className="text-xs uppercase font-semibold text-slate-600">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
  return link ? <Link href={link}>{inner}</Link> : inner;
}
