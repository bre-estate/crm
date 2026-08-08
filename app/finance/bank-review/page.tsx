import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { and, sql, ilike, gte, lte, eq, desc, type SQL } from "drizzle-orm";
import Link from "next/link";
import { CATEGORIES } from "@/lib/transaction-classifier";
import { CategorySelect } from "./CategorySelect";
import { rerunClassifier } from "./actions";

export const dynamic = "force-dynamic";

type SP = Promise<{ category?: string; q?: string; year?: string; source?: string }>;

const fmt = (n: number | null) => n == null ? "" : Math.round(Math.abs(n)).toLocaleString("vi-VN");

export default async function BankReviewPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("finance");
  const sp = await searchParams;
  const filterCat = sp.category?.trim() || null;
  const filterQ = sp.q?.trim() || null;
  const filterYear = sp.year?.trim() || "2025";
  const filterSource = sp.source?.trim() || null; // 'auto' | 'manual' | null

  const where: SQL[] = [];
  if (filterCat) where.push(eq(bankTransactions.category, filterCat));
  if (filterQ) where.push(ilike(bankTransactions.description, `%${filterQ}%`));
  if (filterYear && filterYear !== "all") {
    where.push(gte(bankTransactions.transactionDate, `${filterYear}-01-01`));
    where.push(lte(bankTransactions.transactionDate, `${filterYear}-12-31`));
  }
  if (filterSource) where.push(eq(bankTransactions.categorySource, filterSource));

  const whereSql = where.length ? and(...where) : undefined;

  // Breakdown per category (respecting current filters except category itself)
  const breakdownWhere: SQL[] = [];
  if (filterQ) breakdownWhere.push(ilike(bankTransactions.description, `%${filterQ}%`));
  if (filterYear && filterYear !== "all") {
    breakdownWhere.push(gte(bankTransactions.transactionDate, `${filterYear}-01-01`));
    breakdownWhere.push(lte(bankTransactions.transactionDate, `${filterYear}-12-31`));
  }
  const breakdown = await db
    .select({
      category: bankTransactions.category,
      cnt: sql<number>`count(*)::int`,
      total: sql<number>`(coalesce(sum(abs(debit_amount)), 0) + coalesce(sum(credit_amount), 0))::float8`,
    })
    .from(bankTransactions)
    .where(breakdownWhere.length ? and(...breakdownWhere) : undefined)
    .groupBy(bankTransactions.category);

  const rows = await db.select({
      id: bankTransactions.id,
      transactionDate: bankTransactions.transactionDate,
      debitAmount: bankTransactions.debitAmount,
      creditAmount: bankTransactions.creditAmount,
      description: bankTransactions.description,
      partnerName: bankTransactions.partnerName,
      category: bankTransactions.category,
      categorySource: bankTransactions.categorySource,
      categoryConfidence: bankTransactions.categoryConfidence,
    })
    .from(bankTransactions)
    .where(whereSql)
    .orderBy(desc(bankTransactions.transactionDate))
    .limit(500);

  const totalRows = (await db.select({ n: sql<number>`count(*)::int` })
    .from(bankTransactions).where(whereSql))[0]?.n ?? 0;

  const linkParams = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    if (filterYear) q.set("year", filterYear);
    if (filterCat) q.set("category", filterCat);
    if (filterQ) q.set("q", filterQ);
    if (filterSource) q.set("source", filterSource);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) q.delete(k); else q.set(k, v);
    }
    return `/finance/bank-review?${q}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Đối chiếu sao kê bank</h1>
        <p className="text-sm text-slate-500 mt-1">
          Phân loại 32 bucket khớp Kim BC. Chọn bucket sai → dropdown chỉnh tay (auto lưu). Filter chua_phan_loai / opex_khac / khac_thu để dò dần.
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
          <label className="block text-slate-500 mb-1">Nguồn</label>
          <select name="source" defaultValue={filterSource ?? ""} className="input">
            <option value="">Tất cả</option>
            <option value="auto">Auto</option>
            <option value="manual">Chỉnh tay</option>
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-slate-500 mb-1">Tìm mô tả</label>
          <input name="q" defaultValue={filterQ ?? ""} placeholder="VD: hoa hong, quang cao, YCTV..." className="input w-full" />
        </div>
        <button type="submit" className="bg-orange-500 text-white px-3 py-1.5 rounded hover:bg-orange-600">Lọc</button>
        <Link href="/finance/bank-review" className="border px-3 py-1.5 rounded hover:bg-slate-50">Reset</Link>
        <form action={async () => { "use server"; await rerunClassifier(); }} className="ml-auto">
          <button type="submit" className="text-xs border px-2 py-1.5 rounded hover:bg-slate-50">↻ Chạy lại auto-classify (không đụng manual)</button>
        </form>
      </form>

      {/* Breakdown per bucket */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3">
        <div className="text-xs text-slate-500 mb-2">Tổng theo bucket ({filterYear === "all" ? "tất cả" : filterYear}):</div>
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
                <Link
                  key={b.category ?? "null"}
                  href={linkParams({ category: active ? null : (b.category ?? null) })}
                  className={`px-2 py-1 rounded ${cls}`}
                >
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
          Hiển thị {rows.length} / {totalRows.toLocaleString("vi-VN")} rows
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="text-left p-2">Ngày</th>
              <th className="text-right p-2">Vào</th>
              <th className="text-right p-2">Ra</th>
              <th className="text-left p-2">Mô tả</th>
              <th className="text-left p-2">Đối tác</th>
              <th className="text-left p-2 w-56">Bucket</th>
              <th className="text-center p-2 w-16">Auto?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="p-2 whitespace-nowrap">{r.transactionDate?.slice(0, 10)}</td>
                <td className="p-2 text-right tabular-nums text-green-700">{r.creditAmount ? fmt(r.creditAmount) : ""}</td>
                <td className="p-2 text-right tabular-nums text-red-700">{r.debitAmount ? fmt(r.debitAmount) : ""}</td>
                <td className="p-2 max-w-md truncate" title={r.description ?? ""}>{r.description}</td>
                <td className="p-2 text-slate-500 truncate max-w-32" title={r.partnerName ?? ""}>{r.partnerName}</td>
                <td className="p-2"><CategorySelect id={r.id} value={r.category} source={r.categorySource} /></td>
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
    </div>
  );
}
