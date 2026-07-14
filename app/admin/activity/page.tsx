import { db } from "@/lib/db";
import { activityLogs, products } from "@/lib/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getOwnerEmail } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ENTITY_LABEL: Record<string, string> = {
  product: "Cấu hình căn",
  product_adjustment: "Điều chỉnh",
  revenue_reconciliation: "ĐC doanh thu",
  cost_reconciliation: "ĐC giá vốn",
  project: "Dự án",
  partner: "Đối tác",
};

const FIELD_LABEL: Record<string, string> = {
  pmgRate: "%PMG_LK",
  pmgSaleRate: "%PMG_LK_sale",
  pmgBasePrice: "Giá PMG",
  adminFee: "Phí admin",
  adminFeeSale: "Phí admin (sale)",
  saleCommissionRate: "%HH sale",
  kpiCeoRate: "%KPI CEO",
  kpiTpkdRate: "%KPI TPKD",
  kpiAdminRate: "%KPI Admin",
  cdtBonusSale: "CĐT thưởng sale",
  cdtBonusManager: "CĐT thưởng QL",
  bonusSale: "CTY thưởng NVKD",
  bonusManager: "CTY thưởng QL",
  customerSupport: "Hỗ trợ khách",
  otherCost: "CP khác",
  totalRevenue: "Tổng DT",
  totalCost: "Tổng GV",
  amountPayableThisTime: "Số phải trả",
  revenueThisTime: "Doanh thu đợt",
  pmgCumulativePct: "%PMG lũy kế",
  note: "Ghi chú",
  effectiveDate: "Ngày hiệu lực",
  employeeName: "Người nhận",
  costType: "Loại chi phí",
  invoiceId: "Hóa đơn",
  productCode: "Mã căn (full)",
  unitCode: "Mã căn",
};

function fmtDiffValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Math.abs(v) > 0 && Math.abs(v) < 1) return `${(v * 100).toFixed(2)}%`;
    if (Math.abs(v) >= 1000) return v.toLocaleString("vi-VN");
    return String(v);
  }
  if (typeof v === "string") return v || "—";
  return JSON.stringify(v);
}

type SearchParams = Promise<{
  actor?: string;
  entity?: string;
  action?: string;
  since?: string;
  until?: string;
  q?: string;
}>;

