import { db } from "@/lib/db";
import {
  revenueReconciliations,
  products,
  projects,
  partners,
  invoices,
  paymentsIn,
} from "@/lib/schema";
import { fmtMoney, fmtDate, fmtPct } from "@/lib/format";
import { eq, desc, sum } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ projectId?: string }>;

export default async function RevenuesPage({ searchParams }: { searchParams: SearchParams }) {
  const { projectId } = await searchParams;
  const filterProjectId = projectId ? Number(projectId) : null;

  const allProjects = await db
    .select({ id: projects.id, name: projects.name, fullCode: projects.fullCode })
    .from(projects)
    .orderBy(projects.name);

  const selectCols = {
    id: revenueReconciliations.id,
    productId: revenueReconciliations.productId,
    date: revenueReconciliations.reconciliationDate,
    phase: revenueReconciliations.phaseNumber,
    pmgCumPct: revenueReconciliations.pmgCumulativePct,
    phasePct: revenueReconciliations.phasePctThisTime,
    revThis: revenueReconciliations.revenueThisTime,
    totalReceivable: revenueReconciliations.totalReceivableThisTime,
    invoiceNumber: invoices.invoiceNumber,
    invoiceDate: invoices.invoiceDate,
    unitCode: products.unitCode,
    projectName: projects.name,
    partnerName: partners.name,
    projectId: projects.id,
  };

  const rows = filterProjectId
    ? await db
        .select(selectCols)
        .from(revenueReconciliations)
        .leftJoin(products, eq(revenueReconciliations.productId, products.id))
        .leftJoin(projects, eq(products.projectId, projects.id))
        .leftJoin(partners, eq(projects.partnerId, partners.id))
        .leftJoin(invoices, eq(revenueReconciliations.invoiceId, invoices.id))
        .where(eq(products.projectId, filterProjectId))
        .orderBy(desc(revenueReconciliations.reconciliationDate))
    : await db
        .select(selectCols)
        .from(revenueReconciliations)
        .leftJoin(products, eq(revenueReconciliations.productId, products.id))
        .leftJoin(projects, eq(products.projectId, projects.id))
        .leftJoin(partners, eq(projects.partnerId, partners.id))
        .leftJoin(invoices, eq(revenueReconciliations.invoiceId, invoices.id))
        .orderBy(desc(revenueReconciliations.reconciliationDate));

  const paymentAgg = await db
    .select({
      recId: paymentsIn.reconciliationId,
      total: sum(paymentsIn.amount).as("total"),
    })
    .from(paymentsIn)
    .groupBy(paymentsIn.reconciliationId);
  const paidMap = new Map(paymentAgg.map((r) => [r.recId, Number(r.total ?? 0)]));

  const totalReceivable = rows.reduce((s, r) => s + Number(r.totalReceivable ?? 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (paidMap.get(r.id) ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Đối chiếu doanh thu</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tương ứng sheet 2.2_Doanh thu. Mỗi dòng = 1 sản phẩm × 1 đợt × 1 hóa đơn.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 items-end flex-wrap">
        <form className="flex gap-2 items-end">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Lọc theo dự án</label>
            <select name="projectId" defaultValue={projectId ?? ""} className="input min-w-60">
              <option value="">— Tất cả —</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullCode} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <button className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200">
            Lọc
          </button>
          {filterProjectId && (
            <Link
              href="/revenues"
              className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200"
            >
              Reset
            </Link>
          )}
        </form>
        <div className="flex gap-6 text-sm ml-auto">
          <div>
            <div className="text-xs text-slate-500">Số đợt ĐC</div>
            <div className="font-bold">{rows.length}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Tổng phải thu</div>
            <div className="font-bold tabular-nums">{fmtMoney(totalReceivable)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Đã thu</div>
            <div className="font-bold tabular-nums text-green-700">{fmtMoney(totalPaid)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Còn phải thu</div>
            <div className="font-bold tabular-nums text-orange-700">
              {fmtMoney(totalReceivable - totalPaid)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-2">Ngày ĐC</th>
              <th className="text-left p-2">Dự án / Đối tác</th>
              <th className="text-left p-2">Mã căn</th>
              <th className="text-center p-2">Đợt</th>
              <th className="text-left p-2">Số HĐ</th>
              <th className="text-left p-2">Ngày HĐ</th>
              <th className="text-right p-2">%PMG lũy kế</th>
              <th className="text-right p-2">Phải thu</th>
              <th className="text-right p-2">Đã thu</th>
              <th className="text-right p-2">Còn phải thu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const paid = paidMap.get(r.id) ?? 0;
              const remaining = Number(r.totalReceivable ?? 0) - paid;
              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 text-xs">{fmtDate(r.date)}</td>
                  <td className="p-2">
                    <div className="text-xs font-medium">{r.projectName}</div>
                    <div className="text-xs text-slate-500">{r.partnerName}</div>
                  </td>
                  <td className="p-2">
                    <Link
                      href={`/products/${r.productId}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {r.unitCode}
                    </Link>
                  </td>
                  <td className="p-2 text-center text-xs">{r.phase ?? "—"}</td>
                  <td className="p-2 font-mono text-xs">{r.invoiceNumber ?? "—"}</td>
                  <td className="p-2 text-xs">{fmtDate(r.invoiceDate)}</td>
                  <td className="p-2 text-right tabular-nums text-xs">
                    {r.pmgCumPct ? fmtPct(r.pmgCumPct) : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {fmtMoney(r.totalReceivable)}
                  </td>
                  <td className="p-2 text-right tabular-nums text-green-700">{fmtMoney(paid)}</td>
                  <td
                    className={`p-2 text-right tabular-nums ${
                      remaining > 0 ? "text-orange-700 font-semibold" : "text-slate-400"
                    }`}
                  >
                    {remaining > 0 ? fmtMoney(remaining) : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-500">
                  Chưa có đợt đối chiếu nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
