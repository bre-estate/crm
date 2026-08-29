import { db } from "@/lib/db";
import {
  revenueReconciliations,
  products,
  projects,
  partners,
  invoices,
  paymentsIn,
  employees,
} from "@/lib/schema";
import { fmtMoney, fmtDate, fmtPct, displayPartnerName } from "@/lib/format";
import { eq, desc, sum, and, ilike, type SQL } from "drizzle-orm";
import Link from "next/link";
import SearchableSelect from "@/components/SearchableSelect";
import RevenuesFilterForm from "./RevenuesFilterForm";
import Pagination from "@/components/Pagination";
import HighlightManager from "../HighlightManager";
import BulkDeleteBar from "../BulkDeleteBar";
import { deleteRevenueBulk } from "@/lib/actions/revenues";
import { hasPermission } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import AutoDismissBanner from "@/components/AutoDismissBanner";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  projectId?: string;
  unitCode?: string;
  salesPerson?: string;
  tab?: string;
  status?: string;
  age?: string;
  type?: string; // "commission" | "bonus" | "all"
  justCreated?: string;
  page?: string;
}>;

const STATUS_OPTIONS = [
  { key: "all", label: "Tất cả", icon: "" },
  { key: "done", label: "Hoàn thành", icon: "" },
  { key: "waiting_pay", label: "Đã ĐC", icon: "" },
  { key: "partial", label: "Đã ĐC · TT 1 phần", icon: "" },
  { key: "no_date", label: "Chưa ĐC", icon: "" },
] as const;

const TYPE_OPTIONS = [
  { key: "all", label: "Tất cả" },
  { key: "commission", label: "HH Sale" },
  { key: "bonus", label: "Thưởng nóng CĐT" },
] as const;

// Bucket theo số ngày CĐT chưa trả từ ngày ĐC. Chỉ áp dụng cho recon chưa
// thu đủ (waiting_pay / partial). "done" và "no_date" không có ý nghĩa.
const AGE_OPTIONS = [
  { key: "all", label: "Tất cả tuổi" },
  { key: "0_30", label: "≤ 1 tháng" },
  { key: "31_90", label: "1–3 tháng" },
  { key: "90+", label: "> 3 tháng" },
] as const;

