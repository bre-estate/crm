import { db } from "@/lib/db";
import {
  costReconciliations,
  products,
  projects,
  partners,
  paymentsOut,
} from "@/lib/schema";
import { fmtMoney, fmtDate, costTypeLabel, fmtPct, toTitleCase } from "@/lib/format";
import { computeLuyKe } from "@/lib/costCalc";
import { eq, desc, sum } from "drizzle-orm";
import Link from "next/link";
import SearchableSelect from "@/components/SearchableSelect";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ projectId?: string; costType?: string; unitCode?: string }>;

export default async function CostsPage({ searchParams }: { searchParams: SearchParams }) {
  const { projectId, costType, unitCode } = await searchParams;
  const filterProjectId = projectId ? Number(projectId) : null;
  const filterUnitCode = unitCode?.trim().toLowerCase() || null;

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
      productPmgBase: products.pmgBasePrice,
      productPmgSaleRate: products.pmgSaleRate,
      productPmgRate: products.pmgRate,
      productSaleCommRate: products.saleCommissionRate,
      productKpiCeoRate: products.kpiCeoRate,
      productKpiTpkdRate: products.kpiTpkdRate,
      productKpiAdminRate: products.kpiAdminRate,
      productCustSupport: products.customerSupport,
      productBonusSale: products.bonusSale,
      productBonusMgr: products.bonusManager,
      productCdtBonusSale: products.cdtBonusSale,
      productCdtBonusMgr: products.cdtBonusManager,
      productAdminFeeSale: products.adminFeeSale,
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
    if (filterUnitCode && !(r.unitCode ?? "").toLowerCase().includes(filterUnitCode)) return false;
    return true;
  });

  // Sort: group theo loại (đúng thứ tự nghiệp vụ) + date DESC trong nhóm
  const costTypeOrder: Record<string, number> = {
    sale_commission: 1,
    customer_support: 2,
    bonus_sale: 3,
    bonus_manager: 4,
    cdt_bonus_sale: 5,
    cdt_bonus_manager: 6,
    kpi_ceo: 7,
    kpi_tpkd: 8,
    kpi_admin: 9,
  };
  rows.sort((a, b) => {
    const oA = costTypeOrder[a.costType] ?? 99;
    const oB = costTypeOrder[b.costType] ?? 99;
    if (oA !== oB) return oA - oB;
    return (b.date ?? "").localeCompare(a.date ?? "");
  });

  const paymentAgg = await db
    .select({
      recId: paymentsOut.costReconciliationId,
      total: sum(paymentsOut.amount).as("total"),
    })
    .from(paymentsOut)
    .groupBy(paymentsOut.costReconciliationId);
  const paidMap = new Map(paymentAgg.map((r) => [r.recId, Number(r.total ?? 0)]));

  // Tính subtotal per loại + target (target chỉ có nghĩa khi filter về 1 căn)
  const uniqueProdIds = new Set(rows.map((r) => r.productId));
  const singleProduct = uniqueProdIds.size === 1 ? rows[0] : null;
  const targetByType = new Map<string, number>();
  if (singleProduct) {
    // Target ĐỦ theo công thức Excel: ((L × M − Q) / 1.1 − R) × %
    const cfg = {
      pmgBasePrice: Number(singleProduct.productPmgBase ?? 0),
      pmgSaleRate:
        Number(singleProduct.productPmgSaleRate ?? 0) || Number(singleProduct.productPmgRate ?? 0),
      adminFeeSale: Number(singleProduct.productAdminFeeSale ?? 0),
      customerSupport: Number(singleProduct.productCustSupport ?? 0),
      saleCommissionRate: Number(singleProduct.productSaleCommRate ?? 0),
      kpiCeoRate: Number(singleProduct.productKpiCeoRate ?? 0),
      kpiTpkdRate: Number(singleProduct.productKpiTpkdRate ?? 0),
      kpiAdminRate: Number(singleProduct.productKpiAdminRate ?? 0),
      bonusSale: Number(singleProduct.productBonusSale ?? 0),
      bonusManager: Number(singleProduct.productBonusMgr ?? 0),
      cdtBonusSale: Number(singleProduct.productCdtBonusSale ?? 0),
      cdtBonusManager: Number(singleProduct.productCdtBonusMgr ?? 0),
    };
    for (const t of ["sale_commission", "customer_support", "bonus_sale", "bonus_manager",
      "cdt_bonus_sale", "cdt_bonus_manager", "kpi_ceo", "kpi_tpkd", "kpi_admin"] as const) {
      targetByType.set(t, computeLuyKe(cfg, t, 1));
    }
  }
  const subtotalByType = new Map<
    string,
    { count: number; payable: number; paid: number; target: number }
  >();
  for (const r of rows) {
    const s =
      subtotalByType.get(r.costType) ??
      { count: 0, payable: 0, paid: 0, target: targetByType.get(r.costType) ?? 0 };
    s.count++;
    s.payable += Number(r.amountPayable ?? 0);
    s.paid += paidMap.get(r.id) ?? 0;
    subtotalByType.set(r.costType, s);
  }

  const totalPayable = rows.reduce((s, r) => s + Number(r.amountPayable ?? 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (paidMap.get(r.id) ?? 0), 0);

  const costTypes = [
    { v: "sale_commission", l: "HH sale" },
    { v: "customer_support", l: "Hỗ trợ khách" },
    { v: "bonus_sale", l: "Thưởng NVKD" },
    { v: "bonus_manager", l: "Thưởng TPKD" },
    { v: "kpi_ceo", l: "KPI CEO" },
    { v: "kpi_tpkd", l: "KPI TPKD" },
    { v: "kpi_admin", l: "KPI Admin" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Đối chiếu giá vốn</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tương ứng sheet 2.3_Gia von. Mỗi dòng = 1 cá nhân × 1 căn × 1 lần đối chiếu.{" "}
            <span className="text-red-600">Số âm = điều chỉnh / hoàn trả</span> (vd thưởng đã trả thừa).
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/costs/bulk"
            className="bg-slate-100 border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-200"
          >
            📊 Nhập hàng loạt
          </Link>
          <Link
            href="/costs/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
          >
            + Thêm dòng đối chiếu
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 items-end flex-wrap">
        <form className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Mã căn</label>
            <input
              type="text"
              name="unitCode"
              defaultValue={unitCode ?? ""}
              className="input min-w-32"
              placeholder="vd: A.25.26"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Dự án</label>
            <SearchableSelect
              name="projectId"
              defaultValue={projectId ?? ""}
              emptyOption="— Tất cả —"
              placeholder="Gõ tên dự án..."
              className="min-w-72"
              options={allProjects.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: p.fullCode,
              }))}
            />
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
          {(filterProjectId || costType || filterUnitCode) && (
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
            <div
              className={`font-bold tabular-nums ${
                totalPayable - totalPaid < 1000 ? "text-slate-400" : "text-red-600"
              }`}
            >
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
              <th className="text-right p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const paid = paidMap.get(r.id) ?? 0;
              const prevType = idx > 0 ? rows[idx - 1].costType : null;
              const isFirstOfGroup = r.costType !== prevType;
              const subtotal = subtotalByType.get(r.costType);
              return [
                isFirstOfGroup && subtotal ? (
                    (() => {
                      const target = subtotal.target;
                      const pct = target > 0 ? (subtotal.payable / target) * 100 : 0;
                      const done = target > 0 && Math.abs(subtotal.payable - target) < 1000;
                      const over = target > 0 && subtotal.payable - target > 1000;
                      const under = target > 0 && target - subtotal.payable > 1000;
                      return (
                        <tr
                          key={`hdr-${r.costType}`}
                          className="bg-slate-50 border-t-2 border-slate-300"
                        >
                          <td colSpan={11} className="p-2 text-xs">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-semibold text-slate-700">
                                {costTypeLabel(r.costType)}
                              </span>
                              <span className="text-slate-500">
                                · {subtotal.count} dòng · Tổng đã chi:{" "}
                                <span className="font-semibold tabular-nums text-slate-800">
                                  {fmtMoney(subtotal.payable)}
                                </span>
                                {target > 0 && (
                                  <>
                                    {" "}
                                    · Target:{" "}
                                    <span className="font-semibold tabular-nums text-slate-800">
                                      {fmtMoney(target)}
                                    </span>{" "}
                                    ·{" "}
                                    <span
                                      className={`font-bold tabular-nums ${
                                        done
                                          ? "text-green-700"
                                          : over
                                            ? "text-purple-700"
                                            : under
                                              ? "text-amber-700"
                                              : "text-slate-500"
                                      }`}
                                      title={
                                        done
                                          ? "Đã chi đủ target"
                                          : over
                                            ? `Chi quá ${fmtMoney(subtotal.payable - target)}`
                                            : `Còn thiếu ${fmtMoney(target - subtotal.payable)}`
                                      }
                                    >
                                      {pct.toFixed(0)}%
                                    </span>
                                  </>
                                )}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })()
                ) : null,
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 text-xs">{fmtDate(r.date)}</td>
                  <td className="p-2 text-xs">{toTitleCase(r.employee)}</td>
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
                  <td
                    className={`p-2 text-right tabular-nums ${
                      Number(r.kpiAmount) < 0 ? "text-red-600" : ""
                    }`}
                  >
                    {r.kpiAmount ? fmtMoney(r.kpiAmount) : "—"}
                  </td>
                  <td
                    className={`p-2 text-right tabular-nums ${
                      Number(r.customerSupport) < 0 ? "text-red-600" : ""
                    }`}
                  >
                    {r.customerSupport ? fmtMoney(r.customerSupport) : "—"}
                  </td>
                  <td
                    className={`p-2 text-right tabular-nums font-semibold ${
                      Number(r.amountPayable) < 0 ? "text-red-600" : ""
                    }`}
                    title={Number(r.amountPayable) < 0 ? "Số âm = điều chỉnh / hoàn trả" : ""}
                  >
                    {fmtMoney(r.amountPayable)}
                  </td>
                  <td className="p-2 text-right tabular-nums text-green-700">
                    {paid !== 0 ? fmtMoney(paid) : <span className="text-slate-400">Chưa trả</span>}
                  </td>
                  <td className="p-2 text-right">
                    <Link
                      href={`/costs/${r.id}/edit`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Sửa
                    </Link>
                  </td>
                </tr>,
              ];
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-slate-500">
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
