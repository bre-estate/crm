import { db } from "@/lib/db";
import {
  revenueReconciliations,
  products,
  projects,
  partners,
  invoices,
  paymentsIn,
} from "@/lib/schema";
import { fmtMoney, fmtDate, fmtPct, displayPartnerName } from "@/lib/format";
import { eq, desc, sum, and, ilike, type SQL } from "drizzle-orm";
import Link from "next/link";
import SearchableSelect from "@/components/SearchableSelect";
import HighlightManager from "../HighlightManager";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  projectId?: string;
  unitCode?: string;
  tab?: string;
  status?: string;
  justCreated?: string;
}>;

const STATUS_OPTIONS = [
  { key: "all", label: "Tất cả", icon: "" },
  { key: "done", label: "Hoàn thành", icon: "" },
  { key: "waiting_pay", label: "Đã ĐC", icon: "" },
  { key: "partial", label: "Đã ĐC · TT 1 phần", icon: "" },
  { key: "no_date", label: "Chưa ĐC", icon: "" },
] as const;

export default async function RevenuesPage({ searchParams }: { searchParams: SearchParams }) {
  const { projectId, unitCode, tab, status, justCreated } = await searchParams;
  const filterProjectId = projectId ? Number(projectId) : null;
  const filterUnitCode = unitCode?.trim() || null;
  const activeTab: "primary" | "secondary" = tab === "secondary" ? "secondary" : "primary";
  const activeStatus = (STATUS_OPTIONS.find((s) => s.key === status)?.key ?? "all") as (typeof STATUS_OPTIONS)[number]["key"];
  const justCreatedIds = new Set<number>(
    (justCreated ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );

  const returnToParams = new URLSearchParams();
  if (projectId) returnToParams.set("projectId", String(projectId));
  if (unitCode) returnToParams.set("unitCode", String(unitCode));
  if (tab) returnToParams.set("tab", String(tab));
  if (status) returnToParams.set("status", String(status));
  const returnToQs = returnToParams.toString();
  const returnTo = returnToQs ? `/revenues?${returnToQs}` : "/revenues";
  const editQs = `?returnTo=${encodeURIComponent(returnTo)}`;

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
    cdtBonusSale: revenueReconciliations.cdtBonusSale,
    cdtBonusManager: revenueReconciliations.cdtBonusManager,
    totalReceivable: revenueReconciliations.totalReceivableThisTime,
    note: revenueReconciliations.note,
    invoiceNumber: invoices.invoiceNumber,
    invoiceDate: invoices.invoiceDate,
    unitCode: products.unitCode,
    productPmgRate: products.pmgRate,
    productSaleType: products.saleType,
    projectName: projects.name,
    partnerName: partners.name,
    projectId: projects.id,
  };

  const whereParts: SQL[] = [eq(products.saleType, activeTab)];
  if (filterProjectId) whereParts.push(eq(products.projectId, filterProjectId));
  if (filterUnitCode) whereParts.push(ilike(products.unitCode, `%${filterUnitCode}%`));

  const baseQuery = db
    .select(selectCols)
    .from(revenueReconciliations)
    .leftJoin(products, eq(revenueReconciliations.productId, products.id))
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .leftJoin(invoices, eq(revenueReconciliations.invoiceId, invoices.id));

  const rowsRaw = await baseQuery
    .where(whereParts.length === 1 ? whereParts[0] : and(...whereParts))
    .orderBy(desc(revenueReconciliations.id));

  // Float justCreated rows lên đầu (nếu có ?justCreated=id1,id2)
  const rows = justCreatedIds.size > 0
    ? [
        ...rowsRaw.filter((r) => justCreatedIds.has(r.id)),
        ...rowsRaw.filter((r) => !justCreatedIds.has(r.id)),
      ]
    : rowsRaw;

  // Count both tabs for badge
  const countByTypeRaw = await db
    .select({ saleType: products.saleType })
    .from(revenueReconciliations)
    .leftJoin(products, eq(revenueReconciliations.productId, products.id));
  let primaryCount = 0;
  let secondaryCount = 0;
  for (const r of countByTypeRaw) {
    if (r.saleType === "secondary") secondaryCount++;
    else primaryCount++;
  }

  const paymentAgg = await db
    .select({
      recId: paymentsIn.reconciliationId,
      total: sum(paymentsIn.amount).as("total"),
    })
    .from(paymentsIn)
    .groupBy(paymentsIn.reconciliationId);
  const paidMap = new Map(paymentAgg.map((r) => [r.recId, Number(r.total ?? 0)]));

  // Compute status per recon và filter theo activeStatus
  const rowsWithStatus = rows.map((r) => {
    const paid = paidMap.get(r.id) ?? 0;
    const receivable = Number(r.totalReceivable ?? 0);
    const hasDate = !!r.date;
    const isFullyPaid = receivable > 0 && Math.abs(paid - receivable) < 1000;
    const isPartial = paid > 0 && !isFullyPaid;
    let statusKey: (typeof STATUS_OPTIONS)[number]["key"] = "all";
    if (!hasDate) statusKey = "no_date";
    else if (isFullyPaid) statusKey = "done";
    else if (isPartial) statusKey = "partial";
    else statusKey = "waiting_pay";
    return { r, paid, status: statusKey };
  });
  const filteredRows = activeStatus === "all"
    ? rowsWithStatus
    : rowsWithStatus.filter((x) => x.status === activeStatus);
  const rows2 = filteredRows.map((x) => x.r);
  const statusOf = new Map(filteredRows.map((x) => [x.r.id, x.status]));

  const totalReceivable = rows2.reduce((s, r) => s + Number(r.totalReceivable ?? 0), 0);
  const totalPaid = rows2.reduce((s, r) => s + (paidMap.get(r.id) ?? 0), 0);

  // Count per status (từ toàn bộ rows chưa filter theo status)
  const statusCounts = new Map<string, number>();
  for (const x of rowsWithStatus) {
    statusCounts.set(x.status, (statusCounts.get(x.status) ?? 0) + 1);
  }
  statusCounts.set("all", rowsWithStatus.length);

  return (
    <div className="space-y-4">
      <HighlightManager />
      {justCreatedIds.size > 0 && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-sm text-green-800 flex items-center justify-between">
          <span>
            <span className="font-semibold">Đã tạo {justCreatedIds.size} đợt đối chiếu</span>{" "}
            (đang highlight ở đầu danh sách, sẽ mờ sau 3s).
          </span>
          <Link
            href="/revenues"
            className="text-green-700 hover:underline text-xs"
          >
            Đóng ×
          </Link>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Đối chiếu doanh thu</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tương ứng sheet 2.2_Doanh thu. Mỗi dòng = 1 sản phẩm × 1 đợt × 1 hóa đơn.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/revenues/bulk"
            className="bg-slate-100 border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-200"
          >
            📊 Nhập hàng loạt
          </Link>
          <Link
            href="/revenues/new"
            className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"
          >
            + Thêm đợt đối chiếu
          </Link>
        </div>
      </div>

      <div className="border-b border-slate-200 flex gap-1">
        {[
          { key: "primary", label: "Sơ cấp", count: primaryCount },
          { key: "secondary", label: "Thứ cấp", count: secondaryCount },
        ].map((t) => {
          const isActive = activeTab === t.key;
          const params = new URLSearchParams();
          params.set("tab", t.key);
          if (filterProjectId) params.set("projectId", String(filterProjectId));
          if (filterUnitCode) params.set("unitCode", filterUnitCode);
          return (
            <Link
              key={t.key}
              href={`/revenues?${params.toString()}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                isActive
                  ? "border-orange-500 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}{" "}
              <span
                className={`text-xs ml-1 ${isActive ? "text-blue-500" : "text-slate-400"}`}
              >
                ({t.count})
              </span>
            </Link>
          );
        })}
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-500 mr-1">Trạng thái:</span>
        {STATUS_OPTIONS.map((s) => {
          const isActive = activeStatus === s.key;
          const count = statusCounts.get(s.key) ?? 0;
          const params = new URLSearchParams();
          params.set("tab", activeTab);
          if (filterProjectId) params.set("projectId", String(filterProjectId));
          if (filterUnitCode) params.set("unitCode", filterUnitCode);
          if (s.key !== "all") params.set("status", s.key);
          return (
            <Link
              key={s.key}
              href={`/revenues?${params.toString()}`}
              className={`text-xs px-3 py-1 rounded-full border transition ${
                isActive
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {s.icon} {s.label}
              <span className={`ml-1 ${isActive ? "text-blue-100" : "text-slate-400"}`}>({count})</span>
            </Link>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 items-end flex-wrap">
        <form className="flex gap-2 items-end flex-wrap">
          <input type="hidden" name="tab" value={activeTab} />
          <div>
            <label className="block text-xs text-slate-600 mb-1">Mã căn</label>
            <input
              type="text"
              name="unitCode"
              defaultValue={filterUnitCode ?? ""}
              className="input min-w-32"
              placeholder="vd: A.25.26"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Lọc theo dự án</label>
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
          <button className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200">
            Lọc
          </button>
          {(filterProjectId || filterUnitCode) && (
            <Link
              href={`/revenues?tab=${activeTab}`}
              className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200"
            >
              Reset
            </Link>
          )}
        </form>
        <div className="flex gap-6 text-sm ml-auto">
          <div>
            <div className="text-xs text-slate-500">Số đợt ĐC</div>
            <div className="font-bold">{rows2.length}</div>
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
            <div
              className={`font-bold tabular-nums ${
                totalReceivable - totalPaid < 1000 ? "text-slate-400" : "text-red-600"
              }`}
            >
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
              <th className="text-left p-2">Số HĐ</th>
              <th className="text-left p-2">Ngày HĐ</th>
              {activeTab === "primary" && (
                <>
                  <th className="text-right p-2" title="%PMG_LK toàn hợp đồng của căn">Tổng %PMG</th>
                  <th className="text-center p-2">Đợt</th>
                  <th className="text-right p-2">%PMG lũy kế</th>
                </>
              )}
              <th className="text-right p-2">Phải thu</th>
              <th className="text-right p-2">Đã thu</th>
              <th className="text-right p-2">Còn phải thu</th>
              <th className="text-left p-2">Trạng thái</th>
              <th className="text-right p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows2.map((r) => {
              const receivable = Number(r.totalReceivable ?? 0);
              const paid = paidMap.get(r.id) ?? 0;
              const remaining = receivable - paid;
              const revThis = Number(r.revThis ?? 0);
              const cdtBonusSale = Number(r.cdtBonusSale ?? 0);
              const cdtBonusMgr = Number(r.cdtBonusManager ?? 0);
              const isBonus = revThis === 0 && (cdtBonusSale > 0 || cdtBonusMgr > 0);
              const isJustCreated = justCreatedIds.has(r.id);
              return (
                <tr
                  key={r.id}
                  data-just-created={isJustCreated ? "1" : undefined}
                  className={`border-t border-slate-100 hover:bg-slate-50 ${
                    isJustCreated
                      ? "highlight-fade"
                      : isBonus
                        ? "bg-amber-50/40"
                        : ""
                  }`}
                >
                  <td className="p-2 text-xs">{fmtDate(r.date)}</td>
                  <td className="p-2">
                    <div className="text-xs font-medium">{r.projectName}</div>
                    <div className="text-xs text-slate-500">{displayPartnerName(r.partnerName)}</div>
                  </td>
                  <td className="p-2">
                    <Link
                      href={`/products/${r.productId}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {r.unitCode}
                    </Link>
                    {isBonus && (
                      <span
                        className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap"
                        title={
                          cdtBonusMgr > 0
                            ? "Thưởng nóng CĐT cho QL sàn"
                            : "Thưởng nóng CĐT cho sale"
                        }
                      >
                        Thưởng nóng
                      </span>
                    )}
                    {r.note && r.note.trim() && (
                      <span
                        className="ml-1 text-slate-400 cursor-help"
                        title={r.note}
                      >
                        📝
                      </span>
                    )}
                  </td>
                  <td className="p-2 font-mono text-xs">{r.invoiceNumber ?? "—"}</td>
                  <td className="p-2 text-xs">{fmtDate(r.invoiceDate)}</td>
                  {activeTab === "primary" && (
                    <>
                      <td className="p-2 text-right tabular-nums text-xs">
                        {Number(r.productPmgRate ?? 0) > 0 ? (
                          fmtPct(r.productPmgRate)
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-2 text-center text-xs">
                        {r.note?.trim() ? r.note : r.phase ? `Đợt ${r.phase}` : "—"}
                      </td>
                      <td className="p-2 text-right tabular-nums text-xs">
                        {r.pmgCumPct ? fmtPct(r.pmgCumPct) : "—"}
                      </td>
                    </>
                  )}
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {fmtMoney(r.totalReceivable)}
                  </td>
                  <td className="p-2 text-right tabular-nums text-green-700">
                    {paid > 0 ? fmtMoney(paid) : <span className="text-slate-400">Chưa thu</span>}
                  </td>
                  <td
                    className={`p-2 text-right tabular-nums ${
                      remaining < 1000 ? "text-slate-400" : "text-red-600 font-semibold"
                    }`}
                  >
                    {remaining > 0 ? fmtMoney(remaining) : "—"}
                  </td>
                  <td className="p-2">
                    {(() => {
                      const st = statusOf.get(r.id) ?? "all";
                      const opt = STATUS_OPTIONS.find((s) => s.key === st);
                      const colorMap: Record<string, string> = {
                        done: "bg-green-100 text-green-700",
                        waiting_pay: "bg-yellow-100 text-yellow-700",
                        partial: "bg-orange-100 text-orange-700",
                        no_date: "bg-slate-100 text-slate-600",
                        all: "bg-slate-100 text-slate-500",
                      };
                      return (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${colorMap[st]}`}
                        >
                          {opt?.icon} {opt?.label ?? "—"}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="p-2 text-right">
                    <Link
                      href={`/revenues/${r.id}/edit${editQs}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Sửa
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows2.length === 0 && (
              <tr>
                <td colSpan={activeTab === "primary" ? 13 : 10} className="p-6 text-center text-slate-500">
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