export default async function RevenuesPage({ searchParams }: { searchParams: SearchParams }) {
  const canDelete = await hasPermission("revenues", "delete");
  const { projectId, unitCode, salesPerson, tab, status, age, type, justCreated, page: pageParam } = await searchParams;
  const filterProjectId = projectId ? Number(projectId) : null;
  const filterUnitCode = unitCode?.trim() || null;
  const filterSalesPerson = salesPerson?.trim() || null;
  // Thứ cấp đã có trang riêng — /revenues chỉ show DT sơ cấp
  const activeTab: "primary" = "primary";
  const activeStatus = (STATUS_OPTIONS.find((s) => s.key === status)?.key ?? "all") as (typeof STATUS_OPTIONS)[number]["key"];
  const activeAge = (AGE_OPTIONS.find((a) => a.key === age)?.key ?? "all") as (typeof AGE_OPTIONS)[number]["key"];
  const activeType = (TYPE_OPTIONS.find((t) => t.key === type)?.key ?? "all") as (typeof TYPE_OPTIONS)[number]["key"];
  const justCreatedIds = new Set<number>(
    (justCreated ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );

  const returnToParams = new URLSearchParams();
  if (projectId) returnToParams.set("projectId", String(projectId));
  if (unitCode) returnToParams.set("unitCode", String(unitCode));
  // tab param legacy — không dùng nữa (chỉ có "primary")
  void tab;
  if (status) returnToParams.set("status", String(status));
  if (age) returnToParams.set("age", String(age));
  if (type) returnToParams.set("type", String(type));
  if (salesPerson) returnToParams.set("salesPerson", String(salesPerson));
  const returnToQs = returnToParams.toString();
  const returnTo = returnToQs ? `/revenues?${returnToQs}` : "/revenues";
  const editQs = `?returnTo=${encodeURIComponent(returnTo)}`;

  const [allProjects, nvkdOptions] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, fullCode: projects.fullCode })
      .from(projects)
      .orderBy(projects.name),
    db
      .select({ name: employees.name, position: employees.position })
      .from(employees)
      .where(and(eq(employees.active, true), eq(employees.position, "nvkd")))
      .orderBy(employees.name)
      .then((rows) =>
        rows.map((r) => ({ value: r.name, label: r.name, sublabel: "NVKD" })),
      ),
  ]);

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
    salesPerson: products.salesPerson,
    projectName: projects.name,
    partnerName: partners.name,
    projectId: projects.id,
  };

  // Nếu vừa từ bulk về → bỏ hết filter (kể cả tab primary/secondary)
  const skipFilters = justCreatedIds.size > 0;
  const whereParts: SQL[] = skipFilters ? [] : [eq(products.saleType, activeTab)];
  if (!skipFilters) {
    if (filterProjectId) whereParts.push(eq(products.projectId, filterProjectId));
    if (filterUnitCode) whereParts.push(ilike(products.unitCode, `%${filterUnitCode}%`));
    if (filterSalesPerson) whereParts.push(ilike(products.salesPerson, `%${filterSalesPerson}%`));
  }

  const baseQuery = db
    .select(selectCols)
    .from(revenueReconciliations)
    .leftJoin(products, eq(revenueReconciliations.productId, products.id))
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .leftJoin(invoices, eq(revenueReconciliations.invoiceId, invoices.id));

  const rowsRaw = await baseQuery
    .where(
      whereParts.length === 0
        ? undefined
        : whereParts.length === 1
          ? whereParts[0]
          : and(...whereParts),
    )
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

  // Today for age computation
  const todayMs = Date.now();
  const dayMs = 24 * 3600 * 1000;

  // Compute status + age per recon
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

    // Age = số ngày từ reconciliationDate đến hôm nay (chỉ khi có date + chưa thu đủ)
    let daysUnpaid = -1;
    if (hasDate && !isFullyPaid && r.date) {
      const reconMs = new Date(r.date).getTime();
      if (Number.isFinite(reconMs)) daysUnpaid = Math.floor((todayMs - reconMs) / dayMs);
    }
    let ageKey: (typeof AGE_OPTIONS)[number]["key"] = "all";
    if (daysUnpaid < 0) ageKey = "all"; // không có age
    else if (daysUnpaid <= 30) ageKey = "0_30";
    else if (daysUnpaid <= 90) ageKey = "31_90";
    else ageKey = "90+";

    return { r, paid, status: statusKey, ageKey, daysUnpaid };
  });

  const filteredByStatus = skipFilters || activeStatus === "all"
    ? rowsWithStatus
    : rowsWithStatus.filter((x) => x.status === activeStatus);

  const filteredByAge = skipFilters || activeAge === "all"
    ? filteredByStatus
    : filteredByStatus.filter((x) => x.ageKey === activeAge && x.daysUnpaid >= 0);

  // Filter loại DT: hoa hồng (revThis > 0) vs thưởng nóng CĐT (revThis = 0 + có bonus)
  const filteredRows = skipFilters || activeType === "all"
    ? filteredByAge
    : filteredByAge.filter((x) => {
        const revThis = Number(x.r.revThis ?? 0);
        const bonus = Number(x.r.cdtBonusSale ?? 0) + Number(x.r.cdtBonusManager ?? 0);
        if (activeType === "commission") return revThis > 0;
        if (activeType === "bonus") return revThis === 0 && bonus > 0;
        return true;
      });

  const rowsAll = filteredRows.map((x) => x.r);
  const statusOf = new Map(filteredRows.map((x) => [x.r.id, x.status]));
  const ageOf = new Map(filteredRows.map((x) => [x.r.id, x.daysUnpaid]));

  // Stats tính trên TOÀN BỘ filtered (không phụ thuộc page hiện tại)
  const totalReceivable = rowsAll.reduce((s, r) => s + Number(r.totalReceivable ?? 0), 0);
  const totalPaid = rowsAll.reduce((s, r) => s + (paidMap.get(r.id) ?? 0), 0);

  // Pagination client-side (data đã load full, chỉ slice)
  const PAGE_SIZE = 70;
  const totalRowsCount = rowsAll.length;
  const currentPage = Math.max(1, Math.min(
    Math.ceil(totalRowsCount / PAGE_SIZE) || 1,
    Number(pageParam) || 1,
  ));
  const rows2 = rowsAll.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Count per status (từ toàn bộ rows chưa filter theo status)
  const statusCounts = new Map<string, number>();
  for (const x of rowsWithStatus) {
    statusCounts.set(x.status, (statusCounts.get(x.status) ?? 0) + 1);
  }
  statusCounts.set("all", rowsWithStatus.length);

  // Count per age (từ rows đã filter status — chỉ tính recon có age)
  const ageCounts = new Map<string, number>();
  for (const x of filteredByStatus) {
    if (x.daysUnpaid < 0) continue;
    ageCounts.set(x.ageKey, (ageCounts.get(x.ageKey) ?? 0) + 1);
  }
  ageCounts.set(
    "all",
    filteredByStatus.filter((x) => x.daysUnpaid >= 0).length,
  );

  // Count per type — tính từ rowsWithStatus (không phụ thuộc status/age filter)
  const typeCounts = new Map<string, number>();
  typeCounts.set("all", rowsWithStatus.length);
  for (const x of rowsWithStatus) {
    const revThis = Number(x.r.revThis ?? 0);
    const bonus = Number(x.r.cdtBonusSale ?? 0) + Number(x.r.cdtBonusManager ?? 0);
    if (revThis > 0) typeCounts.set("commission", (typeCounts.get("commission") ?? 0) + 1);
    else if (bonus > 0) typeCounts.set("bonus", (typeCounts.get("bonus") ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <HighlightManager />
      {justCreatedIds.size > 0 && (
        <AutoDismissBanner variant="success">
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="font-semibold">Đã tạo {justCreatedIds.size} đợt đối chiếu</span>{" "}
              (đang highlight ở đầu danh sách, sẽ mờ sau 3s).
            </span>
            <Link
              href="/revenues"
              className="text-green-700 hover:underline text-xs whitespace-nowrap"
            >
              Đóng ×
            </Link>
          </div>
        </AutoDismissBanner>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Đối chiếu doanh thu</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mỗi dòng = 1 đợt CĐT ghi nhận doanh thu cho BRE (HH sale theo tiến độ khách trả, hoặc thưởng nóng), kèm 1 hóa đơn.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" render={<Link href="/revenues/bulk" />}>
            📊 Nhập hàng loạt
          </Button>
          <Button
            render={<Link href="/revenues/new" />}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            + Thêm đợt đối chiếu
          </Button>
        </div>
      </div>



      {/* Age filter pills — chỉ ý nghĩa cho recon chưa thu đủ */}
      {(activeStatus === "all" || activeStatus === "waiting_pay" || activeStatus === "partial") && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-500 mr-1">CĐT chưa trả trong:</span>
          {AGE_OPTIONS.map((a) => {
            const isActive = activeAge === a.key;
            const count = ageCounts.get(a.key) ?? 0;
            const params = new URLSearchParams();
            if (filterProjectId) params.set("projectId", String(filterProjectId));
            if (filterUnitCode) params.set("unitCode", filterUnitCode);
            if (activeStatus !== "all") params.set("status", activeStatus);
            if (a.key !== "all") params.set("age", a.key);
            if (activeType !== "all") params.set("type", activeType);
            const color =
              a.key === "0_30"
                ? "text-emerald-700 border-emerald-300"
                : a.key === "31_90"
                  ? "text-amber-700 border-amber-300"
                  : a.key === "90+"
                    ? "text-red-700 border-red-300"
                    : "text-slate-700 border-slate-300";
            return (
              <Link
                key={a.key}
                href={`/revenues?${params.toString()}`}
                className={`text-xs px-3 py-1 rounded-full border transition ${
                  isActive
                    ? "bg-orange-500 text-white border-orange-500"
                    : `bg-white ${color} hover:bg-slate-50`
                }`}
              >
                {a.label}
                <span className={`ml-1 ${isActive ? "text-blue-100" : "text-slate-400"}`}>
                  ({count})
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <Card className="[--card-spacing:1rem] px-4 py-3 gap-4">
        <RevenuesFilterForm
          activeStatus={activeStatus}
          activeAge={activeAge}
          activeType={activeType}
          allProjects={allProjects}
          nvkdOptions={nvkdOptions}
          projectIdParam={projectId}
          unitCodeParam={filterUnitCode ?? undefined}
          salesPersonParam={filterSalesPerson ?? undefined}
          hasFilter={!!(filterProjectId || filterUnitCode || filterSalesPerson || activeStatus !== "all" || activeType !== "all")}
        />
      </Card>

      {/* Stats — nhỏ gọn, dưới filter (thống nhất với /costs, /products) */}
      <div className="flex gap-6 text-sm flex-wrap px-1">
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
            className={cn(
              "font-bold tabular-nums",
              totalReceivable - totalPaid < 1000 ? "text-slate-400" : "text-red-600",
            )}
          >
            {fmtMoney(totalReceivable - totalPaid)}
          </div>
        </div>
      </div>

      {canDelete && (
        <BulkDeleteBar
          entityLabel="đợt đối chiếu"
          onDelete={async (ids) => {
            "use server";
            return await deleteRevenueBulk(ids);
          }}
        />
      )}

      {/* Mobile card view (< md) */}
      <div className="md:hidden space-y-2">
        {rows2.map((r) => {
          const receivable = Number(r.totalReceivable ?? 0);
          const paid = paidMap.get(r.id) ?? 0;
          const remaining = receivable - paid;
          const cdtBonusSale = Number(r.cdtBonusSale ?? 0);
          const cdtBonusMgr = Number(r.cdtBonusManager ?? 0);
          const isBonus = Number(r.revThis ?? 0) === 0 && (cdtBonusSale > 0 || cdtBonusMgr > 0);
          const st = statusOf.get(r.id) ?? "all";
          const stOpt = STATUS_OPTIONS.find((s) => s.key === st);
          return (
            <div
              key={r.id}
              className="bg-card rounded-lg ring-1 ring-foreground/10 p-3 space-y-2"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/products/${r.productId}`}
                    className="font-mono text-sm font-semibold text-blue-600 hover:underline"
                  >
                    {r.unitCode}
                  </Link>
                  <div className="text-xs text-slate-500 truncate">
                    {r.projectName} · {displayPartnerName(r.partnerName)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums text-slate-900">
                    {fmtMoney(receivable)}
                  </div>
                  <div className="text-xs text-slate-500">{fmtDate(r.date)}</div>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isBonus ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap">
                      Thưởng nóng
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 whitespace-nowrap">
                      HH Sale
                    </span>
                  )}
                  {stOpt && (
                    <span className="text-slate-500 truncate">{stOpt.label}</span>
                  )}
                </div>
                <Link
                  href={`/revenues/${r.id}/edit${editQs}`}
                  className="text-blue-600 hover:underline text-xs shrink-0"
                >
                  Sửa →
                </Link>
              </div>
              <div className="text-xs pt-1 border-t border-slate-100 flex justify-between">
                <span className={paid > 0 ? "text-green-700" : "text-slate-400"}>
                  {paid > 0 ? `Đã thu: ${fmtMoney(paid)}` : "Chưa thu"}
                </span>
                <span className={remaining < 1000 ? "text-slate-400" : "text-red-600 font-medium"}>
                  {remaining >= 1000 ? `Còn: ${fmtMoney(remaining)}` : "✓ đủ"}
                </span>
              </div>
            </div>
          );
        })}
        {rows2.length === 0 && (
          <div className="text-center text-slate-500 text-sm p-8 bg-card rounded-lg ring-1 ring-foreground/10">
            Không có đợt đối chiếu nào.
          </div>
        )}
      </div>

      {/* Desktop table (≥ md) */}
      <Card className="hidden md:block p-0 gap-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="p-2 w-8"></th>
              <th className="text-left p-2">Ngày ĐC</th>
              <th className="text-left p-2">Dự án / Đối tác</th>
              <th className="text-left p-2">Mã căn</th>
              <th className="text-left p-2">Số HĐ</th>
              <th className="text-left p-2">Ngày HĐ</th>
              {activeTab === "primary" && (
                <>
                  <th className="text-right p-2" title="%PMG_LK toàn hợp đồng của căn">Tổng %PMG</th>
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
                  data-bulk-row-id={r.id}
                  className={`border-t border-slate-100 hover:bg-slate-50 ${
                    isJustCreated
                      ? "highlight-fade"
                      : isBonus
                        ? "bg-amber-50/40"
                        : ""
                  }`}
                >
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      className="js-bulk-check cursor-pointer"
                      data-bulk-id={r.id}
                    />
                  </td>
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
                    {/* Threshold khớp style: <1.000 VND (bao gồm 0, âm, float residue
                        như 0.30 VND) đều coi như đã thu đủ → hiển thị "—". */}
                    {remaining >= 1000 ? fmtMoney(remaining) : "—"}
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
                <td colSpan={activeTab === "primary" ? 14 : 11} className="p-6 text-center text-slate-500">
                  Chưa có đợt đối chiếu nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Pagination
        currentPage={currentPage}
        totalRows={totalRowsCount}
        pageSize={PAGE_SIZE}
        itemLabel="đợt ĐC"
        buildUrl={(p) => {
          const qs = new URLSearchParams();
          if (filterProjectId) qs.set("projectId", String(filterProjectId));
          if (filterUnitCode) qs.set("unitCode", filterUnitCode);
          if (filterSalesPerson) qs.set("salesPerson", filterSalesPerson);
          if (activeStatus !== "all") qs.set("status", activeStatus);
          if (activeAge !== "all") qs.set("age", activeAge);
          if (activeType !== "all") qs.set("type", activeType);
          if (p > 1) qs.set("page", String(p));
          return `/revenues${qs.toString() ? "?" + qs.toString() : ""}`;
        }}
      />
    </div>
  );
}
