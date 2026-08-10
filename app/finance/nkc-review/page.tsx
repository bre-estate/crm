/**
 * Đối chiếu sổ NKC (accounting_journal) — cho phép user override classify từng row.
 * Show tổng theo bucket + so sánh với báo cáo kế toán 2025 để user thấy chênh cụ thể.
 * Nguồn: sổ nhật ký chung + trích trước cuối kỳ (year_end_accruals).
 */
import { db } from "@/lib/db";
import { accountingJournal, yearEndAccruals, yearEndOtherAccruals } from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { and, sql, ilike, gte, lte, eq, desc, ne, type SQL } from "drizzle-orm";
import Link from "next/link";
import { CATEGORIES } from "@/lib/transaction-classifier";
import { NkcCategorySelect } from "./NkcCategorySelect";
import { rerunNkcClassifier } from "./actions";

export const dynamic = "force-dynamic";

type SP = Promise<{ category?: string; q?: string; year?: string; source?: string; tk?: string }>;

const fmt = (n: number | null) => n == null ? "" : Math.round(n).toLocaleString("vi-VN");

// BC kế toán target (dồn tích) 2025 để so
const KIM_BC_2025: Record<string, number> = {
  hh_sale: 1794473527,
  ho_tro_khach: 83539517,
  cdt_thuong_nvkd: 578636363,
  cdt_thuong_ql: 20000000,
  cty_thuong_ql: 165000000,
  cty_thuong_tpkd: 52040296,
  cty_thuong_admin: 7958743,
  cty_thuong_ceo: 122971840,
  luong_nvkd: 345221721,
  thuong_ds_sale: 83981270,
  luong_admin: 348473123,
  marketing: 192330000,
};

