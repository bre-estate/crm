/**
 * A/P aging — Bảng tuổi nợ phải trả.
 * Tính: cost_reconciliations.amount_payable_this_time − payments_out per reconciliation.
 * Group by employee_name (sale/NVKD), bucket theo tuổi 0-30, 31-60, 61-90, >90 ngày.
 * Ngoài ra hiển thị nợ thuế + BHXH từ NKC (accrual − đã nộp bank).
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface AgingRow {
  name: string;
  count: number;
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b91: number;
  total: number;
}

export default async function APAgingPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  const today = new Date().toISOString().slice(0, 10);

  // Nợ sale team per NVKD/CTV
  const salesRows = await db.execute(sql`
    WITH recon AS (
      SELECT
        c.id,
        c.employee_name,
        c.reconciliation_date,
        c.amount_payable_this_time,
        COALESCE((SELECT SUM(amount) FROM payments_out po WHERE po.cost_reconciliation_id = c.id), 0) AS paid
      FROM cost_reconciliations c
      WHERE c.amount_payable_this_time > 0
    )
    SELECT
      employee_name AS name,
      COUNT(*)::int AS count,
      SUM(CASE WHEN (${today}::date - reconciliation_date::date) <= 30
        THEN GREATEST(0, amount_payable_this_time - paid) ELSE 0 END)::float8 AS b0_30,
      SUM(CASE WHEN (${today}::date - reconciliation_date::date) BETWEEN 31 AND 60
        THEN GREATEST(0, amount_payable_this_time - paid) ELSE 0 END)::float8 AS b31_60,
      SUM(CASE WHEN (${today}::date - reconciliation_date::date) BETWEEN 61 AND 90
        THEN GREATEST(0, amount_payable_this_time - paid) ELSE 0 END)::float8 AS b61_90,
      SUM(CASE WHEN (${today}::date - reconciliation_date::date) > 90
        THEN GREATEST(0, amount_payable_this_time - paid) ELSE 0 END)::float8 AS b91,
      SUM(GREATEST(0, amount_payable_this_time - paid))::float8 AS total
    FROM recon
    GROUP BY employee_name
    HAVING SUM(GREATEST(0, amount_payable_this_time - paid)) > 0
    ORDER BY total DESC
  `) as any[];

  const aging: AgingRow[] = salesRows.map(r => ({
    name: String(r.name),
    count: Number(r.count),
    b0_30: Number(r.b0_30 ?? 0),
    b31_60: Number(r.b31_60 ?? 0),
    b61_90: Number(r.b61_90 ?? 0),
    b91: Number(r.b91 ?? 0),
    total: Number(r.total ?? 0),
  }));

  const totals = aging.reduce((acc, r) => ({
    count: acc.count + r.count,
    b0_30: acc.b0_30 + r.b0_30,
    b31_60: acc.b31_60 + r.b31_60,
    b61_90: acc.b61_90 + r.b61_90,
    b91: acc.b91 + r.b91,
    total: acc.total + r.total,
  }), { count: 0, b0_30: 0, b31_60: 0, b61_90: 0, b91: 0, total: 0 });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Bảng tuổi nợ phải trả (A/P aging)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Mình còn nợ ai (sale team + thuế + BHXH). Nhóm theo tuổi cho sale team.
        </p>
      </div>

      {/* Summary */}
      <div>
        <SummaryCard label="Tổng HH còn trả sale team" value={totals.total} color="orange" bold />
      </div>
      <div className="text-xs text-slate-500 italic">
        Nghĩa vụ thuế/BHXH quản lý riêng ở phần Kế toán — không nhập chung với HH sale team.
      </div>

      {/* Sale team aging */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Nợ sale team (chi tiết theo tuổi)</h2>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left p-2">NVKD / CTV</th>
                <th className="text-right p-2 w-16">Số ĐC</th>
                <th className="text-right p-2">0-30</th>
                <th className="text-right p-2">31-60</th>
                <th className="text-right p-2">61-90</th>
                <th className="text-right p-2 text-red-200">&gt;90</th>
                <th className="text-right p-2 border-l border-slate-600">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {aging.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">Không có nợ sale team.</td></tr>
              )}
              {aging.map(r => (
                <tr key={r.name} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2 text-right text-xs text-slate-500">{r.count}</td>
                  <td className="p-2 text-right tabular-nums text-green-700">{r.b0_30 > 0 ? fmt(r.b0_30) : ""}</td>
                  <td className="p-2 text-right tabular-nums text-amber-700">{r.b31_60 > 0 ? fmt(r.b31_60) : ""}</td>
                  <td className="p-2 text-right tabular-nums text-orange-700">{r.b61_90 > 0 ? fmt(r.b61_90) : ""}</td>
                  <td className="p-2 text-right tabular-nums text-red-700 font-semibold">{r.b91 > 0 ? fmt(r.b91) : ""}</td>
                  <td className="p-2 text-right tabular-nums font-bold border-l">{fmt(r.total)}</td>
                </tr>
              ))}
              {aging.length > 0 && (
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                  <td className="p-2">TỔNG</td>
                  <td className="p-2 text-right text-xs">{totals.count}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(totals.b0_30)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(totals.b31_60)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(totals.b61_90)}</td>
                  <td className="p-2 text-right tabular-nums text-red-700">{fmt(totals.b91)}</td>
                  <td className="p-2 text-right tabular-nums border-l">{fmt(totals.total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-xs text-slate-500 italic">
        Nguồn: <b>cost_reconciliations</b> − <b>payments_out</b> (đối chiếu HH per NV).
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  const cls: Record<string, string> = {
    red: "bg-red-50 border-red-200 text-red-800",
    orange: "bg-orange-50 border-orange-200 text-orange-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[color]}`}>
      <div className="text-[11px] uppercase tracking-wide font-semibold">{label}</div>
      <div className={`tabular-nums mt-1 ${bold ? "text-2xl font-bold" : "text-lg font-semibold"}`}>{fmt(value)}</div>
    </div>
  );
}
