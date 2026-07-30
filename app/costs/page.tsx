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
import BulkDeleteBar from "../BulkDeleteBar";
import { deleteCostBulk } from "@/lib/actions/costs";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  projectId?: string;
  costType?: string;
  unitCode?: string;
  salesPerson?: string;
  status?: string; // "not_started" | "partial" | "done" | "over" — chỉ dùng view=byUnit
  view?: string; // "recon" (default) | "byUnit"
  deleted?: string;
  updated?: string;
}>;

export default async function CostsPage({ searchParams }: { searchParams: SearchParams }) {
  const { projectId, costType, unitCode, salesPerson, status, view, deleted, updated } =
    await searchParams;
  const viewMode: "recon" | "byUnit" = view === "byUnit" ? "byUnit" : "recon";

  if (viewMode === "byUnit") {
    return (
      <AggregatedCostsView
        projectIdParam={projectId}
        costTypeParam={costType}
        unitCodeParam={unitCode}
        salesPersonParam={salesPerson}
        statusParam={status}
      />
    );
  }

  // returnTo cho edit link — giữ nguyên filter hiện tại khi user vào edit rồi quay lại
  const returnToParams = new URLSearchParams();
  if (projectId) returnToParams.set("projectId", projectId);
  if (costType) returnToParams.set("costType", costType);
  if (unitCode) returnToParams.set("unitCode", unitCode);
  const returnToQS = returnToParams.toString();
  const returnTo = `/costs${returnToQS ? "?" + returnToQS : ""}`;
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
      {(deleted || updated) && (
        <div
          className={`border rounded-lg p-3 text-sm ${
            deleted
              ? "bg-red-50 border-red-300 text-red-800"
              : "bg-green-50 border-green-300 text-green-800"
          }`}
        >
          {deleted
            ? `Đã xóa đối chiếu #${deleted}.`
            : `Đã cập nhật đối chiếu #${updated}.`}
        </div>
      )}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Đối chiếu giá vốn</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tương ứng sheet 2.3_Gia von. Mỗi dòng = 1 cá nhân × 1 căn × 1 lần đối chiếu.{" "}
            <span className="text-red-600">Số âm = điều chỉnh / hoàn trả</span> (vd thưởng đã trả thừa).
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
            <span className="px-3 py-2 text-sm font-medium bg-orange-500 text-white">
              Theo dòng
            </span>
            <Link
              href={`/costs?view=byUnit${projectId ? "&projectId=" + projectId : ""}${costType ? "&costType=" + costType : ""}${unitCode ? "&unitCode=" + encodeURIComponent(unitCode) : ""}`}
              className="px-3 py-2 text-sm font-medium bg-white text-slate-600 hover:bg-slate-50 border-l border-slate-300"
              title="Xem gộp theo căn × loại (list căn nào chưa chi)"
            >
              Theo căn × loại
            </Link>
          </div>
          <Link
            href="/costs/bulk"
            className="bg-slate-100 border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-200"
          >
            📊 Nhập hàng loạt
          </Link>
          <Link
            href="/costs/new"
            className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"
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

      <BulkDeleteBar
        entityLabel="đối chiếu giá vốn"
        onDelete={async (ids) => {
          "use server";
          return await deleteCostBulk(ids);
        }}
      />

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="p-2 w-8"></th>
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
                          <td colSpan={12} className="p-2 text-xs">
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
                  <tr
                    key={r.id}
                    data-bulk-row-id={r.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      className="js-bulk-check cursor-pointer"
                      data-bulk-id={r.id}
                    />
                  </td>
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
                      href={`/costs/${r.id}/edit${
                        returnToQS ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
                      }`}
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
                <td colSpan={12} className="p-6 text-center text-slate-500">
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

// ============================================================================
// View "Theo căn × loại" — list mọi (căn × loại chi phí) với target/đã chi/%.
// Trả lời được câu hỏi: "những căn nào KPI TPKD chưa chi (0%)".
// ============================================================================
type AggregatedProps = {
  projectIdParam?: string;
  costTypeParam?: string;
  unitCodeParam?: string;
  salesPersonParam?: string;
  statusParam?: string;
};

async function AggregatedCostsView(props: AggregatedProps) {
  const filterProjectId = props.projectIdParam ? Number(props.projectIdParam) : null;
  const filterCostType = props.costTypeParam || null;
  const filterUnitCode = props.unitCodeParam?.trim().toLowerCase() || null;
  const filterSalesPerson = props.salesPersonParam?.trim().toLowerCase() || null;
  const filterStatus =
    props.statusParam &&
    ["not_started", "partial", "done", "over"].includes(props.statusParam)
      ? (props.statusParam as "not_started" | "partial" | "done" | "over")
      : null;

  const COST_TYPE_LIST = [
    "sale_commission",
    "customer_support",
    "bonus_sale",
    "bonus_manager",
    "cdt_bonus_sale",
    "cdt_bonus_manager",
    "kpi_ceo",
    "kpi_tpkd",
    "kpi_admin",
  ] as const;

  const [allProjects, prodRows, costAgg] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, fullCode: projects.fullCode })
      .from(projects)
      .orderBy(projects.name),
    db
      .select({
        id: products.id,
        unitCode: products.unitCode,
        productCode: products.productCode,
        projectId: products.projectId,
        projectName: projects.name,
        partnerName: partners.name,
        salesPerson: products.salesPerson,
        pmgBasePrice: products.pmgBasePrice,
        pmgSaleRate: products.pmgSaleRate,
        pmgRate: products.pmgRate,
        adminFeeSale: products.adminFeeSale,
        customerSupport: products.customerSupport,
        saleCommissionRate: products.saleCommissionRate,
        kpiCeoRate: products.kpiCeoRate,
        kpiTpkdRate: products.kpiTpkdRate,
        kpiAdminRate: products.kpiAdminRate,
        bonusSale: products.bonusSale,
        bonusManager: products.bonusManager,
        cdtBonusSale: products.cdtBonusSale,
        cdtBonusManager: products.cdtBonusManager,
        depositDate: products.depositDate,
      })
      .from(products)
      .leftJoin(projects, eq(products.projectId, projects.id))
      .leftJoin(partners, eq(projects.partnerId, partners.id)),
    db
      .select({
        productId: costReconciliations.productId,
        costType: costReconciliations.costType,
        payable: sum(costReconciliations.amountPayableThisTime).as("payable"),
      })
      .from(costReconciliations)
      .groupBy(costReconciliations.productId, costReconciliations.costType),
  ]);

  // Map (productId, costType) → sum payable
  const payableMap = new Map<string, number>();
  for (const r of costAgg) {
    payableMap.set(`${r.productId}|${r.costType}`, Number(r.payable ?? 0));
  }

  type Row = {
    productId: number;
    unitCode: string;
    projectName: string;
    partnerName: string | null;
    salesPerson: string | null;
    depositDate: string | null;
    costType: string;
    target: number;
    payable: number;
    pct: number;
    remaining: number;
    status: "not_started" | "partial" | "done" | "over" | "na";
  };
  const rows: Row[] = [];
  for (const p of prodRows) {
    const cfg = {
      pmgBasePrice: Number(p.pmgBasePrice ?? 0),
      pmgSaleRate: Number(p.pmgSaleRate ?? 0) || Number(p.pmgRate ?? 0),
      adminFeeSale: Number(p.adminFeeSale ?? 0),
      customerSupport: Number(p.customerSupport ?? 0),
      saleCommissionRate: Number(p.saleCommissionRate ?? 0),
      kpiCeoRate: Number(p.kpiCeoRate ?? 0),
      kpiTpkdRate: Number(p.kpiTpkdRate ?? 0),
      kpiAdminRate: Number(p.kpiAdminRate ?? 0),
      bonusSale: Number(p.bonusSale ?? 0),
      bonusManager: Number(p.bonusManager ?? 0),
      cdtBonusSale: Number(p.cdtBonusSale ?? 0),
      cdtBonusManager: Number(p.cdtBonusManager ?? 0),
    };
    for (const t of COST_TYPE_LIST) {
      const target = computeLuyKe(cfg, t, 1);
      const payable = payableMap.get(`${p.id}|${t}`) ?? 0;
      if (target < 1000 && Math.abs(payable) < 1000) continue; // căn không có loại này
      const pct = target > 0 ? (payable / target) * 100 : 0;
      const remaining = Math.max(0, target - payable);
      let s: Row["status"];
      if (target < 1000) s = "na";
      else if (Math.abs(payable) < 1000) s = "not_started";
      else if (payable > target + 1000) s = "over";
      else if (Math.abs(payable - target) < 1000) s = "done";
      else s = "partial";
      rows.push({
        productId: p.id,
        unitCode: p.unitCode,
        projectName: p.projectName ?? "—",
        partnerName: p.partnerName,
        salesPerson: p.salesPerson,
        depositDate: p.depositDate,
        costType: t,
        target,
        payable,
        pct,
        remaining,
        status: s,
      });
    }
  }

  // Filter
  const filterProjectName = filterProjectId
    ? (allProjects.find((p) => p.id === filterProjectId)?.name ?? null)
    : null;
  const filtered = rows.filter((r) => {
    if (filterProjectName && r.projectName !== filterProjectName) return false;
    if (filterCostType && r.costType !== filterCostType) return false;
    if (filterUnitCode && !r.unitCode.toLowerCase().includes(filterUnitCode)) return false;
    if (filterSalesPerson && !(r.salesPerson ?? "").toLowerCase().includes(filterSalesPerson))
      return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  // Sort: chưa chi → chi 1 phần → chi quá → chi đủ, trong nhóm sort target desc
  const statusOrder: Record<Row["status"], number> = {
    not_started: 1,
    partial: 2,
    over: 3,
    done: 4,
    na: 5,
  };
  filtered.sort((a, b) => {
    const s = statusOrder[a.status] - statusOrder[b.status];
    if (s !== 0) return s;
    if (a.costType !== b.costType) return a.costType.localeCompare(b.costType);
    return b.target - a.target;
  });

  // Summary counts
  const statusCounts: Record<string, number> = {
    not_started: 0,
    partial: 0,
    done: 0,
    over: 0,
  };
  const scopeRows = rows.filter((r) => {
    if (filterProjectName && r.projectName !== filterProjectName) return false;
    if (filterCostType && r.costType !== filterCostType) return false;
    if (filterUnitCode && !r.unitCode.toLowerCase().includes(filterUnitCode)) return false;
    if (filterSalesPerson && !(r.salesPerson ?? "").toLowerCase().includes(filterSalesPerson))
      return false;
    return r.status !== "na";
  });
  for (const r of scopeRows) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

  const costTypes = [
    { v: "sale_commission", l: "Hoa hồng sale" },
    { v: "customer_support", l: "Hỗ trợ khách" },
    { v: "bonus_sale", l: "Thưởng NVKD (CTY)" },
    { v: "bonus_manager", l: "Thưởng TPKD (CTY)" },
    { v: "cdt_bonus_sale", l: "Thưởng nóng CĐT (NVKD)" },
    { v: "cdt_bonus_manager", l: "Thưởng nóng CĐT (TPKD)" },
    { v: "kpi_ceo", l: "KPI CEO" },
    { v: "kpi_tpkd", l: "KPI TPKD" },
    { v: "kpi_admin", l: "KPI Admin" },
  ];

  const statusLabels: Record<string, { label: string; cls: string }> = {
    not_started: { label: "Chưa chi", cls: "bg-amber-100 text-amber-700 border-amber-300" },
    partial: { label: "Đang chi", cls: "bg-blue-100 text-blue-700 border-blue-300" },
    done: { label: "Đã đủ", cls: "bg-green-100 text-green-700 border-green-300" },
    over: { label: "Chi quá", cls: "bg-purple-100 text-purple-700 border-purple-300" },
  };

  // Build query preserving current filters when switching status
  const buildStatusHref = (s: string | null) => {
    const qs = new URLSearchParams();
    qs.set("view", "byUnit");
    if (props.projectIdParam) qs.set("projectId", props.projectIdParam);
    if (filterCostType) qs.set("costType", filterCostType);
    if (props.unitCodeParam) qs.set("unitCode", props.unitCodeParam);
    if (props.salesPersonParam) qs.set("salesPerson", props.salesPersonParam);
    if (s) qs.set("status", s);
    return `/costs?${qs.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Đối chiếu giá vốn</h1>
          <p className="text-sm text-slate-500 mt-1">
            View <b>Theo căn × loại</b>: mỗi dòng = 1 căn × 1 loại chi phí. Hiện đủ căn dù chưa
            có đối chiếu nào — tiện lọc &quot;căn nào loại X chưa chi&quot;.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
            <Link
              href={`/costs${filterProjectId ? "?projectId=" + filterProjectId : ""}`}
              className="px-3 py-2 text-sm font-medium bg-white text-slate-600 hover:bg-slate-50"
            >
              Theo dòng
            </Link>
            <span className="px-3 py-2 text-sm font-medium bg-orange-500 text-white border-l border-slate-300">
              Theo căn × loại
            </span>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3 items-end flex-wrap">
        <form className="flex gap-2 items-end flex-wrap">
          <input type="hidden" name="view" value="byUnit" />
          <div>
            <label className="block text-xs text-slate-600 mb-1">Mã căn</label>
            <input
              type="text"
              name="unitCode"
              defaultValue={props.unitCodeParam ?? ""}
              className="input min-w-32"
              placeholder="A.25.06 …"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Dự án</label>
            <SearchableSelect
              name="projectId"
              defaultValue={props.projectIdParam ?? ""}
              emptyOption="— Tất cả —"
              placeholder="Gõ tên dự án..."
              className="min-w-72"
              options={allProjects.map((p) => ({ value: p.id, label: p.name, sublabel: p.fullCode }))}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">NVKD</label>
            <input
              type="text"
              name="salesPerson"
              defaultValue={props.salesPersonParam ?? ""}
              className="input min-w-40"
              placeholder="Hồ Gia …"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Loại chi phí</label>
            <select
              name="costType"
              defaultValue={filterCostType ?? ""}
              className="input min-w-48"
            >
              <option value="">— Tất cả —</option>
              {costTypes.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </div>
          {filterStatus && <input type="hidden" name="status" value={filterStatus} />}
          <button className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200">
            Lọc
          </button>
          {(filterProjectId || filterCostType || filterUnitCode || filterSalesPerson || filterStatus) && (
            <Link
              href="/costs?view=byUnit"
              className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200"
            >
              Reset
            </Link>
          )}
        </form>
      </div>

      {/* Status chips (click để filter theo trạng thái) */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-slate-500 mr-1">Trạng thái:</span>
        <Link
          href={buildStatusHref(null)}
          className={`text-xs px-3 py-1.5 rounded-lg border ${
            !filterStatus
              ? "bg-slate-800 text-white border-slate-800"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
          }`}
        >
          Tất cả ({scopeRows.length})
        </Link>
        {(["not_started", "partial", "over", "done"] as const).map((s) => {
          const info = statusLabels[s];
          const isActive = filterStatus === s;
          return (
            <Link
              key={s}
              href={buildStatusHref(s)}
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                isActive ? info.cls + " font-semibold" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {info.label} ({statusCounts[s] ?? 0})
            </Link>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-2">Loại chi phí</th>
              <th className="text-left p-2">Căn</th>
              <th className="text-left p-2">Dự án</th>
              <th className="text-left p-2">NVKD</th>
              <th className="text-right p-2">Target</th>
              <th className="text-right p-2">Đã chi</th>
              <th className="text-right p-2">%</th>
              <th className="text-right p-2">Còn thiếu</th>
              <th className="text-left p-2">Trạng thái</th>
              <th className="text-right p-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => {
              const info = statusLabels[r.status] ?? {
                label: r.status,
                cls: "bg-slate-100 text-slate-600 border-slate-300",
              };
              const showLoaiHdr = idx === 0 || filtered[idx - 1].costType !== r.costType;
              return (
                <>
                  {showLoaiHdr && !filterCostType && (
                    <tr key={`hdr-${r.costType}`} className="bg-slate-100 border-t-2 border-slate-300">
                      <td colSpan={10} className="p-2 text-xs font-semibold text-slate-700">
                        {costTypeLabel(r.costType)}
                      </td>
                    </tr>
                  )}
                  <tr
                    key={`${r.productId}|${r.costType}`}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="p-2 text-xs">{costTypeLabel(r.costType)}</td>
                    <td className="p-2">
                      <Link
                        href={`/products/${r.productId}`}
                        className="font-mono text-xs text-blue-600 hover:underline"
                      >
                        {r.unitCode}
                      </Link>
                    </td>
                    <td className="p-2 text-xs text-slate-700">{r.projectName}</td>
                    <td className="p-2 text-xs text-slate-700">
                      {toTitleCase(r.salesPerson) || "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(r.target)}</td>
                    <td className="p-2 text-right tabular-nums text-green-700">
                      {r.payable !== 0 ? (
                        fmtMoney(r.payable)
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${
                        r.status === "done"
                          ? "text-green-700"
                          : r.status === "over"
                            ? "text-purple-700"
                            : r.status === "partial"
                              ? "text-blue-700"
                              : "text-amber-700"
                      }`}
                    >
                      {r.pct.toFixed(0)}%
                    </td>
                    <td
                      className={`p-2 text-right tabular-nums ${
                        r.remaining < 1000 ? "text-slate-400" : "text-red-600"
                      }`}
                    >
                      {r.remaining >= 1000 ? fmtMoney(r.remaining) : "—"}
                    </td>
                    <td className="p-2">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded border font-medium whitespace-nowrap ${info.cls}`}
                      >
                        {info.label}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <Link
                        href={`/costs/new?productId=${r.productId}&costType=${r.costType}`}
                        className="text-blue-600 hover:underline text-xs whitespace-nowrap"
                      >
                        + Tạo ĐC
                      </Link>
                    </td>
                  </tr>
                </>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-500">
                  Không có căn nào khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
