import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  departments,
  revenueReconciliations,
  paymentsIn,
  employees,
} from "@/lib/schema";
import { fmtMoney, fmtDate, fmtPctTight, fmtPctRaw, displayPartnerName } from "@/lib/format";
import { eq, asc, desc, and, gte, lte, ilike, inArray, type SQL } from "drizzle-orm";
import Link from "next/link";
import SearchableSelect from "@/components/SearchableSelect";
import ProductsTable, { type ProductRow } from "./ProductsTable";
import { deleteProductBulk } from "@/lib/actions/products";
import HighlightManager from "../HighlightManager";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  projectId?: string;
  departmentId?: string;
  salesPerson?: string;
  tab?: string;
  from?: string;
  to?: string;
  unitCode?: string;
  justCreated?: string;
}>;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const { projectId, departmentId, salesPerson, tab, from, to, unitCode, justCreated } = await searchParams;
  // Parse ids vừa tạo (comma-separated). Set để O(1) lookup.
  const justCreatedIds = new Set<number>(
    (justCreated ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
  const filterProjectId = projectId ? Number(projectId) : null;
  const filterDeptId = departmentId ? Number(departmentId) : null;
  const activeTab: "primary" | "secondary" = tab === "secondary" ? "secondary" : "primary";
  const dateFrom = from?.trim() || null;
  const dateTo = to?.trim() || null;
  const filterUnitCode = unitCode?.trim() || null;
  const filterSalesPerson = salesPerson?.trim() || null;

  // Preserve filter state khi user vào edit rồi save → quay lại list
  const returnToParams = new URLSearchParams();
  if (projectId) returnToParams.set("projectId", String(projectId));
  if (departmentId) returnToParams.set("departmentId", String(departmentId));
  if (salesPerson) returnToParams.set("salesPerson", String(salesPerson));
  if (tab) returnToParams.set("tab", String(tab));
  if (from) returnToParams.set("from", String(from));
  if (to) returnToParams.set("to", String(to));
  if (unitCode) returnToParams.set("unitCode", String(unitCode));
  const returnToQs = returnToParams.toString();
  const returnTo = returnToQs ? `/products?${returnToQs}` : "/products";
  const detailQs = `?returnTo=${encodeURIComponent(returnTo)}`;

  const allProjects = await db
    .select({ id: projects.id, name: projects.name, fullCode: projects.fullCode })
    .from(projects)
    .orderBy(asc(projects.name));

  const allDepts = await db.select().from(departments).orderBy(asc(departments.name));

  const selectCols = {
    id: products.id,
    productCode: products.productCode,
    unitCode: products.unitCode,
    customerName: products.customerName,
    salesPerson: products.salesPerson,
    deptName: products.deptName,
    departmentId: products.departmentId,
    departmentName: departments.name,
    depositDate: products.depositDate,
    saleType: products.saleType,
    pmgBasePrice: products.pmgBasePrice,
    pmgRate: products.pmgRate,
    cdtBonusSale: products.cdtBonusSale,
    cdtBonusManager: products.cdtBonusManager,
    totalRevenue: products.totalRevenue,
    adminFee: products.adminFee,
    discountCk: products.discountCk,
    totalCost: products.totalCost,
    projectName: projects.name,
    partnerName: partners.name,
    projectId: products.projectId,
    note: products.note,
  };

  // Nếu vừa từ bulk về (?justCreated) → bỏ HẾT filter để user thấy các
  // căn mới, kể cả khác tab / dự án / phòng / dates. justCreated ids sẽ
  // được float lên đầu + highlight.
  const skipFilters = justCreatedIds.size > 0;
  const whereParts: SQL[] = skipFilters ? [] : [eq(products.saleType, activeTab)];
  if (!skipFilters) {
    if (filterProjectId) whereParts.push(eq(products.projectId, filterProjectId));
    if (filterDeptId) whereParts.push(eq(products.departmentId, filterDeptId));
    if (filterSalesPerson) whereParts.push(eq(products.salesPerson, filterSalesPerson));
    if (dateFrom) whereParts.push(gte(products.depositDate, dateFrom));
    if (dateTo) whereParts.push(lte(products.depositDate, dateTo));
    if (filterUnitCode) whereParts.push(ilike(products.unitCode, `%${filterUnitCode}%`));
  }

  const baseQuery = db
    .select(selectCols)
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .leftJoin(departments, eq(products.departmentId, departments.id));

  const rowsRaw = await baseQuery
    .where(
      whereParts.length === 0
        ? undefined
        : whereParts.length === 1
          ? whereParts[0]
          : and(...whereParts),
    )
    .orderBy(desc(products.id));

  // Ưu tiên: căn vừa tạo lên đầu (nếu ?justCreated=id1,id2), sau đó id DESC
  // (căn mới nhất theo thứ tự tạo). Trước dùng depositDate DESC nhưng căn
  // bulk chưa có depositDate → NULL xuống cuối → user không thấy được căn
  // vừa tạo.
  const rows = justCreatedIds.size > 0
    ? [
        ...rowsRaw.filter((r) => justCreatedIds.has(r.id)),
        ...rowsRaw.filter((r) => !justCreatedIds.has(r.id)),
      ]
    : rowsRaw;

  // Đếm cho tab badge
  const allTypeRaw = await db
    .select({ saleType: products.saleType })
    .from(products);
  let primaryCount = 0;
  let secondaryCount = 0;
  for (const p of allTypeRaw) {
    if (p.saleType === "secondary") secondaryCount++;
    else primaryCount++;
  }

  // Load employees để badge CTV + resolve dept/leader từ employees table
  // (fallback text field trên product record chỉ dùng khi employee không có).
  const allEmps = await db
    .select({
      name: employees.name,
      position: employees.position,
      departmentId: employees.departmentId,
    })
    .from(employees);
  const empByName = new Map(allEmps.map((e) => [e.name.toLowerCase(), e]));

  // Options cho dropdown NVKD — distinct sales_person hiện có trong products,
  // enrich với position từ employees để tag CTV. Sort alpha (VN accent-safe).
  const distinctSp = await db
    .selectDistinct({ name: products.salesPerson })
    .from(products);
  const salesPersonOptions = distinctSp
    .map((s) => s.name?.trim())
    .filter((n): n is string => !!n)
    .map((name) => {
      const emp = empByName.get(name.toLowerCase());
      return {
        name,
        position: emp?.position ?? null,
        isCtv: emp?.position === "ctv",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  // For each căn: tính phí HH dự kiến (theo %PMG_LK mới nhất, hồi tố) vs đã thu (từ payments_in).
  const productIds = rows.map((r) => r.id);
  const recRows =
    productIds.length === 0
      ? []
      : await db
          .select({
            id: revenueReconciliations.id,
            productId: revenueReconciliations.productId,
            revenueThisTime: revenueReconciliations.revenueThisTime,
            totalReceivable: revenueReconciliations.totalReceivableThisTime,
            cdtBonusSale: revenueReconciliations.cdtBonusSale,
            cdtBonusManager: revenueReconciliations.cdtBonusManager,
            pmgCumulativePct: revenueReconciliations.pmgCumulativePct,
            invoiceId: revenueReconciliations.invoiceId,
          })
          .from(revenueReconciliations)
          .where(inArray(revenueReconciliations.productId, productIds));
  const reconIds = recRows.map((r) => r.id);
  const paidByRecon = new Map<number, number>();
  if (reconIds.length > 0) {
    const paidRows = await db
      .select({
        reconciliationId: paymentsIn.reconciliationId,
        amount: paymentsIn.amount,
      })
      .from(paymentsIn)
      .where(inArray(paymentsIn.reconciliationId, reconIds));
    for (const pr of paidRows) {
      if (pr.reconciliationId == null) continue;
      paidByRecon.set(
        pr.reconciliationId,
        (paidByRecon.get(pr.reconciliationId) ?? 0) + Number(pr.amount ?? 0),
      );
    }
  }

  type Stats = {
    expectedHH: number; // HH sale dự kiến = pmgBase × latestPmgRate
    expectedBonus: number; // Thưởng nóng dự kiến
    receivedHH: number; // Đã ĐC = sum totalReceivable (biên bản/HĐ)
    receivedBonus: number; // Đã ĐC thưởng nóng
    paidHH: number; // Đã vào bank = sum payments_in (thông tin phụ)
    paidBonus: number;
    phaseCount: number;
    invoiceIds: Set<number>;
  };
  // Classify recon: cdtBonus > 0 && revThis == 0 → bonus recon; else HH recon
  const isBonusRecon = (rec: (typeof recRows)[number]) =>
    Number(rec.cdtBonusSale ?? 0) + Number(rec.cdtBonusManager ?? 0) > 0 &&
    Number(rec.revenueThisTime ?? 0) === 0;

  // Compute latestPmgRate per product
  const latestPmgByProduct = new Map<number, number>();
  for (const r of rows) latestPmgByProduct.set(r.id, Number(r.pmgRate ?? 0));
  for (const rec of recRows) {
    const cur = latestPmgByProduct.get(rec.productId) ?? 0;
    const p = Number(rec.pmgCumulativePct ?? 0);
    if (p > cur) latestPmgByProduct.set(rec.productId, p);
  }

  const statsByProduct = new Map<number, Stats>();
  for (const r of rows) {
    const grossTarget = Number(r.totalRevenue ?? 0);
    const latestPmg = latestPmgByProduct.get(r.id) ?? Number(r.pmgRate ?? 0);
    // Match /products/[id] detail: expected = pmgBase × latestPmg − adminFee (net).
    // Vì totalReceivable (Excel col AA) đã trừ phí admin.
    const expectedHH =
      r.saleType === "secondary"
        ? grossTarget
        : Math.max(0, Number(r.pmgBasePrice ?? 0) * latestPmg - Number(r.adminFee ?? 0));
    const expectedBonus =
      Number(r.cdtBonusSale ?? 0) + Number(r.cdtBonusManager ?? 0);
    statsByProduct.set(r.id, {
      expectedHH,
      expectedBonus,
      receivedHH: 0,
      receivedBonus: 0,
      paidHH: 0,
      paidBonus: 0,
      phaseCount: 0,
      invoiceIds: new Set<number>(),
    });
  }
  for (const rec of recRows) {
    const s = statsByProduct.get(rec.productId);
    if (!s) continue;
    const paid = paidByRecon.get(rec.id) ?? 0;
    const receivable = Number(rec.totalReceivable ?? 0);
    if (isBonusRecon(rec)) {
      s.receivedBonus += receivable;
      s.paidBonus += paid;
    } else {
      s.receivedHH += receivable;
      s.paidHH += paid;
      if (Number(rec.revenueThisTime ?? 0) > 0) s.phaseCount += 1;
    }
    if (rec.invoiceId !== null) s.invoiceIds.add(rec.invoiceId);
  }

  const totalRev = rows.reduce((s, r) => s + Number(r.totalRevenue ?? 0), 0);
  // Snap to 0 chênh lệch < 1k VND per product (dùng receivedHH — theo ĐC)
  for (const s of statsByProduct.values()) {
    if (Math.abs(s.expectedHH - s.receivedHH) < 1000) {
      s.expectedHH = s.receivedHH;
    }
  }
  // Đã ĐC (biên bản đã ký) = tổng totalReceivable từ recon
  const totalRecognized = Array.from(statsByProduct.values()).reduce(
    (s, x) => s + x.receivedHH + x.receivedBonus,
    0,
  );
  // Đã thu (tiền vào TK bank) = sum payments_in
  const totalPaid = Array.from(statsByProduct.values()).reduce(
    (s, x) => s + x.paidHH + x.paidBonus,
    0,
  );

  const deptColor = (code: string | null | undefined): string => {
    switch ((code ?? "").toLowerCase()) {
      case "hồ gia":
      case "ho gia":
        return "bg-blue-100 text-blue-700";
      case "blđ":
      case "bld":
        return "bg-purple-100 text-purple-700";
      case "1 tỷ":
      case "1 ty":
        return "bg-emerald-100 text-emerald-700";
      case "freelancer":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-slate-100 text-slate-500";
    }
  };

  return (
    <div className="space-y-4">
      <HighlightManager />
      {justCreatedIds.size > 0 && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-sm text-green-800 flex items-center justify-between">
          <span>
            <span className="font-semibold">Đã tạo {justCreatedIds.size} căn</span>{" "}
            (đang highlight ở đầu danh sách, sẽ mờ sau 3s).
          </span>
          <Link
            href="/products"
            className="text-green-700 hover:underline text-xs"
          >
            Đóng ×
          </Link>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Giao dịch (căn chốt)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mỗi dòng = 1 căn đã chốt cọc = 1 sản phẩm. Sơ cấp = HĐ CĐT, Thứ cấp = mua bán lại.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/products/bulk"
            className="bg-slate-100 border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-200"
          >
            📊 Nhập hàng loạt
          </Link>
          <Link
            href="/products/new"
            className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"
          >
            + Thêm giao dịch
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
          if (filterDeptId) params.set("departmentId", String(filterDeptId));
          if (filterSalesPerson) params.set("salesPerson", filterSalesPerson);
          if (filterUnitCode) params.set("unitCode", filterUnitCode);
          if (dateFrom) params.set("from", dateFrom);
          if (dateTo) params.set("to", dateTo);
          return (
            <Link
              key={t.key}
              href={`/products?${params.toString()}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                isActive
                  ? "border-orange-500 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}{" "}
              <span className={`text-xs ml-1 ${isActive ? "text-blue-500" : "text-slate-400"}`}>
                ({t.count})
              </span>
            </Link>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex gap-6 text-sm flex-wrap">
          <div>
            <div className="text-xs text-slate-500">Số căn</div>
            <div className="font-bold tabular-nums">{rows.length}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Tổng DT (dự kiến)</div>
            <div className="font-bold tabular-nums">{fmtMoney(totalRev)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Đã ĐC (biên bản)</div>
            <div className="font-bold tabular-nums text-blue-700">{fmtMoney(totalRecognized)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Đã thu (vào TK)</div>
            <div className="font-bold tabular-nums text-green-700">{fmtMoney(totalPaid)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500" title="= Đã ĐC − Đã thu (giống Excel col AD)">Còn phải thu</div>
            <div
              className={`font-bold tabular-nums ${
                totalRecognized - totalPaid > 1000 ? "text-orange-700" : "text-slate-400"
              }`}
            >
              {fmtMoney(Math.max(0, totalRecognized - totalPaid))}
            </div>
          </div>
        </div>

        <form className="flex gap-2 items-end flex-nowrap overflow-x-auto">
          <div className="shrink-0">
            <label className="block text-[11px] text-slate-600 mb-1">Mã căn</label>
            <input
              type="text"
              name="unitCode"
              defaultValue={filterUnitCode ?? ""}
              className="input w-24 text-sm"
              placeholder="A.25.26"
            />
          </div>
          <div className="shrink-0">
            <label className="block text-[11px] text-slate-600 mb-1">Dự án</label>
            <SearchableSelect
              name="projectId"
              defaultValue={projectId ?? ""}
              emptyOption="— Tất cả —"
              placeholder="Dự án..."
              className="w-40"
              options={allProjects.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: p.fullCode,
              }))}
            />
          </div>
          <div className="shrink-0">
            <label className="block text-[11px] text-slate-600 mb-1">Phòng</label>
            <SearchableSelect
              name="departmentId"
              defaultValue={departmentId ?? ""}
              emptyOption="— Tất cả —"
              placeholder="Phòng..."
              className="w-32"
              options={allDepts.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
          <div className="shrink-0">
            <label className="block text-[11px] text-slate-600 mb-1">NVKD</label>
            <SearchableSelect
              name="salesPerson"
              defaultValue={filterSalesPerson ?? ""}
              emptyOption="— Tất cả —"
              placeholder="NVKD..."
              className="w-40"
              options={salesPersonOptions.map((s) => ({
                value: s.name,
                label: s.name,
                sublabel: s.isCtv ? "CTV" : s.position ? s.position.toUpperCase() : undefined,
              }))}
            />
          </div>
          <div className="shrink-0">
            <label className="block text-[11px] text-slate-600 mb-1">Từ ngày cọc</label>
            <input
              type="date"
              name="from"
              defaultValue={dateFrom ?? ""}
              className="input w-36 text-sm"
            />
          </div>
          <div className="shrink-0">
            <label className="block text-[11px] text-slate-600 mb-1">Đến ngày cọc</label>
            <input
              type="date"
              name="to"
              defaultValue={dateTo ?? ""}
              className="input w-36 text-sm"
            />
          </div>
          <input type="hidden" name="tab" value={activeTab} />
          <button className="shrink-0 bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-200">
            Lọc
          </button>
          {(filterProjectId ||
            filterDeptId ||
            filterSalesPerson ||
            dateFrom ||
            dateTo ||
            filterUnitCode) && (
            <Link
              href={`/products?tab=${activeTab}`}
              className="shrink-0 bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-200"
            >
              Reset
            </Link>
          )}
        </form>
      </div>

      {(() => {
        const tableRows: ProductRow[] = rows.map((r) => {
          const stats = statsByProduct.get(r.id) ?? {
            expectedHH: 0,
            expectedBonus: 0,
            receivedHH: 0,
            receivedBonus: 0,
            paidHH: 0,
            paidBonus: 0,
            phaseCount: 0,
            invoiceIds: new Set<number>(),
          };
          const emp = r.salesPerson ? empByName.get(r.salesPerson.trim().toLowerCase()) : null;
          const isCtv = emp?.position === "ctv";
          // Nếu NVKD là CTV và chưa gán phòng thực → không show text Excel legacy
          // (VD "Freelancer / Đoàn Lê Bách" không còn chính xác vì Bách giờ CEO).
          const displayDeptName =
            r.departmentName ??
            (isCtv && !emp?.departmentId ? null : r.deptName ?? null);
          return {
            id: r.id,
            unitCode: r.unitCode,
            projectName: r.projectName ?? null,
            partnerName: r.partnerName ?? null,
            departmentName: displayDeptName,
            deptName: displayDeptName,
            salesPerson: r.salesPerson ?? null,
            isCtv,
            depositDate: r.depositDate ?? null,
            pmgBasePrice: Number(r.pmgBasePrice ?? 0),
            pmgRate: Number(r.pmgRate ?? 0),
            totalRevenue: Number(r.totalRevenue ?? 0),
            note: r.note ?? null,
            expectedHH: stats.expectedHH,
            receivedHH: stats.receivedHH,
            phaseCount: stats.phaseCount,
            invoiceCount: stats.invoiceIds.size,
          };
        });
        return (
          <ProductsTable
            rows={tableRows}
            detailQs={detailQs}
            justCreatedIds={justCreatedIds}
            onBulkDelete={async (ids) => {
              "use server";
              return await deleteProductBulk(ids);
            }}
          />
        );
      })()}

    </div>
  );
}
