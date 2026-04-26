import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  revenueReconciliations,
  costReconciliations,
  invoices,
  paymentsIn,
  paymentsOut,
} from "@/lib/schema";
import { fmtMoney, fmtDate, fmtPct, costTypeLabel } from "@/lib/format";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [row] = await db
    .select({
      product: products,
      project: projects,
      partner: partners,
    })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .where(eq(products.id, id))
  if (!row) notFound();

  const p = row.product;

  const revRecs = await db
    .select({
      rec: revenueReconciliations,
      invoice: invoices,
    })
    .from(revenueReconciliations)
    .leftJoin(invoices, eq(revenueReconciliations.invoiceId, invoices.id))
    .where(eq(revenueReconciliations.productId, id))
    .orderBy(asc(revenueReconciliations.reconciliationDate))
  const revPayments = await db
    .select({
      payment: paymentsIn,
      recId: paymentsIn.reconciliationId,
    })
    .from(paymentsIn)
    .innerJoin(
      revenueReconciliations,
      eq(paymentsIn.reconciliationId, revenueReconciliations.id),
    )
    .where(eq(revenueReconciliations.productId, id))
  const costRecs = await db
    .select()
    .from(costReconciliations)
    .where(eq(costReconciliations.productId, id))
    .orderBy(asc(costReconciliations.reconciliationDate))
  const costPayments = await db
    .select({
      payment: paymentsOut,
    })
    .from(paymentsOut)
    .innerJoin(
      costReconciliations,
      eq(paymentsOut.costReconciliationId, costReconciliations.id),
    )
    .where(eq(costReconciliations.productId, id))
  const totalRevReceivable = revRecs.reduce((s, r) => s + Number(r.rec.totalReceivableThisTime ?? 0), 0);
  const totalPaidIn = revPayments.reduce((s, r) => s + Number(r.payment.amount ?? 0), 0);
  const totalCostPayable = costRecs.reduce((s, r) => s + Number(r.amountPayableThisTime ?? 0), 0);
  const totalPaidOut = costPayments.reduce((s, r) => s + Number(r.payment.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/products" className="text-blue-600 hover:underline">
          ← Giao dịch
        </Link>
        <span className="text-slate-400">/</span>
        <span className="font-mono">{p.productCode}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">
          {row.project?.name} · <span className="font-mono">{p.unitCode}</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Đối tác: {row.partner?.name} · NVKD: {p.salesPerson ?? "—"} · Phòng:{" "}
          {p.deptName ?? "—"} · Ngày cọc: {fmtDate(p.depositDate)}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card label="Tổng doanh thu (Excel)" value={fmtMoney(p.totalRevenue)} />
        <Card label="Tổng giá vốn (Excel)" value={fmtMoney(p.totalCost)} />
        <Card
          label="DT đã đối chiếu"
          value={fmtMoney(totalRevReceivable)}
          sub={`Đã thu: ${fmtMoney(totalPaidIn)}`}
        />
        <Card
          label="GV đã đối chiếu"
          value={fmtMoney(totalCostPayable)}
          sub={`Đã trả: ${fmtMoney(totalPaidOut)}`}
        />
      </div>

      <Section title="Thông số cấu hình (snapshot)">
        <div className="grid grid-cols-4 gap-3 text-sm">
          <Info label="Giá bán" value={fmtMoney(p.sellPrice)} />
          <Info label="Giá tính PMG" value={fmtMoney(p.pmgBasePrice)} />
          <Info label="%PMG_LK" value={fmtPct(p.pmgRate)} />
          <Info label="%PMG_LK_sale" value={fmtPct(p.pmgSaleRate)} />
          <Info label="Phí admin" value={fmtMoney(p.adminFee)} />
          <Info label="Phí admin sale" value={fmtMoney(p.adminFeeSale)} />
          <Info label="%HH sale" value={fmtPct(p.saleCommissionRate)} />
          <Info label="Hỗ trợ khách" value={fmtMoney(p.customerSupport)} />
          <Info label="Thưởng NVKD (CTY)" value={fmtMoney(p.bonusSale)} />
          <Info label="Thưởng QL (CTY)" value={fmtMoney(p.bonusManager)} />
          <Info label="Thưởng sale (CĐT)" value={fmtMoney(p.cdtBonusSale)} />
          <Info label="Thưởng QL (CĐT)" value={fmtMoney(p.cdtBonusManager)} />
          <Info label="%KPI CEO" value={fmtPct(p.kpiCeoRate)} />
          <Info label="%KPI TPKD" value={fmtPct(p.kpiTpkdRate)} />
          <Info label="%KPI Admin" value={fmtPct(p.kpiAdminRate)} />
          <Info label="CP giá vốn khác" value={fmtMoney(p.otherCost)} />
        </div>
      </Section>

      <Section title={`Đối chiếu doanh thu với CĐT/F1 (${revRecs.length} dòng)`}>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-2">Ngày ĐC</th>
                <th className="text-left p-2">Đợt</th>
                <th className="text-left p-2">Số HĐ</th>
                <th className="text-left p-2">Ngày HĐ</th>
                <th className="text-right p-2">%PMG lũy kế</th>
                <th className="text-right p-2">%Thu PMG đợt</th>
                <th className="text-right p-2">DT đợt này</th>
                <th className="text-right p-2">Phải thu đợt</th>
              </tr>
            </thead>
            <tbody>
              {revRecs.map(({ rec, invoice }) => (
                <tr key={rec.id} className="border-t border-slate-100">
                  <td className="p-2">{fmtDate(rec.reconciliationDate)}</td>
                  <td className="p-2">{rec.phaseNumber ?? "—"}</td>
                  <td className="p-2 font-mono">{invoice?.invoiceNumber ?? "—"}</td>
                  <td className="p-2">{fmtDate(invoice?.invoiceDate)}</td>
                  <td className="p-2 text-right tabular-nums">
                    {rec.pmgCumulativePct ? fmtPct(rec.pmgCumulativePct) : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {rec.phasePctThisTime ? fmtPct(rec.phasePctThisTime) : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtMoney(rec.revenueThisTime)}
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {fmtMoney(rec.totalReceivableThisTime)}
                  </td>
                </tr>
              ))}
              {revRecs.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-500">
                    Chưa có đợt đối chiếu nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Đối chiếu giá vốn nội bộ (${costRecs.length} dòng)`}>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-2">Ngày ĐC</th>
                <th className="text-left p-2">Người</th>
                <th className="text-left p-2">Loại chi phí</th>
                <th className="text-right p-2">%HH / %KPI</th>
                <th className="text-right p-2">PMG đợt này</th>
                <th className="text-right p-2">KPI đợt này</th>
                <th className="text-right p-2">Phải trả đợt</th>
              </tr>
            </thead>
            <tbody>
              {costRecs.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-2">{fmtDate(r.reconciliationDate)}</td>
                  <td className="p-2">{r.employeeName}</td>
                  <td className="p-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100">
                      {costTypeLabel(r.costType)}
                    </span>
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {r.kpiRate ? fmtPct(r.kpiRate) : fmtPct(r.commissionRate)}
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(r.pmgThisTime)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(r.kpiAmount)}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {fmtMoney(r.amountPayableThisTime)}
                  </td>
                </tr>
              ))}
              {costRecs.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-500">
                    Chưa có dòng giá vốn nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium tabular-nums mt-1">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {children}
    </div>
  );
}
