import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  departments,
  revenueReconciliations,
} from "@/lib/schema";
import { fmtMoney, fmtDate, fmtPctTight } from "@/lib/format";
import { eq, asc, desc, and, gte, lte, type SQL } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  projectId?: string;
  departmentId?: string;
  saleType?: string;
  from?: string;
  to?: string;
}>;

// Compute preset date ranges based on "today" (server time)
function presetRanges() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    thisMonth: { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)), label: "Tháng này" },
    lastMonth: {
      from: fmt(new Date(y, m - 1, 1)),
      to: fmt(new Date(y, m, 0)),
      label: "Tháng trước",
    },
    thisQuarter: {
      from: fmt(new Date(y, q * 3, 1)),
      to: fmt(new Date(y, q * 3 + 3, 0)),
      label: "Quý này",
    },
    last6Months: {
      from: fmt(new Date(y, m - 5, 1)),
      to: fmt(new Date(y, m + 1, 0)),
      label: "6 tháng gần nhất",
    },
    thisYear: { from: `${y}-01-01`, to: `${y}-12-31`, label: "Năm nay" },
  };
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const { projectId, departmentId, saleType, from, to } = await searchParams;
  const filterProjectId = projectId ? Number(projectId) : null;
  const filterDeptId = departmentId ? Number(departmentId) : null;
  const filterSaleType = saleType === "primary" || saleType === "secondary" ? saleType : null;
  const dateFrom = from?.trim() || null;
  const dateTo = to?.trim() || null;
  const presets = presetRanges();

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
    totalRevenue: products.totalRevenue,
    adminFee: products.adminFee,
    discountCk: products.discountCk,
    totalCost: products.totalCost,
    projectName: projects.name,
    partnerName: partners.name,
    projectId: products.projectId,
  };

  const whereParts: SQL[] = [];
  if (filterProjectId) whereParts.push(eq(products.projectId, filterProjectId));
  if (filterDeptId) whereParts.push(eq(products.departmentId, filterDeptId));
  if (filterSaleType) whereParts.push(eq(products.saleType, filterSaleType));
  if (dateFrom) whereParts.push(gte(products.depositDate, dateFrom));
  if (dateTo) whereParts.push(lte(products.depositDate, dateTo));

  const baseQuery = db
    .select(selectCols)
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .leftJoin(departments, eq(products.departmentId, departments.id));

  const rows = whereParts.length
    ? await baseQuery
        .where(whereParts.length === 1 ? whereParts[0] : and(...whereParts))
        .orderBy(desc(products.depositDate), desc(products.id))
    : await baseQuery.orderBy(desc(products.depositDate), desc(products.id));

  // For each căn: tính phí dự kiến BRE nhận (= % PMG × giá tính PMG, trước VAT, đã trừ admin)
  //   primary:   (totalRevenue gồm VAT − adminFee) / 1.1
  //   secondary: totalRevenue (đã ở thang trước VAT, không có admin)
  // Đã thu = sum(revenue_recons.revenueThisTime) — mỗi recon = 1 đợt CĐT đã trả
  const recRows = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      revenueThisTime: revenueReconciliations.revenueThisTime,
      invoiceId: revenueReconciliations.invoiceId,
    })
    .from(revenueReconciliations);

  type Stats = {
    expectedFee: number;
    collected: number;
    phaseCount: number;
    invoiceIds: Set<number>;
  };
  const statsByProduct = new Map<number, Stats>();
  for (const r of rows) {
    // Primary: HH BRE nhận = (DT gồm VAT − admin) / 1.1 − chiết khấu (CK)
    // Secondary: totalRevenue đã là phí về cty
    const expected =
      r.saleType === "secondary"
        ? Number(r.totalRevenue ?? 0)
        : Math.max(
            0,
            (Number(r.totalRevenue ?? 0) - Number(r.adminFee ?? 0)) / 1.1 -
              Number(r.discountCk ?? 0),
          );
    statsByProduct.set(r.id, {
      expectedFee: expected,
      collected: 0,
      phaseCount: 0,
      invoiceIds: new Set<number>(),
    });
  }
  for (const rec of recRows) {
    const s = statsByProduct.get(rec.productId);
    if (!s) continue;
    const amt = Number(rec.revenueThisTime ?? 0);
    if (amt > 0) {
      s.collected += amt;
      s.phaseCount += 1;
    }
    if (rec.invoiceId !== null) s.invoiceIds.add(rec.invoiceId);
  }

  const totalRev = rows.reduce((s, r) => s + Number(r.totalRevenue ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + Number(r.totalCost ?? 0), 0);
  const totalCollected = Array.from(statsByProduct.values()).reduce((s, x) => s + x.collected, 0);
  const totalExpected = Array.from(statsByProduct.values()).reduce((s, x) => s + x.expectedFee, 0);

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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Giao dịch (căn chốt)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mỗi dòng = 1 căn đã chốt cọc = 1 sản phẩm. Sơ cấp = HĐ CĐT, Thứ cấp = mua bán lại.
          </p>
        </div>
        <Link
          href="/products/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          + Thêm giao dịch
        </Link>
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
            <div className="text-xs text-slate-500">Đã thu / Phải thu (HH BRE)</div>
            <div className="font-bold tabular-nums">
              <span className="text-green-700">{fmtMoney(totalCollected)}</span>
              <span className="text-slate-400"> / </span>
              <span>{fmtMoney(totalExpected)}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Tổng GV</div>
            <div className="font-bold tabular-nums">{fmtMoney(totalCost)}</div>
          </div>
        </div>

        <div className="flex gap-2 items-center flex-wrap text-xs">
          <span className="text-slate-500">Khoảng ngày cọc:</span>
          {Object.entries(presets).map(([key, p]) => {
            const params = new URLSearchParams();
            if (projectId) params.set("projectId", projectId);
            if (departmentId) params.set("departmentId", departmentId);
            if (saleType) params.set("saleType", saleType);
            params.set("from", p.from);
            params.set("to", p.to);
            const active = dateFrom === p.from && dateTo === p.to;
            return (
              <Link
                key={key}
                href={`/products?${params.toString()}`}
                className={
                  active
                    ? "px-2.5 py-1 rounded border border-blue-500 bg-blue-50 text-blue-700"
                    : "px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50"
                }
              >
                {p.label}
              </Link>
            );
          })}
          {(dateFrom || dateTo) && (
            <Link
              href={(() => {
                const params = new URLSearchParams();
                if (projectId) params.set("projectId", projectId);
                if (departmentId) params.set("departmentId", departmentId);
                if (saleType) params.set("saleType", saleType);
                return params.toString() ? `/products?${params.toString()}` : "/products";
              })()}
              className="px-2.5 py-1 rounded text-slate-500 hover:bg-slate-50"
            >
              ✕ bỏ lọc ngày
            </Link>
          )}
        </div>

        <form className="flex gap-2 items-end flex-wrap">
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
            <select name="projectId" defaultValue={projectId ?? ""} className="input min-w-60">
              <option value="">— Tất cả —</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullCode} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Phòng</label>
            <select
              name="departmentId"
              defaultValue={departmentId ?? ""}
              className="input min-w-40"
            >
              <option value="">— Tất cả —</option>
              {allDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Loại</label>
            <select name="saleType" defaultValue={saleType ?? ""} className="input min-w-32">
              <option value="">— Tất cả —</option>
              <option value="primary">Sơ cấp</option>
              <option value="secondary">Thứ cấp</option>
            </select>
          </div>
          <button className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200">
            Lọc
          </button>
          {(filterProjectId || filterDeptId || filterSaleType || dateFrom || dateTo) && (
            <Link
              href="/products"
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
              <th className="text-left p-2 whitespace-nowrap">Loại</th>
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
                expectedFee: 0,
                collected: 0,
                phaseCount: 0,
                invoiceIds: new Set<number>(),
              };
              const pctPaid = stats.expectedFee > 0 ? (stats.collected / stats.expectedFee) * 100 : 0;
              const fullyPaid = pctPaid >= 99.5;
              const noData = stats.expectedFee === 0 && stats.phaseCount === 0;
              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs">{r.unitCode}</td>
                  <td className="p-2">
                    <div className="font-medium text-xs">{r.projectName}</div>
                    <div className="text-xs text-slate-500">{r.partnerName}</div>
                  </td>
                  <td className="p-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                        r.saleType === "secondary"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {r.saleType === "secondary" ? "Thứ cấp" : "Sơ cấp"}
                    </span>
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
                          fullyPaid
                            ? "text-green-700"
                            : pctPaid > 0
                              ? "text-amber-700"
                              : "text-red-600"
                        }`}
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
                    <Link href={`/products/${r.id}`} className="text-blue-600 hover:underline text-sm">
                      Chi tiết
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="p-6 text-center text-slate-500 text-sm">
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
