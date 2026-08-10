/**
 * Expense analysis — chi phí theo bucket + theo tháng (heatmap).
 * Nguồn: accounting_journal (accrual) + year_end_accruals (kế toán breakdown).
 */
import { db } from "@/lib/db";
import { accountingJournal, yearEndAccruals, yearEndOtherAccruals } from "@/lib/schema";
import { sql, and, gte, lte, ne } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CATEGORIES, type CategoryKey } from "@/lib/transaction-classifier";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtM = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(0) + "M" : n >= 1_000 ? (n / 1_000).toFixed(0) + "K" : String(Math.round(n));

type SP = Promise<{ year?: string }>;

const EXPENSE_BUCKETS: CategoryKey[] = [
  // COGS (BC mục 2.x)
  "hh_sale", "ho_tro_khach", "cdt_thuong_nvkd", "cdt_thuong_ql",
  "cty_thuong_ql", "cty_thuong_tpkd", "cty_thuong_admin", "cty_thuong_ceo",
  // OPEX (BC mục 4.x)
  "luong_nvkd", "thuong_ds_sale", "luong_admin", "marketing",
  "thue_vp", "do_dung_vp", "di_lai", "tiep_khach", "dich_vu_ngoai", "thue_phi_le_phi", "opex_khac",
];

export default async function ExpenseAnalysisPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sp = await searchParams;
  const year = Number(sp.year) || 2025;

  // NKC actual per bucket per month
  const nkcRows = await db.execute(sql`
    SELECT
      category,
      substr(entry_date, 6, 2) AS month,
      COALESCE(SUM(amount), 0)::float8 AS total
    FROM accounting_journal
    WHERE substr(entry_date, 1, 4) = ${String(year)}
      AND credit_account != '911'
      AND category IS NOT NULL
    GROUP BY category, month
    ORDER BY category, month
  `) as any[];

  // Build matrix: bucket → month → amount
  const matrix = new Map<string, Map<string, number>>();
  for (const r of nkcRows) {
    const cat = r.category as string;
    if (!EXPENSE_BUCKETS.includes(cat as CategoryKey)) continue;
    if (!matrix.has(cat)) matrix.set(cat, new Map());
    matrix.get(cat)!.set(r.month, Number(r.total));
  }

  // Add year_end_accruals (chỉ vào T12)
  if (year === 2025) {
    const [ac] = await db
      .select({
        hh: sql<number>`coalesce(sum(hh_sale),0)::float8`,
        cdt: sql<number>`coalesce(sum(cdt_bonus_sale),0)::float8`,
        ql: sql<number>`coalesce(sum(cty_bonus_ql),0)::float8`,
        ceo: sql<number>`coalesce(sum(kpi_ceo),0)::float8`,
        tpkd: sql<number>`coalesce(sum(kpi_tpkd),0)::float8`,
        admin: sql<number>`coalesce(sum(bonus_admin),0)::float8`,
        hoTro: sql<number>`coalesce(sum(customer_support),0)::float8`,
      })
      .from(yearEndAccruals);
    const addYEA = (bucket: string, v: number) => {
      if (!matrix.has(bucket)) matrix.set(bucket, new Map());
      const m = matrix.get(bucket)!;
      m.set("12", (m.get("12") ?? 0) + v);
    };
    addYEA("hh_sale", Number(ac?.hh ?? 0));
    addYEA("cdt_thuong_nvkd", Number(ac?.cdt ?? 0));
    addYEA("cty_thuong_ql", Number(ac?.ql ?? 0));
    addYEA("cty_thuong_ceo", Number(ac?.ceo ?? 0));
    addYEA("cty_thuong_tpkd", Number(ac?.tpkd ?? 0));
    addYEA("cty_thuong_admin", Number(ac?.admin ?? 0));
    addYEA("ho_tro_khach", Number(ac?.hoTro ?? 0));

    const other = await db.select({ category: yearEndOtherAccruals.category, s: sql<number>`sum(amount)::float8` })
      .from(yearEndOtherAccruals).groupBy(yearEndOtherAccruals.category);
    for (const o of other) addYEA(o.category, Number(o.s));
  }

  // Bucket totals + month totals for coloring
  const months = ["01","02","03","04","05","06","07","08","09","10","11","12"];
  const monthTotals = new Map<string, number>();
  const bucketTotals = new Map<string, number>();
  let grandTotal = 0;
  for (const [bucket, monthMap] of matrix) {
    let bTotal = 0;
    for (const m of months) {
      const v = monthMap.get(m) ?? 0;
      bTotal += v;
      monthTotals.set(m, (monthTotals.get(m) ?? 0) + v);
    }
    bucketTotals.set(bucket, bTotal);
    grandTotal += bTotal;
  }

  // Sort buckets: COGS trước, OPEX sau, big-to-small trong nhóm
  const sortedBuckets = EXPENSE_BUCKETS
    .filter(b => (bucketTotals.get(b) ?? 0) > 0)
    .sort((a, b) => (bucketTotals.get(b) ?? 0) - (bucketTotals.get(a) ?? 0));

  const years = [2024, 2025, 2026];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs"><Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link></div>
        <h1 className="text-2xl font-bold mt-1">Phân tích chi phí</h1>
        <p className="text-sm text-slate-500 mt-1">Chi phí theo bucket × tháng. Năm {year}. Nguồn: NKC dồn tích + trích trước cuối kỳ.</p>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 flex gap-2 text-xs">
        <span className="text-slate-500 mr-2">Năm:</span>
        {years.map((y) => (
          <Link key={y} href={`/reports/expenses?year=${y}`}
            className={`inline-block px-2 py-1 rounded ${y === year ? "bg-orange-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>{y}</Link>
        ))}
      </div>

      {/* Heatmap-like table */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left p-2 sticky left-0 bg-card">Bucket (BC kế toán)</th>
              {months.map(m => <th key={m} className="text-right p-2 min-w-16">T{Number(m)}</th>)}
              <th className="text-right p-2 min-w-24 border-l border-slate-600">Tổng năm</th>
              <th className="text-right p-2 w-16">%</th>
            </tr>
          </thead>
          <tbody>
            {sortedBuckets.map(bucket => {
              const meta = CATEGORIES[bucket];
              const bTotal = bucketTotals.get(bucket) ?? 0;
              const bPct = grandTotal > 0 ? (bTotal / grandTotal) * 100 : 0;
              return (
                <tr key={bucket} className="border-t hover:bg-slate-50">
                  <td className="p-2 sticky left-0 bg-white">
                    <div className="font-medium">{meta?.label}</div>
                    {meta?.kimBc && <div className="text-[10px] text-slate-500">Mục {meta.kimBc}</div>}
                  </td>
                  {months.map(m => {
                    const v = matrix.get(bucket)?.get(m) ?? 0;
                    const monthTotal = monthTotals.get(m) ?? 0;
                    const intensity = monthTotal > 0 && v > 0 ? Math.min(1, v / monthTotal) : 0;
                    const bg = intensity > 0.3 ? "bg-orange-100" : intensity > 0.1 ? "bg-orange-50" : "";
                    return (
                      <td key={m} className={`p-2 text-right tabular-nums ${bg}`}>
                        {v > 0 ? fmtM(v) : ""}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right tabular-nums font-semibold border-l">{fmt(bTotal)}</td>
                  <td className="p-2 text-right text-slate-500">{bPct.toFixed(1)}%</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
              <td className="p-2 sticky left-0 bg-slate-100">TỔNG</td>
              {months.map(m => (
                <td key={m} className="p-2 text-right tabular-nums">{fmtM(monthTotals.get(m) ?? 0)}</td>
              ))}
              <td className="p-2 text-right tabular-nums border-l">{fmt(grandTotal)}</td>
              <td className="p-2 text-right">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 italic">
        Ô đậm hơn = chi phí lớn trong tháng đó. Giúp phát hiện chi phí đột biến / tháng bận rộn.
      </div>
    </div>
  );
}