export default async function NkcReviewPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("finance");
  const sp = await searchParams;
  const filterCat = sp.category?.trim() || null;
  const filterQ = sp.q?.trim() || null;
  const filterYear = sp.year?.trim() || "2025";
  const filterSource = sp.source?.trim() || null;
  const filterTk = sp.tk?.trim() || null;

  const where: SQL[] = [];
  where.push(ne(accountingJournal.creditAccount, "911"));
  if (filterCat) where.push(eq(accountingJournal.category, filterCat));
  if (filterQ) where.push(ilike(accountingJournal.description, `%${filterQ}%`));
  if (filterYear && filterYear !== "all") {
    where.push(gte(accountingJournal.entryDate, `${filterYear}-01-01`));
    where.push(lte(accountingJournal.entryDate, `${filterYear}-12-31`));
  }
  if (filterSource) where.push(eq(accountingJournal.categorySource, filterSource));
  if (filterTk) where.push(eq(accountingJournal.debitAccount, filterTk));

  const whereSql = and(...where);

  // Breakdown per bucket từ NKC (year filter, không filter bucket)
  const breakdownWhere: SQL[] = [ne(accountingJournal.creditAccount, "911")];
  if (filterYear && filterYear !== "all") {
    breakdownWhere.push(gte(accountingJournal.entryDate, `${filterYear}-01-01`));
    breakdownWhere.push(lte(accountingJournal.entryDate, `${filterYear}-12-31`));
  }
  if (filterQ) breakdownWhere.push(ilike(accountingJournal.description, `%${filterQ}%`));
  const breakdown = await db
    .select({
      category: accountingJournal.category,
      cnt: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(amount),0)::float8`,
    })
    .from(accountingJournal)
    .where(and(...breakdownWhere))
    .groupBy(accountingJournal.category);

  // Sum year_end_accruals per bucket (chỉ 2025)
  const yeaMap = new Map<string, number>();
  if (filterYear === "2025" || !filterYear) {
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
    yeaMap.set("hh_sale", Number(ac?.hh ?? 0));
    yeaMap.set("cdt_thuong_nvkd", Number(ac?.cdt ?? 0));
    yeaMap.set("cty_thuong_ql", Number(ac?.ql ?? 0));
    yeaMap.set("cty_thuong_ceo", Number(ac?.ceo ?? 0));
    yeaMap.set("cty_thuong_tpkd", Number(ac?.tpkd ?? 0));
    yeaMap.set("cty_thuong_admin", Number(ac?.admin ?? 0));
    yeaMap.set("ho_tro_khach", Number(ac?.hoTro ?? 0));
    const other = await db.select({ category: yearEndOtherAccruals.category, s: sql<number>`sum(amount)::float8` })
      .from(yearEndOtherAccruals).groupBy(yearEndOtherAccruals.category);
    for (const o of other) yeaMap.set(o.category, (yeaMap.get(o.category) ?? 0) + Number(o.s));
  }

  const rows = await db.select({
      id: accountingJournal.id,
      entryDate: accountingJournal.entryDate,
      debitAccount: accountingJournal.debitAccount,
      creditAccount: accountingJournal.creditAccount,
      amount: accountingJournal.amount,
      description: accountingJournal.description,
      category: accountingJournal.category,
      categorySource: accountingJournal.categorySource,
      categoryConfidence: accountingJournal.categoryConfidence,
    })
    .from(accountingJournal)
    .where(whereSql)
    .orderBy(desc(accountingJournal.amount))
    .limit(500);

  const [totalCount] = await db.select({ n: sql<number>`count(*)::int` })
    .from(accountingJournal).where(whereSql);
  const totalRows = totalCount?.n ?? 0;

  const linkParams = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    if (filterYear) q.set("year", filterYear);
    if (filterCat) q.set("category", filterCat);
    if (filterQ) q.set("q", filterQ);
    if (filterSource) q.set("source", filterSource);
    if (filterTk) q.set("tk", filterTk);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) q.delete(k); else q.set(k, v);
    }
    return `/finance/nkc-review?${q}`;
  };

  // TK options từ data
  const tkList = await db.selectDistinct({ tk: accountingJournal.debitAccount })
    .from(accountingJournal)
    .where(filterYear === "all" ? undefined : and(
      gte(accountingJournal.entryDate, `${filterYear}-01-01`),
      lte(accountingJournal.entryDate, `${filterYear}-12-31`),
    ));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Đối chiếu sổ NKC</h1>
        <p className="text-sm text-slate-500 mt-1">
          Rà từng row sổ NKC, chỉnh bucket sai để P&L khớp báo cáo kế toán 100%.
          Cột "BC kế toán" hiển thị số benchmark → so app thấy chênh bao nhiêu.
        </p>
      </div>

      {/* Filter */}
      <form className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 flex flex-wrap gap-3 items-end text-xs">
        <div>
          <label className="block text-slate-500 mb-1">Năm</label>
          <select name="year" defaultValue={filterYear} className="input min-w-24">
            <option value="all">Tất cả</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>
        </div>
        <div>
          <label className="block text-slate-500 mb-1">Bucket</label>
          <select name="category" defaultValue={filterCat ?? ""} className="input min-w-48">
            <option value="">Tất cả</option>
            {Object.values(CATEGORIES).map(c => (
              <option key={c.key} value={c.key}>{c.kimBc ? c.kimBc + " " : ""}{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-slate-500 mb-1">TK debit</label>
          <select name="tk" defaultValue={filterTk ?? ""} className="input">
            <option value="">Tất cả</option>
            {tkList.filter(t => t.tk).map(t => (
              <option key={t.tk} value={t.tk}>{t.tk}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-slate-500 mb-1">Nguồn</label>
          <select name="source" defaultValue={filterSource ?? ""} className="input">
            <option value="">Tất cả</option>
            <option value="auto">Auto</option>
            <option value="manual">Chỉnh tay</option>
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-slate-500 mb-1">Tìm mô tả</label>
          <input name="q" defaultValue={filterQ ?? ""} placeholder="VD: thưởng nóng, KPI QL..." className="input w-full" />
        </div>
        <button type="submit" className="bg-orange-500 text-white px-3 py-1.5 rounded hover:bg-orange-600">Lọc</button>
        <Link href="/finance/nkc-review" className="border px-3 py-1.5 rounded hover:bg-slate-50">Reset</Link>
        <form action={async () => { "use server"; await rerunNkcClassifier(); }} className="ml-auto">
          <button type="submit" className="text-xs border px-2 py-1.5 rounded hover:bg-slate-50">↻ Chạy lại classifier (không đụng manual)</button>
        </form>
      </form>

      {/* Compare BC kế toán 2025 per bucket */}
      {filterYear === "2025" && (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3">
          <div className="text-xs text-slate-500 mb-2">So sánh App (NKC + trích trước) vs Báo cáo kế toán 2025:</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-1.5">Bucket</th>
                  <th className="text-right p-1.5">NKC actual</th>
                  <th className="text-right p-1.5">Trích trước</th>
                  <th className="text-right p-1.5">App tổng</th>
                  <th className="text-right p-1.5">BC kế toán</th>
                  <th className="text-right p-1.5">Chênh</th>
                  <th className="text-center p-1.5">Match?</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(KIM_BC_2025).map(([key, kim]) => {
                  const nkc = Number(breakdown.find(b => b.category === key)?.total ?? 0);
                  const yea = yeaMap.get(key) ?? 0;
                  const em = nkc + yea;
                  const diff = em - kim;
                  const pct = kim > 0 ? Math.abs(diff / kim) : 0;
                  const mark = pct < 0.01 ? "✅" : pct < 0.05 ? "⚠️" : "❌";
                  const meta = CATEGORIES[key as keyof typeof CATEGORIES];
                  return (
                    <tr key={key} className="border-t hover:bg-slate-50">
                      <td className="p-1.5">{meta?.kimBc} {meta?.label}</td>
                      <td className="p-1.5 text-right tabular-nums">{fmt(nkc)}</td>
                      <td className="p-1.5 text-right tabular-nums text-slate-500">{yea > 0 ? fmt(yea) : ""}</td>
                      <td className="p-1.5 text-right tabular-nums font-semibold">{fmt(em)}</td>
                      <td className="p-1.5 text-right tabular-nums text-slate-600">{fmt(kim)}</td>
                      <td className={`p-1.5 text-right tabular-nums ${Math.abs(diff) < 1000 ? "text-slate-400" : diff > 0 ? "text-red-600" : "text-orange-600"}`}>
                        {diff === 0 ? "-" : (diff > 0 ? "+" : "") + fmt(diff)}
                      </td>
                      <td className="p-1.5 text-center">{mark}</td>
                      <td className="p-1.5">
                        <Link href={linkParams({ category: key })} className="text-blue-600 hover:underline text-[10px]">
                          Xem rows →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Breakdown per bucket (chips) */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3">
        <div className="text-xs text-slate-500 mb-2">Chips theo bucket (chỉ NKC, không gồm trích trước):</div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {breakdown
            .sort((a, b) => Number(b.total) - Number(a.total))
            .map(b => {
              const meta = CATEGORIES[(b.category ?? "chua_phan_loai") as keyof typeof CATEGORIES];
              const active = filterCat === b.category;
              const cls = active
                ? "bg-orange-500 text-white"
                : meta?.group === "unknown" ? "bg-red-100 text-red-800 hover:bg-red-200"
                : meta?.group === "inflow" ? "bg-green-50 hover:bg-green-100"
                : meta?.group === "non_pnl" ? "bg-slate-100 hover:bg-slate-200"
                : "bg-slate-50 hover:bg-slate-100";
              return (
                <Link key={b.category ?? "null"}
                  href={linkParams({ category: active ? null : (b.category ?? null) })}
                  className={`px-2 py-1 rounded ${cls}`}>
                  {meta?.label ?? b.category ?? "(null)"}
                  <span className="ml-1 opacity-60">{b.cnt} · {fmt(Number(b.total))}</span>
                </Link>
              );
            })}
        </div>
      </div>

      {/* Rows */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <div className="p-3 text-xs text-slate-500 border-b">
          Hiển thị {rows.length} / {totalRows.toLocaleString("vi-VN")} rows (sắp theo số tiền giảm dần)
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="text-left p-2">Ngày</th>
              <th className="text-center p-2">TK Nợ/Có</th>
              <th className="text-right p-2">Số tiền</th>
              <th className="text-left p-2">Mô tả</th>
              <th className="text-left p-2 w-56">Bucket</th>
              <th className="text-center p-2 w-16">Nguồn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="p-2 whitespace-nowrap">{r.entryDate}</td>
                <td className="p-2 text-center text-slate-500">
                  <span className="font-mono">{r.debitAccount}</span>
                  <span className="text-slate-400 mx-1">/</span>
                  <span className="font-mono">{r.creditAccount}</span>
                </td>
                <td className="p-2 text-right tabular-nums">{fmt(Number(r.amount))}</td>
                <td className="p-2 max-w-md" title={r.description ?? ""}>{r.description}</td>
                <td className="p-2"><NkcCategorySelect id={r.id} value={r.category} source={r.categorySource} /></td>
                <td className="p-2 text-center text-[10px]">
                  {r.categorySource === "manual"
                    ? <span title="Đã chỉnh tay">✋</span>
                    : <span className="text-slate-400" title={`Auto ${r.categoryConfidence ?? 0}%`}>{r.categoryConfidence ?? 0}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 italic space-y-1">
        <p>💡 App = NKC actual + trích trước (year_end_accruals). Trích trước không hiện trong list này vì đã import riêng từ file kế toán.</p>
        <p>💡 Chỉnh bucket 1 row → cột "Chênh" cập nhật real-time. Mục tiêu: mọi row ✅.</p>
      </div>
    </div>
  );
}
