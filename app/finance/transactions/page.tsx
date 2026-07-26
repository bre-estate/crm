import { db } from "@/lib/db";
import { financialTransactions, accountingCategories } from "@/lib/schema";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { desc, and, eq, gte, lte, ilike, sql, type SQL } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  month?: string;
  category?: string;
  payer?: string;
  q?: string;
}>;

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const owner = await getOwnerEmail();
  if (!owner) notFound();
  const sp = await searchParams;
  const filterMonth = sp.month?.trim() || null;
  const filterCat = sp.category?.trim() || null;
  const filterPayer = sp.payer?.trim() || null;
  const q = sp.q?.trim() || null;

  const where: SQL[] = [];
  if (filterMonth) where.push(eq(financialTransactions.transactionMonth, filterMonth));
  if (filterCat) where.push(eq(financialTransactions.categoryCode, filterCat));
  if (filterPayer) where.push(eq(financialTransactions.payer, filterPayer));
  if (q) where.push(ilike(financialTransactions.description, `%${q}%`));

  const rows = await db
    .select({
      id: financialTransactions.id,
      transactionDate: financialTransactions.transactionDate,
      transactionMonth: financialTransactions.transactionMonth,
      description: financialTransactions.description,
      amount: financialTransactions.amount,
      categoryCode: financialTransactions.categoryCode,
      managementGroup: financialTransactions.managementGroup,
      payer: financialTransactions.payer,
      recipient: financialTransactions.recipient,
      hasInvoice: financialTransactions.hasInvoice,
      sourceFile: financialTransactions.sourceFile,
      note: financialTransactions.note,
    })
    .from(financialTransactions)
    .where(where.length === 0 ? undefined : where.length === 1 ? where[0] : and(...where))
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.id))
    .limit(1000);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  // Totals for stat cards (unfiltered — for context)
  const [statAll] = await db
    .select({
      n: sql<number>`count(*)::int`,
      sum: sql<number>`coalesce(sum(amount),0)`,
    })
    .from(financialTransactions);

  const catRows = await db
    .select({
      code: accountingCategories.code,
      name: accountingCategories.name,
      groupName: accountingCategories.groupName,
    })
    .from(accountingCategories)
    .orderBy(accountingCategories.displayOrder);
  const catByCode = new Map(catRows.map((c) => [c.code, c]));

  // Distinct months + payers cho filter dropdown
  const distinctMonths = await db
    .selectDistinct({ m: financialTransactions.transactionMonth })
    .from(financialTransactions);
  const monthOptions = distinctMonths.map((r) => r.m).sort().reverse();
  const distinctPayers = await db
    .selectDistinct({ p: financialTransactions.payer })
    .from(financialTransactions);
  const payerOptions = distinctPayers.map((r) => r.p).filter((p): p is string => !!p);

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Giao dịch tài chính</h1>
          <p className="text-sm text-slate-500 mt-1">
            {statAll.n} giao dịch, tổng {fmt(statAll.sum)} VND. Hiển thị{" "}
            {rows.length} rows (giới hạn 1000).
          </p>
        </div>
        <Link
          href="/finance/import"
          className="bg-orange-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-orange-600"
        >
          + Import Excel
        </Link>
      </div>

      <form className="bg-white border border-slate-200 rounded-xl p-4 flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Tháng</label>
          <select name="month" defaultValue={filterMonth ?? ""} className="input w-32 text-sm">
            <option value="">— Tất cả —</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">TK / Nhóm</label>
          <select name="category" defaultValue={filterCat ?? ""} className="input w-56 text-sm">
            <option value="">— Tất cả —</option>
            {catRows.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Người chi</label>
          <select name="payer" defaultValue={filterPayer ?? ""} className="input w-32 text-sm">
            <option value="">— Tất cả —</option>
            {payerOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Tìm nội dung</label>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            className="input w-56 text-sm"
            placeholder="Từ khoá..."
          />
        </div>
        <button className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-200">
          Lọc
        </button>
        {(filterMonth || filterCat || filterPayer || q) && (
          <Link
            href="/finance/transactions"
            className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-200"
          >
            Reset
          </Link>
        )}
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="text-left p-2 whitespace-nowrap">Ngày</th>
              <th className="text-left p-2">Chi tiết</th>
              <th className="text-right p-2 whitespace-nowrap">VND</th>
              <th className="text-left p-2 whitespace-nowrap">Nhóm</th>
              <th className="text-left p-2 whitespace-nowrap">TK</th>
              <th className="text-left p-2 whitespace-nowrap">Người chi</th>
              <th className="text-left p-2 whitespace-nowrap">Nguồn</th>
              <th className="text-center p-2 whitespace-nowrap">HĐ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cat = catByCode.get(r.categoryCode);
              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs whitespace-nowrap">{r.transactionDate}</td>
                  <td className="p-2 max-w-md">
                    <div className="truncate" title={r.description}>
                      {r.description}
                    </div>
                    {r.note && (
                      <div
                        className="text-[10px] text-slate-400 truncate italic"
                        title={r.note}
                      >
                        {r.note}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmt(Number(r.amount))}</td>
                  <td className="p-2 text-xs">{r.managementGroup ?? "—"}</td>
                  <td className="p-2 font-mono text-xs" title={cat?.name}>
                    {r.categoryCode}
                  </td>
                  <td className="p-2 text-xs">{r.payer ?? "—"}</td>
                  <td className="p-2 text-[10px] text-slate-500">{r.sourceFile}</td>
                  <td className="p-2 text-center">{r.hasInvoice ? "✓" : ""}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có giao dịch. <Link href="/finance/import" className="text-blue-600 hover:underline">Import Excel</Link>.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-slate-50 text-sm font-semibold">
            <tr>
              <td colSpan={2} className="p-2 text-right">
                Tổng (rows đang hiển thị):
              </td>
              <td className="p-2 text-right tabular-nums">{fmt(total)}</td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
