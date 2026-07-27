import { db } from "@/lib/db";
import {
  products,
  employees,
  revenueReconciliations,
  paymentsIn,
  paymentsOut,
  financialTransactions,
} from "@/lib/schema";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { sql, inArray, eq, and, lt, isNotNull } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const OPEX_CATEGORIES = ["6421", "6427-rent", "6427-svc", "6417", "6428", "6425", "635"];

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

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
  // ALERT 1: 3 tháng liền bán dưới BE
  // ============================================================
  // BE = OPEX YTD/monthsSoFar + KH TSCĐ ÷ avgGrossPerUnit
  const opexYtdRows = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        inArray(financialTransactions.categoryCode, OPEX_CATEGORIES),
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
  // ALERT 2: Sức khỏe tài chính < 3 tháng
  // ============================================================
  // Cash cty (ước tính) = topup (411) + paymentsIn − paymentsOut − chi thanh-toan
  // KHÔNG cộng MERGED cá nhân (đó là Bách/Triết chi cá nhân, không qua TK cty)
  const [topup] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "411"),
        eq(financialTransactions.sourceFile, "thanh-toan"),
      ),
    );
  // Note: chi tại TK cty = tất cả rows source='thanh-toan' TRỪ rows là topup thu vào
  // Nhưng em không có track direction. Approximate: tất cả thanh-toan là chi ra.
  const [chiTkCty] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(eq(financialTransactions.sourceFile, "thanh-toan"));
  const [payIn] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(paymentsIn);
  const [payOut] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(paymentsOut);

  // Cash cty estimate — có thể âm nếu chưa track đầy đủ vốn góp/thu
  // Note: em bỏ topup vì nó nằm trong chi thanh-toan (không phải separate)
  const estimatedCash = Number(payIn.s) - Number(payOut.s) - Number(chiTkCty.s) + Number(topup.s) * 2;
  // Adjust: topup được cộng 2 lần (1 lần trong chi thanh-toan, 1 lần bổ sung để reverse)
  const runway = cpQlMonth > 0 ? estimatedCash / cpQlMonth : Infinity;

  if (runway < 3 && cpQlMonth > 0) {
    alerts.push({
      id: "cash-runway",
      severity: "critical",
      title: `Sức khỏe tài chính thấp: còn ~${runway.toFixed(1)} tháng`,
      description: `Ước tính cash TK cty: ${fmt(estimatedCash)} VND. CP HĐ trung bình ${fmt(cpQlMonth)} VND/tháng. Có thể chỉ chạy được ${runway.toFixed(1)} tháng nữa.`,
      detail: (
        <div className="text-[11px] mt-1 text-slate-600">
          ⚠️ Đây là ước tính — chưa track sao kê ngân hàng thực. Số thực có thể chênh.
          Nên: rà lại sao kê + đối chiếu công nợ.
        </div>
      ),
      action: { href: "/reports/balance-sheet", label: "Xem BCĐKT" },
    });
  } else if (runway < 6 && cpQlMonth > 0) {
    alerts.push({
      id: "cash-runway-warn",
      severity: "warning",
      title: `Sức khỏe tài chính cần theo dõi: ~${runway.toFixed(1)} tháng`,
      description: `CP HĐ ${fmt(cpQlMonth)} VND/tháng, cash ước ${fmt(estimatedCash)} VND. Nên plan revenue/vốn.`,
      action: { href: "/reports/balance-sheet", label: "Xem BCĐKT" },
    });
  }

  // ============================================================
  // ALERT 5: NVKD 0 căn > 3 tháng liền
  // ============================================================
  const emps = await db
    .select({ id: employees.id, name: employees.name, active: employees.active })
    .from(employees)
    .where(eq(employees.active, true));

  // Last sale date per employee
  const salesByEmp = new Map<string, string>();
  for (const p of allProducts) {
    if (!p.depositDate) continue;
    // Need salesPerson field
  }
  const salesRows = await db
    .select({ salesPerson: products.salesPerson, depositDate: products.depositDate })
    .from(products)
    .where(isNotNull(products.depositDate));
  for (const r of salesRows) {
    if (!r.salesPerson || !r.depositDate) continue;
    const cur = salesByEmp.get(r.salesPerson);
    if (!cur || r.depositDate > cur) salesByEmp.set(r.salesPerson, r.depositDate);
  }

  const threeMonthsAgo = daysAgo(90);
  const idleEmps: Array<{ name: string; lastSale: string | null }> = [];
  for (const e of emps) {
    // Skip founders / admin roles
    if (["Đoàn Lê Bách", "Danh Hoàng Thị Tường Vi"].includes(e.name)) continue;
    const lastSale = salesByEmp.get(e.name) ?? null;
    if (!lastSale || lastSale < threeMonthsAgo) {
      idleEmps.push({ name: e.name, lastSale });
    }
  }

  if (idleEmps.length > 0) {
    alerts.push({
      id: "idle-sale",
      severity: "warning",
      title: `${idleEmps.length} NVKD không có căn cọc trong 3 tháng qua`,
      description: `Cân nhắc turnover / retrain / re-assign phòng ban.`,
      detail: (
        <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
          {idleEmps.slice(0, 10).map((e) => (
            <li key={e.name}>
              <b>{e.name}</b> — lần cọc cuối: {e.lastSale ?? "chưa có căn nào"}
            </li>
          ))}
          {idleEmps.length > 10 && <li className="italic">... và {idleEmps.length - 10} người khác</li>}
        </ul>
      ),
      action: { href: "/reports/people", label: "Xem hiệu suất NVKD" },
    });
  }

  // ============================================================
  // ALERT 6: CP HĐ tháng bất thường > 1.5× TB 6 tháng
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
      title: `${spikeMonths.length} tháng có CP HĐ bất thường`,
      description: `CP HĐ cao > 1.5× TB 6 tháng gần. Cần rà check lý do (thưởng lớn, thuế, mua sắm bất thường).`,
      detail: (
        <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
          {spikeMonths.map((s) => (
            <li key={s.month}>
              <b>{s.month}</b>: {fmt(s.amount)} VND ({s.ratio.toFixed(1)}× TB)
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
      description: `Tổng công nợ quá hạn: ${fmt(overdueTotalAmount)} VND. Cần đòi CĐT hoặc rà lại tình trạng.`,
      detail: (
        <table className="w-full text-xs mt-2">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-1">Căn</th>
              <th className="text-right p-1">Còn phải thu</th>
              <th className="text-left p-1">ĐC cũ nhất</th>
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
      action: { href: "/reports/cashflow", label: "Xem dòng tiền HH" },
    });
  }

  // ============================================================
  // Render
  // ============================================================
  const critical = alerts.filter((a) => a.severity === "critical");
  const warning = alerts.filter((a) => a.severity === "warning");
  const info = alerts.filter((a) => a.severity === "info");

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">🔔 Cảnh báo</h1>
        <p className="text-sm text-slate-500 mt-1">
          {alerts.length === 0
            ? "✅ Không có cảnh báo nào — cty đang chạy ổn."
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
            Cty đang chạy ổn — không có metric nào vượt ngưỡng cần chú ý.
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
