import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  departments,
  revenueReconciliations,
  costReconciliations,
  paymentsIn,
  paymentsOut,
} from "@/lib/schema";
import { fmtMoney } from "@/lib/format";
import { eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

type RangeKey = "full" | "q1" | "q2" | "q3" | "q4" | "h1" | "h2";

const RANGE_MONTHS: Record<RangeKey, [number, number]> = {
  full: [1, 12],
  q1: [1, 3],
  q2: [4, 6],
  q3: [7, 9],
  q4: [10, 12],
  h1: [1, 6],
  h2: [7, 12],
};

const RANGE_LABEL: Record<RangeKey, string> = {
  full: "Cả năm",
  q1: "Q1 (T1–T3)",
  q2: "Q2 (T4–T6)",
  q3: "Q3 (T7–T9)",
  q4: "Q4 (T10–T12)",
  h1: "Nửa đầu năm (T1–T6)",
  h2: "Nửa cuối năm (T7–T12)",
};

function inRange(recognitionMonth: string | null, year: number | null, range: RangeKey): boolean {
  if (!year) return true;
  if (!recognitionMonth) return false;
  const m = recognitionMonth.match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (y !== year) return false;
  const [lo, hi] = RANGE_MONTHS[range];
  return mo >= lo && mo <= hi;
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const year = sp.year && sp.year !== "all" ? Number(sp.year) : null;
  const range: RangeKey = (sp.range as RangeKey) in RANGE_MONTHS ? (sp.range as RangeKey) : "full";

  const allProjects = await db
    .select({
      id: projects.id,
      code: projects.fullCode,
      name: projects.name,
      partnerName: partners.name,
      breRole: projects.breRole,
    })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id));
  const prodRowsAll = await db
    .select({
      id: products.id,
      projectId: products.projectId,
      sellPrice: products.sellPrice,
      totalRevenue: products.totalRevenue,
      totalCost: products.totalCost,
      cdtBonusSale: products.cdtBonusSale,
      cdtBonusManager: products.cdtBonusManager,
      departmentId: products.departmentId,
      departmentName: departments.name,
      salesPerson: products.salesPerson,
      recognitionMonth: products.recognitionMonth,
      saleType: products.saleType,
    })
    .from(products)
    .leftJoin(departments, eq(products.departmentId, departments.id));

  // Danh sách năm có trong data (dùng cho dropdown)
  const yearSet = new Set<number>();
  for (const p of prodRowsAll) {
    const m = p.recognitionMonth?.match(/^(\d{4})/);
    if (m) yearSet.add(Number(m[1]));
  }
  const yearOptions = Array.from(yearSet).sort((a, b) => b - a);

  const prodRows = prodRowsAll.filter((p) => inRange(p.recognitionMonth, year, range));
  const filteredProductIds = new Set(prodRows.map((p) => p.id));

  const revRowsAll = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      receivable: revenueReconciliations.totalReceivableThisTime,
    })
    .from(revenueReconciliations);
  const revRows = revRowsAll.filter((r) => filteredProductIds.has(r.productId));

  const costRowsAll = await db
    .select({
      id: costReconciliations.id,
      productId: costReconciliations.productId,
      payable: costReconciliations.amountPayableThisTime,
    })
    .from(costReconciliations);
  const costRows = costRowsAll.filter((r) => filteredProductIds.has(r.productId));

  const paymentInRows = await db
    .select({
      recId: paymentsIn.reconciliationId,
      amount: paymentsIn.amount,
    })
    .from(paymentsIn);
  const paymentOutRows = await db
    .select({
      recId: paymentsOut.costReconciliationId,
      amount: paymentsOut.amount,
    })
    .from(paymentsOut);
  // Map payments by reconciliation
  const revRecPayMap = new Map<number, number>();
  for (const p of paymentInRows) {
    if (p.recId === null) continue;
    revRecPayMap.set(p.recId, (revRecPayMap.get(p.recId) ?? 0) + Number(p.amount ?? 0));
  }
  const costRecPayMap = new Map<number, number>();
  for (const p of paymentOutRows) {
    if (p.recId === null) continue;
    costRecPayMap.set(p.recId, (costRecPayMap.get(p.recId) ?? 0) + Number(p.amount ?? 0));
  }

  type ProjectAgg = {
    id: number;
    code: string;
    name: string;
    partnerName: string | null;
    breRole: string;
    numProducts: number;
    totalSellPrice: number;
    totalRevenueExpected: number;
    totalCostExpected: number;
    totalRevReconciled: number;
    totalCostReconciled: number;
    totalPaidIn: number;
    totalPaidOut: number;
    cdtBonusReduction: number;
  };
  const projMap = new Map<number, ProjectAgg>();
  for (const p of allProjects) {
    projMap.set(p.id, {
      id: p.id,
      code: p.code,
      name: p.name,
      partnerName: p.partnerName,
      breRole: p.breRole,
      numProducts: 0,
      totalSellPrice: 0,
      totalRevenueExpected: 0,
      totalCostExpected: 0,
      totalRevReconciled: 0,
      totalCostReconciled: 0,
      totalPaidIn: 0,
      totalPaidOut: 0,
      cdtBonusReduction: 0,
    });
  }

  for (const p of prodRows) {
    const pj = projMap.get(p.projectId);
    if (!pj) continue;
    pj.numProducts++;
    pj.totalSellPrice += Number(p.sellPrice ?? 0);
    pj.totalRevenueExpected += Number(p.totalRevenue ?? 0);
    pj.totalCostExpected += Number(p.totalCost ?? 0);
    pj.cdtBonusReduction += Number(p.cdtBonusSale ?? 0) + Number(p.cdtBonusManager ?? 0);
  }

  const productToProject = new Map<number, number>();
  for (const p of prodRows) productToProject.set(p.id, p.projectId);

  for (const r of revRows) {
    const pjId = productToProject.get(r.productId);
    if (!pjId) continue;
    const pj = projMap.get(pjId);
    if (!pj) continue;
    pj.totalRevReconciled += Number(r.receivable ?? 0);
    pj.totalPaidIn += revRecPayMap.get(r.id) ?? 0;
  }
  for (const r of costRows) {
    const pjId = productToProject.get(r.productId);
    if (!pjId) continue;
    const pj = projMap.get(pjId);
    if (!pj) continue;
    pj.totalCostReconciled += Number(r.payable ?? 0);
    pj.totalPaidOut += costRecPayMap.get(r.id) ?? 0;
  }

  const aggregatedProjects = Array.from(projMap.values()).filter((p) => p.numProducts > 0);

  const grandTotals = aggregatedProjects.reduce(
    (s, p) => ({
      products: s.products + p.numProducts,
      sellPrice: s.sellPrice + p.totalSellPrice,
      revenueExp: s.revenueExp + p.totalRevenueExpected,
      costExp: s.costExp + p.totalCostExpected,
      revRec: s.revRec + p.totalRevReconciled,
      costRec: s.costRec + p.totalCostReconciled,
      paidIn: s.paidIn + p.totalPaidIn,
      paidOut: s.paidOut + p.totalPaidOut,
    }),
    { products: 0, sellPrice: 0, revenueExp: 0, costExp: 0, revRec: 0, costRec: 0, paidIn: 0, paidOut: 0 },
  );

  const profitExpected = grandTotals.revenueExp / 1.1 - grandTotals.costExp;
  const profitRealized = grandTotals.revRec / 1.1 - grandTotals.costRec;

  const filterLabel = year
    ? `${RANGE_LABEL[range]} ${year}`
    : "Tất cả thời gian";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo tổng hợp</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tương ứng sheet 3_BC DOANH THU - GIA VON. Lọc theo tháng ghi nhận DT.
        </p>
      </div>

      {/* ============ Filter ============ */}
      <form className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Năm</label>
          <select name="year" defaultValue={year ? String(year) : "all"} className="input min-w-32">
            <option value="all">Tất cả</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Khoảng</label>
          <select name="range" defaultValue={range} className="input min-w-48">
            {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
              <option key={k} value={k}>
                {RANGE_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700"
        >
          Lọc
        </button>
        {(year || range !== "full") && (
          <Link
            href="/reports"
            className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200"
          >
            Reset
          </Link>
        )}
        <div className="ml-auto text-sm">
          <span className="text-slate-500">Đang xem: </span>
          <span className="font-semibold">{filterLabel}</span>
          <span className="text-slate-500"> · {grandTotals.products} căn</span>
        </div>
      </form>

      <div className="grid grid-cols-4 gap-3">
        <Card label="Tổng doanh thu dự kiến (gồm VAT)" value={fmtMoney(grandTotals.revenueExp)} sub="từ Tab Giao dịch" />
        <Card label="Tổng giá vốn dự kiến" value={fmtMoney(grandTotals.costExp)} warn />
        <Card
          label="Lãi gộp dự kiến (không VAT)"
          value={fmtMoney(profitExpected)}
          highlight={profitExpected >= 0}
        />
        <Card
          label="Biên lợi nhuận"
          value={
            grandTotals.revenueExp > 0
              ? `${((profitExpected / (grandTotals.revenueExp / 1.1)) * 100).toFixed(1)}%`
              : "0%"
          }
        />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card label="Doanh thu đã ĐC" value={fmtMoney(grandTotals.revRec)} />
        <Card label="Giá vốn đã ĐC" value={fmtMoney(grandTotals.costRec)} warn />
        <Card
          label="Lãi thực (không VAT, đã ĐC)"
          value={fmtMoney(profitRealized)}
          highlight={profitRealized >= 0}
        />
        <Card
          label="Công nợ thuần"
          value={fmtMoney(grandTotals.revRec - grandTotals.paidIn - (grandTotals.costRec - grandTotals.paidOut))}
          sub={`Thu: ${fmtMoney(grandTotals.paidIn)} · Chi: ${fmtMoney(grandTotals.paidOut)}`}
        />
      </div>

      {/* ============ Theo Phòng ============ */}
      {(() => {
        const byDept = new Map<string, {
          name: string;
          numProducts: number;
          totalRevenue: number;
          totalCost: number;
        }>();
        for (const p of prodRows) {
          const key = p.departmentName ?? "(Chưa phân phòng)";
          if (!byDept.has(key)) byDept.set(key, { name: key, numProducts: 0, totalRevenue: 0, totalCost: 0 });
          const agg = byDept.get(key)!;
          agg.numProducts++;
          agg.totalRevenue += Number(p.totalRevenue ?? 0);
          agg.totalCost += Number(p.totalCost ?? 0);
        }
        const sorted = Array.from(byDept.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
        return (
          <div>
            <h2 className="text-lg font-semibold mb-3">Theo phòng — {filterLabel}</h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="text-left p-2">Phòng</th>
                    <th className="text-center p-2">Số căn</th>
                    <th className="text-right p-2">Tổng DT</th>
                    <th className="text-right p-2">Giá vốn</th>
                    <th className="text-right p-2">Lãi gộp (không VAT)</th>
                    <th className="text-right p-2">% trên tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d) => {
                    const profit = d.totalRevenue / 1.1 - d.totalCost;
                    const pct = grandTotals.revenueExp ? (d.totalRevenue / grandTotals.revenueExp) * 100 : 0;
                    return (
                      <tr key={d.name} className="border-t border-slate-100">
                        <td className="p-2 font-medium">{d.name}</td>
                        <td className="p-2 text-center">{d.numProducts}</td>
                        <td className="p-2 text-right tabular-nums">{fmtMoney(d.totalRevenue)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtMoney(d.totalCost)}</td>
                        <td className={`p-2 text-right tabular-nums font-semibold ${profit >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {fmtMoney(profit)}
                        </td>
                        <td className="p-2 text-right tabular-nums">{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500">
                        Không có dữ liệu trong khoảng đã chọn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ============ Theo NVKD (top 15) ============ */}
      {(() => {
        const byNvkd = new Map<string, {
          name: string;
          numProducts: number;
          totalRevenue: number;
        }>();
        for (const p of prodRows) {
          const key = p.salesPerson?.trim() || "(Chưa có NVKD)";
          if (!byNvkd.has(key)) byNvkd.set(key, { name: key, numProducts: 0, totalRevenue: 0 });
          const agg = byNvkd.get(key)!;
          agg.numProducts++;
          agg.totalRevenue += Number(p.totalRevenue ?? 0);
        }
        const sorted = Array.from(byNvkd.values()).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 15);
        return (
          <div>
            <h2 className="text-lg font-semibold mb-3">Top NVKD theo doanh thu — {filterLabel}</h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="text-left p-2">Hạng</th>
                    <th className="text-left p-2">NVKD</th>
                    <th className="text-center p-2">Số căn</th>
                    <th className="text-right p-2">Tổng DT (gồm VAT)</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((n, i) => (
                    <tr key={n.name} className="border-t border-slate-100">
                      <td className="p-2 text-xs">#{i + 1}</td>
                      <td className="p-2 font-medium">{n.name}</td>
                      <td className="p-2 text-center">{n.numProducts}</td>
                      <td className="p-2 text-right tabular-nums">{fmtMoney(n.totalRevenue)}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-500">
                        Không có dữ liệu trong khoảng đã chọn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ============ Theo Tháng ghi nhận ============ */}
      {(() => {
        const byMonth = new Map<string, {
          month: string;
          numProducts: number;
          totalRevenue: number;
        }>();
        for (const p of prodRows) {
          const key = p.recognitionMonth?.trim() || "(Chưa có tháng)";
          if (!byMonth.has(key)) byMonth.set(key, { month: key, numProducts: 0, totalRevenue: 0 });
          const agg = byMonth.get(key)!;
          agg.numProducts++;
          agg.totalRevenue += Number(p.totalRevenue ?? 0);
        }
        const sorted = Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month));
        return (
          <div>
            <h2 className="text-lg font-semibold mb-3">Ghi nhận DT theo tháng — {filterLabel}</h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="text-left p-2">Tháng</th>
                    <th className="text-center p-2">Số căn</th>
                    <th className="text-right p-2">Tổng DT</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((m) => (
                    <tr key={m.month} className="border-t border-slate-100">
                      <td className="p-2 font-mono text-sm">{m.month}</td>
                      <td className="p-2 text-center">{m.numProducts}</td>
                      <td className="p-2 text-right tabular-nums">{fmtMoney(m.totalRevenue)}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-slate-500">
                        Không có dữ liệu trong khoảng đã chọn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      <div>
        <h2 className="text-lg font-semibold mb-3">Chi tiết theo dự án — {filterLabel}</h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Mã DA</th>
                <th className="text-left p-2">Dự án / Đối tác</th>
                <th className="text-center p-2">Vai trò</th>
                <th className="text-center p-2">Số căn</th>
                <th className="text-right p-2">DT dự kiến</th>
                <th className="text-right p-2">GV dự kiến</th>
                <th className="text-right p-2">Lãi dự kiến</th>
                <th className="text-right p-2">DT đã ĐC</th>
                <th className="text-right p-2">GV đã ĐC</th>
                <th className="text-right p-2">Lãi thực (đã ĐC)</th>
              </tr>
            </thead>
            <tbody>
              {aggregatedProjects.map((p) => {
                const profitExp = p.totalRevenueExpected / 1.1 - p.totalCostExpected;
                const profitRec = p.totalRevReconciled / 1.1 - p.totalCostReconciled;
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="p-2 font-mono text-xs">{p.code}</td>
                    <td className="p-2">
                      <div className="text-xs font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.partnerName}</div>
                    </td>
                    <td className="p-2 text-center">
                      {p.partnerName === "Chợ thứ cấp" ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                          Thứ cấp
                        </span>
                      ) : (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            p.breRole === "f1"
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {p.breRole === "f1" ? "F1" : "F2"}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center">{p.numProducts}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(p.totalRevenueExpected)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(p.totalCostExpected)}</td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${
                        profitExp >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {fmtMoney(profitExp)}
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(p.totalRevReconciled)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(p.totalCostReconciled)}</td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${
                        profitRec >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {fmtMoney(profitRec)}
                    </td>
                  </tr>
                );
              })}
              {aggregatedProjects.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-slate-500">
                    Không có dự án nào có căn trong khoảng đã chọn.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
              <tr className="font-bold">
                <td colSpan={3} className="p-2">
                  Tổng cộng
                </td>
                <td className="p-2 text-center">{grandTotals.products}</td>
                <td className="p-2 text-right tabular-nums">{fmtMoney(grandTotals.revenueExp)}</td>
                <td className="p-2 text-right tabular-nums">{fmtMoney(grandTotals.costExp)}</td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    profitExpected >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {fmtMoney(profitExpected)}
                </td>
                <td className="p-2 text-right tabular-nums">{fmtMoney(grandTotals.revRec)}</td>
                <td className="p-2 text-right tabular-nums">{fmtMoney(grandTotals.costRec)}</td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    profitRealized >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {fmtMoney(profitRealized)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  warn,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  highlight?: boolean;
}) {
  let cls = "bg-white border-slate-200";
  if (warn) cls = "bg-orange-50 border-orange-300";
  else if (highlight === true) cls = "bg-green-50 border-green-300";
  else if (highlight === false) cls = "bg-red-50 border-red-300";
  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="text-xl font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
