import { db } from "@/lib/db";
import {
  invoices,
  revenueReconciliations,
  paymentsIn,
  products,
  projects,
  partners,
} from "@/lib/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [inv] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      invoiceDate: invoices.invoiceDate,
      totalAmountVat: invoices.totalAmountVat,
      note: invoices.note,
      partnerId: invoices.partnerId,
      partnerName: partners.name,
    })
    .from(invoices)
    .leftJoin(partners, eq(partners.id, invoices.partnerId))
    .where(eq(invoices.id, id));
  if (!inv) notFound();

  const recons = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      productCode: products.productCode,
      projectName: projects.name,
      partnerName: partners.name,
      reconciliationDate: revenueReconciliations.reconciliationDate,
      minutesNumber: revenueReconciliations.minutesNumber,
      revenueThisTime: revenueReconciliations.revenueThisTime,
      cdtBonusSale: revenueReconciliations.cdtBonusSale,
      cdtBonusManager: revenueReconciliations.cdtBonusManager,
      totalReceivableThisTime: revenueReconciliations.totalReceivableThisTime,
    })
    .from(revenueReconciliations)
    .leftJoin(products, eq(revenueReconciliations.productId, products.id))
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(partners.id, projects.partnerId))
    .where(eq(revenueReconciliations.invoiceId, id))
    .orderBy(asc(revenueReconciliations.reconciliationDate));

  const payments = await db
    .select({
      id: paymentsIn.id,
      reconciliationId: paymentsIn.reconciliationId,
      paymentDate: paymentsIn.paymentDate,
      amount: paymentsIn.amount,
      note: paymentsIn.note,
    })
    .from(paymentsIn)
    .innerJoin(
      revenueReconciliations,
      eq(paymentsIn.reconciliationId, revenueReconciliations.id),
    )
    .where(eq(revenueReconciliations.invoiceId, id))
    .orderBy(asc(paymentsIn.paymentDate));

  const totalVat = Number(inv.totalAmountVat ?? 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const remaining = totalVat - totalPaid;

  const reconTypeLabel = (r: (typeof recons)[number]): string => {
    if (Number(r.cdtBonusSale ?? 0) > 0) return "Thưởng sale";
    if (Number(r.cdtBonusManager ?? 0) > 0) return "Thưởng quản lý";
    return "Hoa hồng";
  };

  // Group recons theo CĐT. Nếu chỉ 1 CĐT → render 1 bảng gộp; nếu nhiều CĐT
  // → tách thành nhiều bảng (VD hóa đơn số 24 có căn thuộc Dataloca 2025 + 2026).
  const groupedRecons = new Map<string, typeof recons>();
  for (const r of recons) {
    const key = r.partnerName ?? "(chưa xác định)";
    const arr = groupedRecons.get(key) ?? [];
    arr.push(r);
    groupedRecons.set(key, arr);
  }
  const partnerGroups = [...groupedRecons.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const hasMultiplePartners = partnerGroups.length > 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/invoices" className="text-blue-600 hover:underline">
          ← Hóa đơn
        </Link>
        <span className="text-slate-400">/</span>
        <span>HĐ #{inv.invoiceNumber}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Hóa đơn #{inv.invoiceNumber}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 mt-1">
          {inv.invoiceDate && <span>Ngày lập: {inv.invoiceDate}</span>}
          {inv.partnerName ? (
            <span>
              CĐT:{" "}
              <span className="font-medium text-slate-800">{inv.partnerName}</span>
            </span>
          ) : hasMultiplePartners ? (
            <span>
              CĐT:{" "}
              <span className="font-medium text-slate-800">
                {partnerGroups.map(([name]) => name).join(" + ")}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Giá trị HĐ (gồm VAT)" value={fmtMoney(totalVat)} tone="neutral" />
        <StatCard label="Đã thu" value={fmtMoney(totalPaid)} tone="good" />
        <StatCard
          label={remaining > 0 ? "Còn nợ" : "Thu vượt"}
          value={fmtMoney(Math.abs(remaining))}
          tone={remaining > 0 ? "bad" : totalVat > 0 && remaining <= 0 ? "good" : "neutral"}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          Các đợt đối chiếu ({recons.length})
          {hasMultiplePartners && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              — tách theo {partnerGroups.length} chủ đầu tư
            </span>
          )}
        </h2>
        {recons.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-sm">
            Hóa đơn chưa có đợt đối chiếu nào link vào.
          </div>
        ) : (
          partnerGroups.map(([partnerName, list]) => {
            const groupTotal = list.reduce(
              (s, r) => s + Number(r.totalReceivableThisTime ?? 0),
              0,
            );
            return (
              <div
                key={partnerName}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                {hasMultiplePartners && (
                  <div className="bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 flex items-center justify-between">
                    <span>
                      {partnerName}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        · {list.length} căn
                      </span>
                    </span>
                    <span className="text-xs tabular-nums font-semibold">
                      {fmtMoney(groupTotal)}
                    </span>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="text-left p-3">Căn</th>
                      <th className="text-left p-3">Dự án</th>
                      <th className="text-left p-3">Ngày đối chiếu</th>
                      <th className="text-left p-3">Số biên bản</th>
                      <th className="text-left p-3">Loại đợt</th>
                      <th className="text-right p-3">Số tiền</th>
                      <th className="text-right p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-mono text-xs">{r.productCode}</td>
                        <td className="p-3 text-slate-600">{r.projectName ?? "—"}</td>
                        <td className="p-3 text-slate-500">
                          {r.reconciliationDate || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="p-3 text-slate-500">
                          {r.minutesNumber || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="p-3 text-xs">{reconTypeLabel(r)}</td>
                        <td className="p-3 text-right tabular-nums font-medium">
                          {fmtMoney(r.totalReceivableThisTime)}
                        </td>
                        <td className="p-3 text-right">
                          <Link
                            href={`/revenues/${r.id}/edit?returnTo=/invoices/${id}`}
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Sửa
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={5} className="p-3 text-right text-xs font-semibold text-slate-600">
                        Tổng {hasMultiplePartners ? `(${partnerName})` : ""}
                      </td>
                      <td className="p-3 text-right tabular-nums font-semibold">
                        {fmtMoney(groupTotal)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })
        )}
        {hasMultiplePartners && recons.length > 0 && (
          <div className="bg-slate-800 text-white rounded-xl p-3 flex justify-between text-sm">
            <span className="font-semibold">Tổng hóa đơn</span>
            <span className="tabular-nums font-bold">{fmtMoney(totalVat)}</span>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          Lịch sử thanh toán ({payments.length})
        </h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-3">Ngày</th>
                <th className="text-right p-3">Số tiền</th>
                <th className="text-left p-3">Ghi chú</th>
                <th className="text-right p-3">ĐC liên quan</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="p-3">{p.paymentDate ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums text-green-700 font-medium">
                    {fmtMoney(p.amount)}
                  </td>
                  <td className="p-3 text-slate-500 text-xs">{p.note ?? ""}</td>
                  <td className="p-3 text-right text-xs">
                    <Link
                      href={`/revenues/${p.reconciliationId}/edit?returnTo=/invoices/${id}`}
                      className="text-blue-600 hover:underline"
                    >
                      ĐC #{p.reconciliationId}
                    </Link>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-500 text-sm">
                    Chưa có thanh toán ghi nhận.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "bg-green-50 border-green-200 text-green-700"
      : tone === "bad"
        ? "bg-red-50 border-red-200 text-red-700"
        : "bg-slate-50 border-slate-200 text-slate-700";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}
