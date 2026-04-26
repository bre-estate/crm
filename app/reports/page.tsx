import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  revenueReconciliations,
  costReconciliations,
  paymentsIn,
  paymentsOut,
} from "@/lib/schema";
import { fmtMoney } from "@/lib/format";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const allProjects = await db
    .select({
      id: projects.id,
      code: projects.fullCode,
      name: projects.name,
      partnerName: partners.name,
      breRole: projects.breRole,
    })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id))
  const prodRows = await db
    .select({
      id: products.id,
      projectId: products.projectId,
      sellPrice: products.sellPrice,
      totalRevenue: products.totalRevenue,
      totalCost: products.totalCost,
      cdtBonusSale: products.cdtBonusSale,
      cdtBonusManager: products.cdtBonusManager,
    })
    .from(products)
  const revRows = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      receivable: revenueReconciliations.totalReceivableThisTime,
    })
    .from(revenueReconciliations)
  const costRows = await db
    .select({
      id: costReconciliations.id,
      productId: costReconciliations.productId,
      payable: costReconciliations.amountPayableThisTime,
    })
    .from(costReconciliations)
  const paymentInRows = await db
    .select({
      recId: paymentsIn.reconciliationId,
      amount: paymentsIn.amount,
    })
    .from(paymentsIn)
  const paymentOutRows = await db
    .select({
      recId: paymentsOut.costReconciliationId,
      amount: paymentsOut.amount,
    })
    .from(paymentsOut)
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo tổng hợp</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tương ứng sheet 3_BC DOANH THU - GIA VON. Tổng hợp theo dự án.
        </p>
      </div>

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

      <div>
        <h2 className="text-lg font-semibold mb-3">Chi tiết theo dự án</h2>
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
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          p.breRole === "f1"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {p.breRole === "f1" ? "F1" : "F2"}
                      </span>
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
