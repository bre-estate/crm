/**
 * Số dư bank hiện tại + burn rate + runway.
 * 100% từ sao kê Techcombank (bank_transactions.running_balance).
 */
import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/schema";
import { sql, desc, gte, lte, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtM = (n: number) => (n / 1_000_000).toFixed(1) + "M";

export default async function CashPositionPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") notFound();

  const now = new Date();
  const nowStr = now.toISOString().slice(0, 10);

  // Số dư hiện tại = running_balance của giao dịch gần nhất
  const [latest] = await db
    .select({
      date: bankTransactions.transactionDate,
      balance: bankTransactions.runningBalance,
    })
    .from(bankTransactions)
    .orderBy(desc(bankTransactions.transactionDate), desc(bankTransactions.id))
    .limit(1);

  const currentBalance = latest ? Number(latest.balance ?? 0) : 0;

  // 3T trailing
  const start3M = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const start3MStr = start3M.toISOString().slice(0, 10);

  const [t3] = await db.execute(sql`
    SELECT
      COALESCE(SUM(credit_amount), 0)::float8 as inflow,
      COALESCE(SUM(ABS(debit_amount)), 0)::float8 as outflow
    FROM bank_transactions
    WHERE transaction_date >= ${start3MStr} AND transaction_date <= ${nowStr}
  `) as any[];

  const inflow3M = Number(t3.inflow);
  const outflow3M = Number(t3.outflow);
  const netMonthly = (inflow3M - outflow3M) / 3;
  const avgOutMonthly = outflow3M / 3;
  const avgInMonthly = inflow3M / 3;

  // Runway = balance / |burn rate| nếu net < 0
  const isBurning = netMonthly < 0;
  const runwayMonths = isBurning ? currentBalance / Math.abs(netMonthly) : Infinity;

  // Monthly balance chart (last 12 months) — dùng closing balance mỗi tháng
  const monthlyBalance = (await db.execute(sql`
    WITH monthly_last AS (
      SELECT DISTINCT ON (substr(transaction_date, 1, 7))
        substr(transaction_date, 1, 7) as month,
        running_balance
      FROM bank_transactions
      WHERE transaction_date >= (CURRENT_DATE - INTERVAL '12 months')::text
      ORDER BY substr(transaction_date, 1, 7), transaction_date DESC, id DESC
    )
    SELECT * FROM monthly_last ORDER BY month
  `)) as any[];

  const maxBal = Math.max(...monthlyBalance.map((r: any) => Number(r.running_balance ?? 0)), 1);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Số dư & Runway</h1>
        <p className="text-sm text-slate-500 mt-1">
          Từ sao kê Techcombank cty. Cập nhật đến {latest?.date ?? "—"}.
        </p>
      </div>

      {/* Số dư hiện tại */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="Số dư bank hiện tại"
          value={fmt(currentBalance)}
          sub={`Techcombank cty — cập nhật ${latest?.date ?? "—"}`}
          color="green"
        />
        <StatCard
          label="Vào TB / tháng (3T)"
          value={fmt(avgInMonthly)}
          sub={`Tổng ${fmt(inflow3M)} / 3 tháng`}
          color="green"
        />
        <StatCard
          label="Ra TB / tháng (3T)"
          value={fmt(avgOutMonthly)}
          sub={`Tổng ${fmt(outflow3M)} / 3 tháng`}
          color="red"
        />
      </div>

      {/* Runway status */}
      <div className={`p-4 rounded-xl border ${isBurning ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm font-semibold">
              {isBurning ? "⚠️ Đang burn — cần chú ý" : "✅ Đang lãi ròng"}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {isBurning
                ? `Burn ${fmt(Math.abs(netMonthly))}/tháng — số dư còn "sống" được ${runwayMonths.toFixed(1)} tháng nếu không có thu thêm.`
                : `Thu > Chi ${fmt(netMonthly)}/tháng (trailing 3T). Không cần lo runway.`}
            </div>
          </div>
          <div className={`text-3xl font-bold tabular-nums ${isBurning ? "text-red-700" : "text-green-700"}`}>
            {isBurning ? `${runwayMonths.toFixed(1)}T` : "∞"}
          </div>
        </div>
      </div>

      {/* Balance chart 12 tháng */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Xu hướng số dư 12 tháng gần nhất</h2>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
          <div className="space-y-1">
            {monthlyBalance.map((r: any) => {
              const bal = Number(r.running_balance ?? 0);
              const pct = maxBal > 0 ? (bal / maxBal) * 100 : 0;
              return (
                <div key={r.month} className="flex items-center gap-3 text-xs">
                  <div className="w-16 font-mono">{r.month}</div>
                  <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-32 text-right tabular-nums font-semibold">{fmt(bal)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="text-xs text-slate-500 italic">
        Ghi chú: Runway tính đơn giản = số dư / burn rate 3T. Chưa gồm dòng thu
        dự kiến (còn thu CĐT), commitments (còn nợ sale team, thuế).
        Xem <Link href="/reports/obligations" className="text-blue-600 hover:underline">Nghĩa vụ tài chính</Link> để cụ thể hơn.
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: "green" | "red" }) {
  const cls = color === "green" ? "border-green-200 text-green-700" : "border-red-200 text-red-700";
  return (
    <div className={`bg-white border rounded-xl p-4 ${cls}`}>
      <div className="text-[11px] uppercase font-semibold tracking-wide">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
