import { db } from "@/lib/db";
import { financialTransactions, products, revenueReconciliations, costReconciliations, accountingCategories } from "@/lib/schema";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { eq, inArray, desc, and, sql, like } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const OPEX_CATEGORIES = ["6421", "6427-rent", "6427-svc", "6417", "6428", "6425", "635"];

const fmt = (n: number) => n.toLocaleString("vi-VN");

type Params = Promise<{ month: string }>;

export default async function MonthDetailPage({ params }: { params: Params }) {
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  const { month } = await params;
  if (!/^\d{4}-\d{2}$/.test(month)) notFound();

  // ===== 1. Mọi transactions trong tháng =====
  const txs = await db
    .select({
      id: financialTransactions.id,
      date: financialTransactions.transactionDate,
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
    .where(eq(financialTransactions.transactionMonth, month))
    .orderBy(desc(financialTransactions.transactionDate));

  // ===== 2. Rev + Cost reconciliations trong tháng (theo tháng cọc căn) =====
  const productsInMonth = await db
    .select({ id: products.id, unitCode: products.unitCode, projectId: products.projectId })
    .from(products)
    .where(like(products.depositDate, `${month}-%`));
  const productIds = productsInMonth.map((p) => p.id);
  const productMap = new Map(productsInMonth.map((p) => [p.id, p]));

  const revs = productIds.length > 0
    ? await db
        .select({
          id: revenueReconciliations.id,
          productId: revenueReconciliations.productId,
          reconDate: revenueReconciliations.reconciliationDate,
          receivable: revenueReconciliations.totalReceivableThisTime,
          revThisTime: revenueReconciliations.revenueThisTime,
        })
        .from(revenueReconciliations)
        .where(inArray(revenueReconciliations.productId, productIds))
    : [];
  const costs = productIds.length > 0
    ? await db
        .select({
          id: costReconciliations.id,
          productId: costReconciliations.productId,
          reconDate: costReconciliations.reconciliationDate,
          costType: costReconciliations.costType,
          employeeName: costReconciliations.employeeName,
          payable: costReconciliations.amountPayableThisTime,
        })
        .from(costReconciliations)
        .where(inArray(costReconciliations.productId, productIds))
    : [];

  // ===== 3. Aggregate =====
  const opexTxs = txs.filter((t) => OPEX_CATEGORIES.includes(t.categoryCode));
  const opexTotal = opexTxs.reduce((s, t) => s + Number(t.amount), 0);
  const revTotal = revs.reduce((s, r) => s + Number(r.receivable ?? 0), 0);
  const costTotal = costs.reduce((s, c) => s + Number(c.payable ?? 0), 0);
  const grossProfit = revTotal / 1.1 - costTotal;
  const netProfit = grossProfit - opexTotal;

  // OPEX by group
  const opexByGroup = new Map<string, typeof opexTxs>();
  for (const t of opexTxs) {
    const g = t.managementGroup ?? "?";
    if (!opexByGroup.has(g)) opexByGroup.set(g, []);
    opexByGroup.get(g)!.push(t);
  }

  // Non-OPEX transactions (vốn góp, hoàn, cọc hộ, thuế pass-through, thiết bị)
  const otherTxs = txs.filter((t) => !OPEX_CATEGORIES.includes(t.categoryCode));
  const otherByGroup = new Map<string, typeof otherTxs>();
  for (const t of otherTxs) {
    const g = t.managementGroup ?? "?";
    if (!otherByGroup.has(g)) otherByGroup.set(g, []);
    otherByGroup.get(g)!.push(t);
  }

  const year = month.slice(0, 4);
  const monthNum = Number(month.slice(5));

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <div className="text-xs">
          <Link href={`/reports/management?year=${year}`} className="text-blue-600 hover:underline">
            ← Báo cáo quản trị {year}
          </Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Chi tiết tháng T{monthNum}/{year}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {txs.length} giao dịch tài chính · {productsInMonth.length} căn cọc trong tháng ·
          {revs.length} DT ĐC · {costs.length} giá vốn ĐC
        </p>
      </div>

      {/* Stat cards P&L */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Doanh thu (gồm VAT)" value={fmt(revTotal)} sub={`${revs.length} lần ĐC`} />
        <StatCard label="Giá vốn" value={fmt(costTotal)} sub={`${costs.length} lần ĐC`} warn />
        <StatCard label="Chi phí QL" value={fmt(opexTotal)} sub={`${opexTxs.length} khoản`} warn />
        <StatCard
          label="Lãi thuần"
          value={fmt(netProfit)}
          sub={`Lãi gộp: ${fmt(grossProfit)}`}
          highlight={netProfit >= 0}
          bad={netProfit < 0}
        />
      </div>

      {/* OPEX breakdown */}
      <section>
        <h2 className="text-lg font-semibold mb-2">💼 Chi phí quản lý ({fmt(opexTotal)} VND)</h2>
        {[...opexByGroup.entries()]
          .sort((a, b) => {
            const sumA = a[1].reduce((s, t) => s + Number(t.amount), 0);
            const sumB = b[1].reduce((s, t) => s + Number(t.amount), 0);
            return sumB - sumA;
          })
          .map(([group, list]) => (
            <GroupTable key={group} title={group} txs={list} />
          ))}
        {opexTxs.length === 0 && (
          <p className="text-sm text-slate-500 italic">Không có chi phí QL trong tháng này.</p>
        )}
      </section>

      {/* Doanh thu ĐC */}
      {revs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">💰 Doanh thu ĐC ({fmt(revTotal)} VND)</h2>
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs">
                <tr>
                  <th className="text-left p-2">Ngày ĐC</th>
                  <th className="text-left p-2">Căn</th>
                  <th className="text-right p-2">DT đợt</th>
                  <th className="text-right p-2">Nhận từ khách</th>
                </tr>
              </thead>
              <tbody>
                {revs.map((r) => {
                  const p = productMap.get(r.productId);
                  return (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-2 font-mono text-xs">{r.reconDate ?? "—"}</td>
                      <td className="p-2 text-xs">
                        {p ? (
                          <Link href={`/products/${p.id}`} className="text-blue-600 hover:underline font-mono">
                            {p.unitCode}
                          </Link>
                        ) : (
                          `#${r.productId}`
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">{fmt(Number(r.revThisTime ?? 0))}</td>
                      <td className="p-2 text-right tabular-nums font-semibold">
                        {fmt(Number(r.receivable ?? 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Giá vốn ĐC */}
      {costs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">🏦 Giá vốn ĐC ({fmt(costTotal)} VND)</h2>
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs">
                <tr>
                  <th className="text-left p-2">Ngày ĐC</th>
                  <th className="text-left p-2">Căn</th>
                  <th className="text-left p-2">Loại</th>
                  <th className="text-left p-2">Người nhận</th>
                  <th className="text-right p-2">Số tiền</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => {
                  const p = productMap.get(c.productId);
                  return (
                    <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-2 font-mono text-xs">{c.reconDate ?? "—"}</td>
                      <td className="p-2 text-xs">
                        {p ? (
                          <Link href={`/products/${p.id}`} className="text-blue-600 hover:underline font-mono">
                            {p.unitCode}
                          </Link>
                        ) : (
                          `#${c.productId}`
                        )}
                      </td>
                      <td className="p-2 text-xs">{c.costType}</td>
                      <td className="p-2 text-xs">{c.employeeName}</td>
                      <td className="p-2 text-right tabular-nums">{fmt(Number(c.payable ?? 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Non-OPEX transactions */}
      {otherTxs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">
            🔄 Các giao dịch khác trong tháng ({otherTxs.length})
          </h2>
          <p className="text-xs text-slate-500 mb-2">
            Vốn góp / Hoàn booking / Cọc hộ khách / Thuế pass-through / TSCĐ — không tính vào chi phí QL.
          </p>
          {[...otherByGroup.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([group, list]) => (
              <GroupTable key={group} title={group} txs={list} />
            ))}
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  warn,
  highlight,
  bad,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  highlight?: boolean;
  bad?: boolean;
}) {
  const border = bad
    ? "border-red-300"
    : highlight
      ? "border-green-300"
      : warn
        ? "border-orange-200"
        : "border-slate-200";
  const color = bad ? "text-red-700" : highlight ? "text-green-700" : "";
  return (
    <div className={`bg-white border ${border} rounded-xl p-4`}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function GroupTable({
  title,
  txs,
}: {
  title: string;
  txs: Array<{
    id: number;
    date: string;
    description: string;
    amount: number;
    categoryCode: string;
    payer: string | null;
    recipient: string | null;
    sourceFile: string;
  }>;
}) {
  const total = txs.reduce((s, t) => s + Number(t.amount), 0);
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="text-xs text-slate-500">
          {txs.length} khoản · <b>{total.toLocaleString("vi-VN")} VND</b>
        </span>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px]">
            <tr>
              <th className="text-left p-2">Ngày</th>
              <th className="text-left p-2">Chi tiết</th>
              <th className="text-right p-2">VND</th>
              <th className="text-left p-2">Người chi</th>
              <th className="text-left p-2">Người nhận</th>
              <th className="text-left p-2">Nguồn</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-2 font-mono">{t.date}</td>
                <td className="p-2 max-w-md">
                  <div className="truncate" title={t.description}>
                    {t.description}
                  </div>
                </td>
                <td className="p-2 text-right tabular-nums">
                  {Number(t.amount).toLocaleString("vi-VN")}
                </td>
                <td className="p-2">{t.payer ?? "—"}</td>
                <td className="p-2 truncate max-w-32">{t.recipient ?? "—"}</td>
                <td className="p-2 text-[10px] text-slate-500">{t.sourceFile}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
