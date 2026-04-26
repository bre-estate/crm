import { db } from "@/lib/db";
import {
  costReconciliations,
  products,
  projects,
  partners,
  paymentsOut,
} from "@/lib/schema";
import { fmtMoney, fmtDate, costTypeLabel, fmtPct } from "@/lib/format";
import { eq, desc, sum } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ projectId?: string; costType?: string }>;

export default async function CostsPage({ searchParams }: { searchParams: SearchParams }) {
  const { projectId, costType } = await searchParams;
  const filterProjectId = projectId ? Number(projectId) : null;

  const allProjects = await db
    .select({ id: projects.id, name: projects.name, fullCode: projects.fullCode })
    .from(projects)
    .orderBy(projects.name);

  const allRows = await db
    .select({
      id: costReconciliations.id,
      productId: costReconciliations.productId,
      date: costReconciliations.reconciliationDate,
      employee: costReconciliations.employeeName,
      costType: costReconciliations.costType,
      commissionRate: costReconciliations.commissionRate,
      kpiRate: costReconciliations.kpiRate,
      pmgThis: costReconciliations.pmgThisTime,
      kpiAmount: costReconciliations.kpiAmount,
      customerSupport: costReconciliations.customerSupport,
      amountPayable: costReconciliations.amountPayableThisTime,
      unitCode: products.unitCode,
      projectName: projects.name,
      partnerName: partners.name,
    })
    .from(costReconciliations)
    .leftJoin(products, eq(costReconciliations.productId, products.id))
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(desc(costReconciliations.reconciliationDate));

  const filterProjectName = filterProjectId
    ? (allProjects.find((p) => p.id === filterProjectId)?.name ?? null)
    : null;
  const rows = allRows.filter((r) => {
    if (filterProjectName && r.projectName !== filterProjectName) return false;
    if (costType && r.costType !== costType) return false;
    return true;
  });

  const paymentAgg = await db
    .select({
      recId: paymentsOut.costReconciliationId,
      total: sum(paymentsOut.amount).as("total"),
    })
    .from(paymentsOut)
    .groupBy(paymentsOut.costReconciliationId);
  const paidMap = new Map(paymentAgg.map((r) => [r.recId, Number(r.total ?? 0)]));

  const totalPayable = rows.reduce((s, r) => s + Number(r.amountPayable ?? 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (paidMap.get(r.id) ?? 0), 0);

  const costTypes = [
    { v: "sale_commission", l: "HH sale" },
    { v: "customer_support", l: "Hỗ trợ khách" },
    { v: "bonus_sale", l: "Thưởng NVKD" },
    { v: "bonus_manager", l: "Thưởng QL" },
    { v: "kpi_ceo", l: "KPI CEO" },
    { v: "kpi_tpkd", l: "KPI TPKD" },
    { v: "kpi_admin", l: "KPI Admin" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Đối chiếu giá vốn</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tương ứng sheet 2.3_Gia von. Mỗi dòng = 1 cá nhân × 1 căn × 1 lần đối chiếu.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 items-end flex-wrap">
        <form className="flex gap-2 items-end">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Dự án</label>
            <select name="projectId" defaultValue={projectId ?? ""} className="input min-w-48">
              <option value="">— Tất cả —</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullCode} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Loại chi phí</label>
            <select name="costType" defaultValue={costType ?? ""} className="input min-w-40">
              <option value="">— Tất cả —</option>
              {costTypes.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </div>
          <button className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200">
            Lọc
          </button>
          {(filterProjectId || costType) && (
            <Link
              href="/costs"
              className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200"
            >
              Reset
            </Link>
          )}
        </form>
        <div className="flex gap-6 text-sm ml-auto">
          <div>
            <div className="text-xs text-slate-500">Số dòng</div>
            <div className="font-bold">{rows.length}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Tổng phải trả</div>
            <div className="font-bold tabular-nums">{fmtMoney(totalPayable)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Đã trả</div>
            <div className="font-bold tabular-nums text-green-700">{fmtMoney(totalPaid)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Còn phải trả</div>
            <div className="font-bold tabular-nums text-orange-700">
              {fmtMoney(totalPayable - totalPaid)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-2">Ngày ĐC</th>
              <th className="text-left p-2">Người</th>
              <th className="text-left p-2">Loại</th>
              <th className="text-left p-2">Dự án / Căn</th>
              <th className="text-right p-2">%HH/%KPI</th>
              <th className="text-right p-2">PMG đợt</th>
              <th className="text-right p-2">KPI đợt</th>
              <th className="text-right p-2">Hỗ trợ khách</th>
              <th className="text-right p-2">Phải trả</th>
              <th className="text-right p-2">Đã trả</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const paid = paidMap.get(r.id) ?? 0;
              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 text-xs">{fmtDate(r.date)}</td>
                  <td className="p-2 text-xs">{r.employee}</td>
                  <td className="p-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100">
                      {costTypeLabel(r.costType)}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="text-xs">{r.projectName}</div>
                    <Link
                      href={`/products/${r.productId}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {r.unitCode}
                    </Link>
                  </td>
                  <td className="p-2 text-right tabular-nums text-xs">
                    {r.kpiRate ? fmtPct(r.kpiRate) : r.commissionRate ? fmtPct(r.commissionRate) : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {r.pmgThis ? fmtMoney(r.pmgThis) : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {r.kpiAmount ? fmtMoney(r.kpiAmount) : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {r.customerSupport ? fmtMoney(r.customerSupport) : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {fmtMoney(r.amountPayable)}
                  </td>
                  <td className="p-2 text-right tabular-nums text-green-700">
                    {paid > 0 ? fmtMoney(paid) : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-500">
                  Chưa có dòng giá vốn nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
