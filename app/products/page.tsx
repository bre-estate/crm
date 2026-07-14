import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  departments,
  revenueReconciliations,
  paymentsIn,
} from "@/lib/schema";
import { fmtMoney, fmtDate, fmtPctTight, fmtPctRaw, displayPartnerName } from "@/lib/format";
import { eq, asc, desc, and, gte, lte, ilike, inArray, type SQL } from "drizzle-orm";
import Link from "next/link";
import SearchableSelect from "@/components/SearchableSelect";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  projectId?: string;
  departmentId?: string;
  tab?: string;
  from?: string;
  to?: string;
  unitCode?: string;
  justCreated?: string;
}>;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const { projectId, departmentId, tab, from, to, unitCode, justCreated } = await searchParams;
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

  // Preserve filter state khi user vào edit rồi save → quay lại list
  const returnToParams = new URLSearchParams();
  if (projectId) returnToParams.set("projectId", String(projectId));
  if (departmentId) returnToParams.set("departmentId", String(departmentId));
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
    recognitionMonth: products.recognitionMonth,
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

  const whereParts: SQL[] = [eq(products.saleType, activeTab)];
  if (filterProjectId) whereParts.push(eq(products.projectId, filterProjectId));
  if (filterDeptId) whereParts.push(eq(products.departmentId, filterDeptId));
  if (dateFrom) whereParts.push(gte(products.depositDate, dateFrom));
  if (dateTo) whereParts.push(lte(products.depositDate, dateTo));
  if (filterUnitCode) whereParts.push(ilike(products.unitCode, `%${filterUnitCode}%`));

  const baseQuery = db
    .select(selectCols)
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .leftJoin(departments, eq(products.departmentId, departments.id));

  const rowsRaw = await baseQuery
    .where(whereParts.length === 1 ? whereParts[0] : and(...whereParts))
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
      {justCreatedIds.size > 0 && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-sm text-green-800 flex items-center justify-between">
          <span>
            <span className="font-semibold">Đã tạo {justCreatedIds.size} căn</span>{" "}
            (đang highlight màu vàng ở đầu danh sách).
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

        <form className="flex gap-2 items-end flex-wrap">
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
            <label className="block text-xs text-slate-600 mb-1">Từ ngày cọc</label>
            <input
              type="date"
              name="from"
              defaultValue={dateFrom ?? ""}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Đến ngày cọc</label>
            <input
              type="date"
              name="to"
              defaultValue={dateTo ?? ""}
              className="input"
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
            <label className="block text-xs text-slate-600 mb-1">Phòng</label>
            <SearchableSelect
              name="departmentId"
              defaultValue={departmentId ?? ""}
              emptyOption="— Tất cả —"
              placeholder="Gõ tên phòng..."
              className="min-w-48"
              options={allDepts.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
          <input type="hidden" name="tab" value={activeTab} />
          <button className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200">
            Lọc
          </button>
          {(filterProjectId || filterDeptId || dateFrom || dateTo || filterUnitCode) && (
            <Link
              href={`/products?tab=${activeTab}`}
              className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200"
            >
              Reset
            </Link>
          )}
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-2 whitespace-nowrap">Mã căn</th>
              <th className="text-left p-2">Dự án / Đối tác</th>
              <th className="text-left p-2 whitespace-nowrap">Phòng</th>
              <th className="text-left p-2 whitespace-nowrap">NVKD</th>
              <th className="text-left p-2 whitespace-nowrap">Cọc</th>
              <th className="text-left p-2 whitespace-nowrap">Ghi nhận</th>
              <th className="text-right p-2 whitespace-nowrap">Giá PMG</th>
              <th className="text-right p-2 whitespace-nowrap">%PMG</th>
              <th className="text-right p-2 whitespace-nowrap">Tổng DT</th>
              <th className="text-center p-2 whitespace-nowrap">% thu</th>
              <th className="text-center p-2 whitespace-nowrap">Lần</th>
              <th className="text-center p-2 whitespace-nowrap">HĐ</th>
              <th className="text-right p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
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
              // % thu HH = receivedHH / expectedHH (đồng nhất với Section 4 detail —
              // ưu tiên biên bản ĐC = "đã ghi nhận có thu"). Bank actual là detail phụ.
              const pctPaid =
                stats.expectedHH > 0 ? (stats.receivedHH / stats.expectedHH) * 100 : 0;
              const fullyPaid = pctPaid >= 99.5 && pctPaid <= 100.5;
              const overPaid = pctPaid > 100.5;
              const noData = stats.expectedHH === 0 && stats.phaseCount === 0;
              const isJustCreated = justCreatedIds.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={`border-t border-slate-100 hover:bg-slate-50 ${
                    isJustCreated ? "bg-yellow-50" : ""
                  }`}
                >
                  <td className="p-2 font-mono text-xs">
                    <Link href={`/products/${r.id}${detailQs}`} className="text-blue-600 hover:underline">
                      {r.unitCode}
                    </Link>
                    {r.note && r.note.trim() && (
                      <span
                        className="ml-1 text-slate-400 cursor-help"
                        title={r.note}
                      >
                        📝
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="font-medium text-xs">{r.projectName}</div>
                    <div className="text-xs text-slate-500">{displayPartnerName(r.partnerName)}</div>
                  </td>
                  <td className="p-2">
                    {r.departmentName ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${deptColor(
                          r.deptName ?? r.departmentName,
                        )}`}
                      >
                        {r.departmentName}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-2 text-xs">{r.salesPerson ?? "—"}</td>
                  <td className="p-2 text-xs">{fmtDate(r.depositDate)}</td>
                  <td className="p-2 text-xs font-mono">{r.recognitionMonth ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(r.pmgBasePrice)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtPctTight(r.pmgRate)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(r.totalRevenue)}</td>
                  <td className="p-2 text-center">
                    {noData ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <span
                        className={`text-xs font-semibold ${
                          overPaid
                            ? "text-purple-700"
                            : fullyPaid
                              ? "text-green-700"
                              : pctPaid > 0
                                ? "text-amber-700"
                                : "text-red-600"
                        }`}
                        title={
                          overPaid
                            ? `Thu quá target (${fmtPctRaw(pctPaid, 1)}) — kiểm tra lại data`
                            : fullyPaid
                              ? "Đã thu đủ"
                              : pctPaid > 0
                                ? `Còn thiếu ${fmtPctRaw(100 - pctPaid, 1)}`
                                : "Chưa thu"
                        }
                      >
                        {pctPaid.toFixed(0)}%
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-center text-xs">
                    {stats.phaseCount > 0 ? (
                      <span className="font-medium">{stats.phaseCount}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-2 text-center text-xs">
                    {stats.invoiceIds.size > 0 ? (
                      <span
                        className="px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium"
                        title={`${stats.invoiceIds.size} hóa đơn`}
                      >
                        ✓ {stats.invoiceIds.size}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500">—</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Link href={`/products/${r.id}${detailQs}`} className="text-blue-600 hover:underline text-sm">
                      Chi tiết
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="p-6 text-center text-slate-500 text-sm">
                  Không có giao dịch nào theo bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
