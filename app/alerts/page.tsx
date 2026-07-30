import { db } from "@/lib/db";
import {
  products,
  employees,
  revenueReconciliations,
  paymentsIn,
  costReconciliations,
  financialTransactions,
} from "@/lib/schema";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { sql, inArray, eq, and, lt, gte, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { OPEX_CATEGORIES, FIXED_COST_CATEGORIES } from "@/lib/accounting/categories";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const fmt = fmtMoney;

// Số tháng giữa 2 YYYY-MM (b - a)
function monthDiff(a: string, b: string): number {
  const [y1, m1] = a.split("-").map(Number);
  const [y2, m2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

// today - N ngày → ISO YYYY-MM-DD
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

type Severity = "critical" | "warning" | "info";
type Alert = {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  detail?: React.ReactNode;
  action?: { href: string; label: string };
};

export default async function AlertsPage() {
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  const alerts: Alert[] = [];
  const nowMonth = new Date().toISOString().slice(0, 7);
  const currentYear = nowMonth.slice(0, 4);
  const monthsSoFar = Number(nowMonth.slice(5));

  // ============================================================
  // ALERT 1: 3 tháng liền bán dưới điểm hòa vốn
  // ============================================================
  // Điểm hòa vốn = CP cố định YTD/monthsSoFar + KH TSCĐ ÷ lãi gộp TB căn.
  // Dùng FIXED_COST_CATEGORIES (KHÔNG có 6417) — 6417 đã trừ trong totalCost/căn,
  // include lại là double count → BE thổi phồng.
  const opexYtdRows = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        inArray(financialTransactions.categoryCode, FIXED_COST_CATEGORIES),
        sql`transaction_month LIKE ${currentYear + "-%"}`,
      ),
    );
  const opexAvgMonth = monthsSoFar > 0 ? Number(opexYtdRows[0].s) / monthsSoFar : 0;

  // TSCĐ monthly dep
  const tscdRows = await db
    .select({
      month: financialTransactions.transactionMonth,
      cost: financialTransactions.amount,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "153-211"));
  const monthlyDepTotal = tscdRows.reduce((s, a) => {
    const [y1, m1] = a.month.split("-").map(Number);
    const [y2, m2] = nowMonth.split("-").map(Number);
    const elapsed = (y2 - y1) * 12 + (m2 - m1);
    if (elapsed < 0 || elapsed >= 36) return s;
    return s + Number(a.cost) / 36;
  }, 0);
  const cpQlMonth = opexAvgMonth + monthlyDepTotal;

  const [productStats] = await db
    .select({
      revExp: sql<number>`coalesce(sum(total_revenue), 0)::float8`,
      costExp: sql<number>`coalesce(sum(total_cost), 0)::float8`,
      n: sql<number>`count(*)::int`,
    })
    .from(products);
  const avgGrossPerUnit =
    Number(productStats.n) > 0
      ? (Number(productStats.revExp) / 1.1 - Number(productStats.costExp)) / Number(productStats.n)
      : 0;
  const beUnits = avgGrossPerUnit > 0 && cpQlMonth > 0 ? cpQlMonth / avgGrossPerUnit : 0;

  // Units per month (last 12 months)
  const allProducts = await db
    .select({ depositDate: products.depositDate })
    .from(products)
    .where(isNotNull(products.depositDate));
  const unitsPerMonth = new Map<string, number>();
  for (const p of allProducts) {
    if (!p.depositDate) continue;
    const m = p.depositDate.slice(0, 7);
    unitsPerMonth.set(m, (unitsPerMonth.get(m) ?? 0) + 1);
  }
  // Last 3 months (excluding current if incomplete)
  const last3 = [1, 2, 3].map((i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const last3Counts = last3.map((m) => ({ month: m, count: unitsPerMonth.get(m) ?? 0 }));
  const below3 = last3Counts.filter((x) => x.count < beUnits).length;
  if (below3 === 3 && beUnits > 0) {
    alerts.push({
      id: "below-be-3m",
      severity: "critical",
      title: `Bán dưới điểm hòa vốn 3 tháng liền`,
      description: `Điểm hòa vốn cần ${beUnits.toFixed(1)} căn/tháng. Thực tế:`,
      detail: (
        <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
          {last3Counts.map((x) => (
            <li key={x.month}>
              {x.month}: <b>{x.count} căn</b> {x.count < beUnits && `(thiếu ${(beUnits - x.count).toFixed(1)})`}
            </li>
          ))}
        </ul>
      ),
      action: { href: "/reports/management", label: "Xem báo cáo quản trị" },
    });
  }

  // ============================================================
  // ALERT 2: Runway (sức khỏe tài chính) — TẮT
  // ============================================================
  // Trước: ước tính tiền mặt = payIn − payOut − chiTkCty + topup×2 → sai vì:
  //   - payOut trùng phần HH sale trong chiTkCty → trừ 2 lần
  //   - topup nằm trong chiTkCty nhưng không track direction → cộng bù bằng ×2 là hack
  // Kết quả: cty có lãi mà alert báo "runway thấp" → misleading.
  // Đợi có sao kê ngân hàng thực (import từng dòng credit/debit) mới đánh giá
  // được cash on hand. Cho tới lúc đó, KHÔNG alert.

  // ============================================================
  // ALERT 5: NVKD 0 căn > 3 tháng liền
  // ============================================================
  // Fix 2026-07-30: trước match products.salesPerson === employees.name, không:
  //   - Resolve alias (aliasOfId): 1 người có nhiều tên → mismatch → false idle
  //   - Skip position ≠ nvkd: CTV/TPKD/CEO/Admin cũng bị coi idle sai
  // Giờ dùng cost_reconciliations HH sale (cost_type=sale_commission) làm proxy
  // "đã bán trong 3 tháng qua" — bảng này là ground truth cho ai thực nhận HH.
  // Match name lowercase để tránh sai capitalization.
  const threeMonthsAgo = daysAgo(90);
  const emps = await db
    .select({
      id: employees.id,
      name: employees.name,
      position: employees.position,
      aliasOfId: employees.aliasOfId,
    })
    .from(employees)
    .where(and(eq(employees.active, true), eq(employees.position, "nvkd")));

  // Ai đã có HH sale ĐC trong 90 ngày qua (theo employee_name lowercase).
  const recentSaleRows = await db
    .select({ name: costReconciliations.employeeName })
    .from(costReconciliations)
    .where(
      and(
        eq(costReconciliations.costType, "sale_commission"),
        gte(costReconciliations.reconciliationDate, threeMonthsAgo),
      ),
    );
  const activeNames = new Set(
    recentSaleRows
      .map((r) => (r.name ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  // Lần HH sale cuối cùng của mỗi NVKD (all-time) — để show trong detail.
  const lastSaleRows = await db
    .select({
      name: costReconciliations.employeeName,
      d: sql<string>`max(reconciliation_date)`,
    })
    .from(costReconciliations)
    .where(eq(costReconciliations.costType, "sale_commission"))
    .groupBy(costReconciliations.employeeName);
  const lastSaleByName = new Map<string, string>();
  for (const r of lastSaleRows) {
    if (r.name && r.d) lastSaleByName.set(r.name.trim().toLowerCase(), r.d);
  }

  const idleEmps: Array<{ name: string; lastSale: string | null }> = [];
  for (const e of emps) {
    if (e.aliasOfId != null) continue; // alias record — skip, người thật đếm ở owner
    const key = e.name.trim().toLowerCase();
    if (activeNames.has(key)) continue; // có HH sale gần đây → active
    idleEmps.push({ name: e.name, lastSale: lastSaleByName.get(key) ?? null });
  }

  if (idleEmps.length > 0) {
    alerts.push({
      id: "idle-sale",
      severity: "warning",
      title: `${idleEmps.length} NVKD không có đợt hoa hồng sale trong 3 tháng qua`,
      description: `Cân nhắc cho nghỉ việc, đào tạo lại, hoặc điều chuyển sang phòng ban khác. Chỉ tính NVKD active có vị trí "nvkd" — CTV/TPKD/Admin không đưa vào.`,
      detail: (
        <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
          {idleEmps.slice(0, 10).map((e) => (
            <li key={e.name}>
              <b>{e.name}</b> — lần đối chiếu hoa hồng cuối: {e.lastSale ?? "chưa có"}
            </li>
          ))}
          {idleEmps.length > 10 && <li className="italic">... và {idleEmps.length - 10} người khác</li>}
        </ul>
      ),
      action: { href: "/reports/people", label: "Xem hiệu suất NVKD" },
    });
  }

  // ============================================================
  // ALERT 6: Chi phí hoạt động tháng bất thường > 1.5× trung bình 6 tháng
  // ============================================================
  // Query OPEX per month cho 6 tháng gần nhất (không tính tháng hiện tại)
  const opexPerMonthRows = await db
    .select({
      month: financialTransactions.transactionMonth,
      s: sql<number>`sum(amount)::float8`,
    })
    .from(financialTransactions)
    .where(inArray(financialTransactions.categoryCode, OPEX_CATEGORIES))
    .groupBy(financialTransactions.transactionMonth);
  const opexByMonth = new Map(opexPerMonthRows.map((r) => [r.month, Number(r.s)]));

  const last7Months = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const [currentMonth, ...prev6] = last7Months;
  const prev6Values = prev6.map((m) => opexByMonth.get(m) ?? 0).filter((v) => v > 0);
  const avg6m = prev6Values.length > 0 ? prev6Values.reduce((s, v) => s + v, 0) / prev6Values.length : 0;
  const currentMonthOpex = opexByMonth.get(currentMonth) ?? 0;

  // Alert cho MỖI tháng cao bất thường trong 6 tháng gần
  const spikeMonths: Array<{ month: string; amount: number; ratio: number }> = [];
  for (const m of last7Months) {
    const v = opexByMonth.get(m) ?? 0;
    if (v > 0 && avg6m > 0 && v > avg6m * 1.5) {
      spikeMonths.push({ month: m, amount: v, ratio: v / avg6m });
    }
  }

  if (spikeMonths.length > 0) {
    alerts.push({
      id: "opex-spike",
      severity: "warning",
      title: `${spikeMonths.length} tháng có chi phí hoạt động bất thường`,
      description: `Chi phí hoạt động cao hơn 1,5 lần trung bình 6 tháng gần đây. Cần rà soát lý do (thưởng lớn, thuế, mua sắm bất thường).`,
      detail: (
        <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
          {spikeMonths.map((s) => (
            <li key={s.month}>
              <b>{s.month}</b>: {fmt(s.amount)} VND ({s.ratio.toFixed(1)} lần trung bình)
              {" · "}
              <Link
                href={`/reports/management/${s.month}`}
                className="text-blue-600 hover:underline"
              >
                Xem chi tiết →
              </Link>
            </li>
          ))}
        </ul>
      ),
    });
  }

  // ============================================================
  // ALERT 8: Công nợ phải thu > 60 ngày
  // ============================================================
  const cutoff = daysAgo(60);
  const recons = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      reconDate: revenueReconciliations.reconciliationDate,
      receivable: revenueReconciliations.totalReceivableThisTime,
    })
    .from(revenueReconciliations)
    .where(and(lt(revenueReconciliations.reconciliationDate, cutoff)));
  const reconIds = recons.map((r) => r.id);
  const paidByRecon = new Map<number, number>();
  if (reconIds.length > 0) {
    const paid = await db
      .select({
        rid: paymentsIn.reconciliationId,
        amount: paymentsIn.amount,
      })
      .from(paymentsIn)
      .where(inArray(paymentsIn.reconciliationId, reconIds));
    for (const p of paid) {
      if (p.rid == null) continue;
      paidByRecon.set(p.rid, (paidByRecon.get(p.rid) ?? 0) + Number(p.amount ?? 0));
    }
  }

  // Group by product for readable output
  const overdueByProduct = new Map<number, { total: number; oldestDate: string; count: number }>();
  for (const r of recons) {
    const paid = paidByRecon.get(r.id) ?? 0;
    const outstanding = Number(r.receivable ?? 0) - paid;
    if (outstanding < 1000) continue; // tolerance
    const cur = overdueByProduct.get(r.productId) ?? {
      total: 0,
      oldestDate: r.reconDate ?? "",
      count: 0,
    };
    cur.total += outstanding;
    cur.count += 1;
    if (r.reconDate && (!cur.oldestDate || r.reconDate < cur.oldestDate)) {
      cur.oldestDate = r.reconDate;
    }
    overdueByProduct.set(r.productId, cur);
  }
  const overdueTotalAmount = [...overdueByProduct.values()].reduce((s, x) => s + x.total, 0);

  if (overdueByProduct.size > 0) {
    const productMap = new Map<number, string>();
    const pRows = await db
      .select({ id: products.id, unitCode: products.unitCode })
      .from(products)
      .where(inArray(products.id, [...overdueByProduct.keys()]));
    for (const p of pRows) productMap.set(p.id, p.unitCode);

    const sortedOverdue = [...overdueByProduct.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    alerts.push({
      id: "overdue-receivables",
      severity: "warning",
      title: `${overdueByProduct.size} căn có công nợ phải thu > 60 ngày`,
      description: `Tổng công nợ quá hạn: ${fmt(overdueTotalAmount)} VND. Cần đòi chủ đầu tư hoặc rà soát lại tình trạng.`,
      detail: (
        <table className="w-full text-xs mt-2">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-1">Căn</th>
              <th className="text-right p-1">Còn phải thu</th>
              <th className="text-left p-1">Đối chiếu cũ nhất</th>
              <th className="text-center p-1">Số đợt</th>
            </tr>
          </thead>
          <tbody>
            {sortedOverdue.map(([pid, x]) => (
              <tr key={pid} className="border-t border-slate-200">
                <td className="p-1">
                  <Link href={`/products/${pid}`} className="text-blue-600 hover:underline font-mono">
                    {productMap.get(pid) ?? `#${pid}`}
                  </Link>
                </td>
                <td className="p-1 text-right tabular-nums">{fmt(x.total)}</td>
                <td className="p-1 font-mono">{x.oldestDate}</td>
                <td className="p-1 text-center">{x.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
      action: { href: "/reports/cashflow", label: "Xem dòng tiền hoa hồng" },
    });
  }

  // ============================================================
  // Render
  // ============================================================
  const critical = alerts.filter((a) => a.severity === "critical");
  const warning = alerts.filter((a) => a.severity === "warning");
  const info = alerts.filter((a) => a.severity === "info");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">🔔 Cảnh báo</h1>
        <p className="text-sm text-slate-500 mt-1">
          {alerts.length === 0
            ? "✅ Không có cảnh báo nào — công ty đang chạy ổn."
            : `${alerts.length} cảnh báo cần chú ý. Nguy cấp trước, cảnh báo sau.`}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Nguy cấp" count={critical.length} color="red" />
        <SummaryCard label="Cảnh báo" count={warning.length} color="amber" />
        <SummaryCard label="Thông tin" count={info.length} color="blue" />
      </div>

      {/* Alerts */}
      {alerts.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-green-800 font-semibold">Không có cảnh báo nào</div>
          <div className="text-sm text-green-700 mt-1">
            Công ty đang chạy ổn — không có chỉ số nào vượt ngưỡng cần chú ý.
          </div>
        </div>
      )}

      {critical.map((a) => (
        <AlertCard key={a.id} alert={a} />
      ))}
      {warning.map((a) => (
        <AlertCard key={a.id} alert={a} />
      ))}
      {info.map((a) => (
        <AlertCard key={a.id} alert={a} />
      ))}
    </div>
  );
}

function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
  const bg =
    color === "red"
      ? "bg-red-50 border-red-200 text-red-800"
      : color === "amber"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-blue-50 border-blue-200 text-blue-800";
  return (
    <div className={`border rounded-xl p-4 ${bg}`}>
      <div className="text-xs uppercase font-semibold">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{count}</div>
    </div>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const cfg = {
    critical: {
      icon: "🚨",
      border: "border-red-300",
      bg: "bg-red-50",
      titleColor: "text-red-900",
    },
    warning: {
      icon: "⚠️",
      border: "border-amber-300",
      bg: "bg-amber-50",
      titleColor: "text-amber-900",
    },
    info: {
      icon: "ℹ️",
      border: "border-blue-300",
      bg: "bg-blue-50",
      titleColor: "text-blue-900",
    },
  }[alert.severity];

  return (
    <div className={`border ${cfg.border} ${cfg.bg} rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <div className="text-2xl">{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${cfg.titleColor}`}>{alert.title}</div>
          <div className="text-sm text-slate-700 mt-1">{alert.description}</div>
          {alert.detail && <div className="mt-2">{alert.detail}</div>}
          {alert.action && (
            <div className="mt-3">
              <Link
                href={alert.action.href}
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                {alert.action.label} →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
