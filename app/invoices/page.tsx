import { db } from "@/lib/db";
import { invoices, revenueReconciliations, paymentsIn } from "@/lib/schema";
import { eq, desc, sql } from "drizzle-orm";
import Link from "next/link";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  // Aggregate: mỗi HĐ có N recon, mỗi recon có M payment.
  // Query 2 vòng: recon count + total per invoice; payments sum per invoice.
  const invRows = await db.select().from(invoices).orderBy(desc(invoices.invoiceDate));

  const reconAgg = await db
    .select({
      invoiceId: revenueReconciliations.invoiceId,
      cnt: sql<number>`COUNT(*)::int`.as("cnt"),
      totalRecon: sql<string>`COALESCE(SUM(${revenueReconciliations.totalReceivableThisTime}), 0)`.as(
        "total_recon",
      ),
    })
    .from(revenueReconciliations)
    .groupBy(revenueReconciliations.invoiceId);

  const paymentAgg = await db
    .select({
      invoiceId: revenueReconciliations.invoiceId,
      totalPaid: sql<string>`COALESCE(SUM(${paymentsIn.amount}), 0)`.as("total_paid"),
    })
    .from(paymentsIn)
    .innerJoin(
      revenueReconciliations,
      eq(paymentsIn.reconciliationId, revenueReconciliations.id),
    )
    .groupBy(revenueReconciliations.invoiceId);

  const reconByInv = new Map<number, { cnt: number; totalRecon: number }>();
  for (const r of reconAgg)
    if (r.invoiceId)
      reconByInv.set(r.invoiceId, {
        cnt: Number(r.cnt ?? 0),
        totalRecon: Number(r.totalRecon ?? 0),
      });

  const paidByInv = new Map<number, number>();
  for (const p of paymentAgg)
    if (p.invoiceId) paidByInv.set(p.invoiceId, Number(p.totalPaid ?? 0));

  const rows = invRows.map((inv) => {
    const total = Number(inv.totalAmountVat ?? 0);
    const paid = paidByInv.get(inv.id) ?? 0;
    const recon = reconByInv.get(inv.id) ?? { cnt: 0, totalRecon: 0 };
    return {
      id: inv.id,
      number: inv.invoiceNumber,
      date: inv.invoiceDate,
      total,
      paid,
      remaining: total - paid,
      reconCount: recon.cnt,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Hóa đơn</h1>
        <p className="text-sm text-slate-500 mt-1">
          Danh sách hóa đơn đã lập. Giá trị HĐ auto tính từ tổng các đợt đối chiếu link vào.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Số HĐ</th>
              <th className="text-left p-3">Ngày HĐ</th>
              <th className="text-right p-3">Số đợt ĐC</th>
              <th className="text-right p-3">Giá trị HĐ</th>
              <th className="text-right p-3">Đã thu</th>
              <th className="text-right p-3">Còn nợ</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const status =
                r.total === 0
                  ? "empty"
                  : r.remaining <= 0
                    ? "paid"
                    : r.paid > 0
                      ? "partial"
                      : "unpaid";
              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs font-medium">{r.number}</td>
                  <td className="p-3 text-slate-500">
                    {r.date || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {r.reconCount > 0 ? (
                      r.reconCount
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums font-medium">
                    {fmtMoney(r.total)}
                  </td>
                  <td className="p-3 text-right tabular-nums text-green-700">
                    {r.paid > 0 ? fmtMoney(r.paid) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    <span
                      className={
                        status === "paid"
                          ? "text-slate-400"
                          : status === "partial"
                            ? "text-orange-600 font-medium"
                            : status === "unpaid"
                              ? "text-red-600 font-medium"
                              : "text-slate-300"
                      }
                    >
                      {status === "empty"
                        ? "—"
                        : status === "paid"
                          ? "Đã thu đủ"
                          : fmtMoney(r.remaining)}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      href={`/invoices/${r.id}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Xem
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có hóa đơn nào. HĐ tự sinh khi tạo ĐC doanh thu có số HĐ.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

