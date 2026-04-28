import { db } from "@/lib/db";
import { products, projects, partners } from "@/lib/schema";
import { fmtMoney, fmtDate, fmtPct } from "@/lib/format";
import { eq, asc, desc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ projectId?: string }>;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const { projectId } = await searchParams;
  const filterProjectId = projectId ? Number(projectId) : null;

  const allProjects = await db
    .select({ id: projects.id, name: projects.name, fullCode: projects.fullCode })
    .from(projects)
    .orderBy(asc(projects.name))
  const selectCols = {
    id: products.id,
    productCode: products.productCode,
    unitCode: products.unitCode,
    customerName: products.customerName,
    salesPerson: products.salesPerson,
    deptName: products.deptName,
    depositDate: products.depositDate,
    pmgBasePrice: products.pmgBasePrice,
    pmgRate: products.pmgRate,
    totalRevenue: products.totalRevenue,
    totalCost: products.totalCost,
    projectName: projects.name,
    partnerName: partners.name,
    projectId: products.projectId,
  };

  const rows = filterProjectId
    ? await db
        .select(selectCols)
        .from(products)
        .leftJoin(projects, eq(products.projectId, projects.id))
        .leftJoin(partners, eq(projects.partnerId, partners.id))
        .where(eq(products.projectId, filterProjectId))
        .orderBy(desc(products.depositDate))
    : await db
        .select(selectCols)
        .from(products)
        .leftJoin(projects, eq(products.projectId, projects.id))
        .leftJoin(partners, eq(projects.partnerId, partners.id))
        .orderBy(desc(products.depositDate));

  const totalRev = rows.reduce((s, r) => s + Number(r.totalRevenue ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + Number(r.totalCost ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Giao dịch (căn chốt)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mỗi dòng = 1 căn đã chốt cọc = 1 sản phẩm (mã SP). Tương ứng sheet 2.1_TT DU AN.
          </p>
        </div>
        <Link
          href="/products/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          + Thêm giao dịch
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 items-end flex-wrap">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Lọc theo dự án</label>
          <form className="flex gap-2">
            <select
              name="projectId"
              defaultValue={projectId ?? ""}
              className="input min-w-60"
            >
              <option value="">— Tất cả —</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullCode} · {p.name}
                </option>
              ))}
            </select>
            <button className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200">
              Lọc
            </button>
            {filterProjectId && (
              <Link
                href="/products"
                className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200"
              >
                Reset
              </Link>
            )}
          </form>
        </div>
        <div className="flex gap-4 text-sm ml-auto">
          <div>
            <div className="text-xs text-slate-500">Tổng {rows.length} căn</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Tổng doanh thu (dự kiến)</div>
            <div className="font-bold tabular-nums">{fmtMoney(totalRev)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Tổng giá vốn</div>
            <div className="font-bold tabular-nums">{fmtMoney(totalCost)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Lãi gộp (không VAT)</div>
            <div className="font-bold tabular-nums text-green-700">
              {fmtMoney(totalRev / 1.1 - totalCost)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Mã căn</th>
              <th className="text-left p-3">Dự án / Đối tác</th>
              <th className="text-left p-3">Khách</th>
              <th className="text-left p-3">NVKD</th>
              <th className="text-left p-3">Phòng</th>
              <th className="text-left p-3">Ngày cọc</th>
              <th className="text-right p-3">Giá tính PMG</th>
              <th className="text-right p-3">%PMG</th>
              <th className="text-right p-3">Tổng DT</th>
              <th className="text-right p-3">Giá vốn</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-mono text-xs">{r.unitCode}</td>
                <td className="p-3">
                  <div className="font-medium text-xs">{r.projectName}</div>
                  <div className="text-xs text-slate-500">{r.partnerName}</div>
                </td>
                <td className="p-3 text-xs">{r.customerName ?? "—"}</td>
                <td className="p-3 text-xs">{r.salesPerson ?? "—"}</td>
                <td className="p-3 text-xs">{r.deptName ?? "—"}</td>
                <td className="p-3 text-xs">{fmtDate(r.depositDate)}</td>
                <td className="p-3 text-right tabular-nums">{fmtMoney(r.pmgBasePrice)}</td>
                <td className="p-3 text-right tabular-nums">{fmtPct(r.pmgRate)}</td>
                <td className="p-3 text-right tabular-nums">{fmtMoney(r.totalRevenue)}</td>
                <td className="p-3 text-right tabular-nums">{fmtMoney(r.totalCost)}</td>
                <td className="p-3 text-right">
                  <Link href={`/products/${r.id}`} className="text-blue-600 hover:underline text-sm">
                    Chi tiết
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có giao dịch nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