export default async function ActivityAdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Owner-only
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  const sp = await searchParams;
  const filterActor = sp.actor?.trim() || null;
  const filterEntity = sp.entity?.trim() || null;
  const filterAction = sp.action?.trim() || null;
  const filterSince = sp.since?.trim() || null; // YYYY-MM-DD
  const filterUntil = sp.until?.trim() || null;
  const searchQuery = sp.q?.trim() || null;

  // Build WHERE conditions
  const conditions = [] as ReturnType<typeof eq>[];
  if (filterActor) conditions.push(eq(activityLogs.actorEmail, filterActor));
  if (filterEntity) conditions.push(eq(activityLogs.entityType, filterEntity));
  if (filterAction)
    conditions.push(
      eq(activityLogs.action, filterAction as "create" | "update" | "delete"),
    );
  if (filterSince) conditions.push(gte(activityLogs.createdAt, new Date(filterSince)));
  if (filterUntil) {
    // include the whole day → until 23:59:59
    const until = new Date(filterUntil);
    until.setHours(23, 59, 59, 999);
    conditions.push(lte(activityLogs.createdAt, until));
  }

  const rows = await db
    .select({
      id: activityLogs.id,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      productId: activityLogs.productId,
      action: activityLogs.action,
      actorEmail: activityLogs.actorEmail,
      actorIp: activityLogs.actorIp,
      changes: activityLogs.changes,
      summary: activityLogs.summary,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(activityLogs.createdAt))
    .limit(500);

  // Fetch related product unit codes (chỉ những product xuất hiện trong log)
  const productIds = Array.from(
    new Set(rows.map((r) => r.productId).filter((v): v is number => v !== null)),
  );
  const productMap = new Map<number, string>();
  if (productIds.length > 0) {
    const prods = await db
      .select({ id: products.id, unitCode: products.unitCode })
      .from(products);
    for (const p of prods) {
      if (productIds.includes(p.id)) productMap.set(p.id, p.unitCode ?? String(p.id));
    }
  }

  // Client-side substring filter (WHERE summary ILIKE '%q%')
  const finalRows = searchQuery
    ? rows.filter((r) =>
        (r.summary ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : rows;

  // Distinct actors + entity types cho dropdown filter
  const allActors = await db
    .selectDistinct({ email: activityLogs.actorEmail })
    .from(activityLogs);
  const distinctActors = allActors
    .map((r) => r.email)
    .filter((e): e is string => !!e)
    .sort();

  const [{ total = 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(activityLogs);

  // Group by day for stats
  const todayCount = rows.filter((r) => {
    const d = r.createdAt ? new Date(r.createdAt) : null;
    if (!d) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }).length;

  return (
    <div className="space-y-4 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold">🕓 Nhật ký hệ thống</h1>
        <p className="text-sm text-slate-500 mt-1">
          Ghi lại mọi thao tác Tạo / Sửa / Xóa trên căn, đối chiếu, dự án. Chỉ
          owner truy cập được.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Hôm nay (trong 500 gần nhất)</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{todayCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Hiển thị (sau filter)</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{finalRows.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Tổng toàn thời gian</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{total}</div>
        </div>
      </div>

      {/* Filter form */}
      <form
        className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        autoComplete="off"
      >
        <div>
          <label className="block text-xs text-slate-600 mb-1">Người thực hiện</label>
          <select name="actor" defaultValue={filterActor ?? ""} className="input">
            <option value="">Tất cả</option>
            {distinctActors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Loại</label>
          <select name="entity" defaultValue={filterEntity ?? ""} className="input">
            <option value="">Tất cả</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Hành động</label>
          <select name="action" defaultValue={filterAction ?? ""} className="input">
            <option value="">Tất cả</option>
            <option value="create">Tạo</option>
            <option value="update">Sửa</option>
            <option value="delete">Xóa</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Từ ngày</label>
          <input
            type="date"
            name="since"
            defaultValue={filterSince ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Đến ngày</label>
          <input
            type="date"
            name="until"
            defaultValue={filterUntil ?? ""}
            className="input"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="bg-orange-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-orange-600 flex-1"
          >
            Lọc
          </button>
          <Link
            href="/admin/activity"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
          >
            ↺
          </Link>
        </div>
        <div className="md:col-span-6">
          <label className="block text-xs text-slate-600 mb-1">Tìm mô tả</label>
          <input
            type="text"
            name="q"
            defaultValue={searchQuery ?? ""}
            className="input"
            placeholder="VD: A.08-10, adjustment, xóa..."
          />
        </div>
      </form>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-2 whitespace-nowrap">Thời gian</th>
              <th className="text-left p-2 whitespace-nowrap">Người</th>
              <th className="text-left p-2 whitespace-nowrap">Hành động</th>
              <th className="text-left p-2 whitespace-nowrap">Loại</th>
              <th className="text-left p-2">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {finalRows.map((a) => {
              const ts = a.createdAt
                ? new Date(a.createdAt).toLocaleString("vi-VN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "?";
              const actor = a.actorEmail ?? a.actorIp ?? "(anonymous)";
              const actionColor =
                a.action === "create"
                  ? "text-green-700 bg-green-50 border-green-200"
                  : a.action === "update"
                    ? "text-blue-700 bg-blue-50 border-blue-200"
                    : "text-red-700 bg-red-50 border-red-200";
              const actionLabel =
                a.action === "create" ? "Tạo" : a.action === "update" ? "Sửa" : "Xóa";
              const changes = (a.changes ?? {}) as Record<
                string,
                { from: unknown; to: unknown }
              >;
              const changeKeys = Object.keys(changes);
              const productLink = a.productId ? (
                <Link
                  href={`/products/${a.productId}`}
                  className="text-blue-600 hover:underline font-mono"
                >
                  {productMap.get(a.productId) ?? `#${a.productId}`}
                </Link>
              ) : null;
              return (
                <tr key={a.id} className="border-t border-slate-100 align-top">
                  <td className="p-2 whitespace-nowrap font-mono text-xs">{ts}</td>
                  <td className="p-2 text-xs">{actor}</td>
                  <td className="p-2 whitespace-nowrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${actionColor} font-medium`}
                    >
                      {actionLabel}
                    </span>
                  </td>
                  <td className="p-2 whitespace-nowrap text-xs text-slate-700">
                    {ENTITY_LABEL[a.entityType] ?? a.entityType} #{a.entityId}
                    {productLink && <span className="ml-1">· {productLink}</span>}
                  </td>
                  <td className="p-2 text-xs">
                    {a.summary && (
                      <div className="text-slate-700 mb-0.5">{a.summary}</div>
                    )}
                    {changeKeys.length > 0 && a.action === "update" && (
                      <ul className="text-slate-500 space-y-0.5">
                        {changeKeys.slice(0, 5).map((k) => (
                          <li key={k} className="flex items-baseline gap-1.5">
                            <span className="text-slate-500 min-w-24">
                              {FIELD_LABEL[k] ?? k}:
                            </span>
                            <span className="line-through tabular-nums text-slate-400">
                              {fmtDiffValue(changes[k].from)}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="tabular-nums font-medium">
                              {fmtDiffValue(changes[k].to)}
                            </span>
                          </li>
                        ))}
                        {changeKeys.length > 5 && (
                          <li className="italic text-slate-400">
                            ... +{changeKeys.length - 5} field
                          </li>
                        )}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
            {finalRows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                  Không có log nào khớp filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length >= 500 && (
        <div className="text-xs text-slate-500 italic">
          Chỉ hiển thị 500 dòng gần nhất. Lọc theo ngày để xem xa hơn.
        </div>
      )}
    </div>
  );
}
