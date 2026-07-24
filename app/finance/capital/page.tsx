import { db } from "@/lib/db";
import { financialTransactions } from "@/lib/schema";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { sql, inArray, desc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("vi-VN");

export default async function CapitalPage() {
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  // Mọi giao dịch vốn góp (411) + kí quỹ (244).
  // Kí quỹ 244 vẫn là vốn góp founder per framework 2026-07-24
  // (Founder → cty → CĐT); cty ghi TS 244 đối ứng VCSH 411.
  const rows = await db
    .select({
      id: financialTransactions.id,
      date: financialTransactions.transactionDate,
      month: financialTransactions.transactionMonth,
      description: financialTransactions.description,
      amount: financialTransactions.amount,
      categoryCode: financialTransactions.categoryCode,
      payer: financialTransactions.payer,
    })
    .from(financialTransactions)
    .where(inArray(financialTransactions.categoryCode, ["411", "244"]))
    .orderBy(desc(financialTransactions.transactionDate));

  const totalCapital = rows.reduce((s, r) => s + Number(r.amount), 0);
  const totalKiquy = rows
    .filter((r) => r.categoryCode === "244")
    .reduce((s, r) => s + Number(r.amount), 0);

  // Group per founder × month
  const founders = new Set<string>();
  const months = new Set<string>();
  const grid = new Map<string, Map<string, number>>();
  const founderTotals = new Map<string, number>();
  for (const r of rows) {
    const f = r.payer ?? "?";
    const m = r.month;
    founders.add(f);
    months.add(m);
    if (!grid.has(f)) grid.set(f, new Map());
    const mm = grid.get(f)!;
    mm.set(m, (mm.get(m) ?? 0) + Number(r.amount));
    founderTotals.set(f, (founderTotals.get(f) ?? 0) + Number(r.amount));
  }
  const founderList = [...founders].sort();
  const monthList = [...months].sort();

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <div className="text-xs">
          <Link href="/finance" className="text-blue-600 hover:underline">
            ← Tài chính
          </Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Vốn góp founder</h1>
        <p className="text-sm text-slate-500 mt-1">
          Vốn góp CSH (TK 411) + Ký quỹ dự án (TK 244). Ký quỹ vẫn là tiền
          Triết bỏ vào cty để cty ký quỹ với đối tác — coi là vốn góp per
          framework chốt 2026-07-24.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng vốn góp" value={fmt(totalCapital)} sub="411 + 244" />
        <StatCard
          label="Vốn CSH (411)"
          value={fmt(totalCapital - totalKiquy)}
          sub="Topup + nộp TK cty"
        />
        <StatCard label="Ký quỹ (244)" value={fmt(totalKiquy)} sub="Dự án A&T + ..." />
        <StatCard label="Số founder" value={`${founderList.length}`} sub={founderList.join(" · ")} />
      </div>

      {/* Per-founder totals */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3">Tổng theo founder</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="text-left p-2">Founder</th>
              <th className="text-right p-2">Vốn góp</th>
              <th className="text-right p-2">% tỷ trọng</th>
            </tr>
          </thead>
          <tbody>
            {founderList.map((f) => {
              const sum = founderTotals.get(f) ?? 0;
              const pct = totalCapital > 0 ? (sum / totalCapital) * 100 : 0;
              return (
                <tr key={f} className="border-t border-slate-100">
                  <td className="p-2 font-medium">{f}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(sum)}</td>
                  <td className="p-2 text-right tabular-nums">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 text-sm font-semibold">
            <tr>
              <td className="p-2">TỔNG</td>
              <td className="p-2 text-right tabular-nums">{fmt(totalCapital)}</td>
              <td className="p-2 text-right">100.0%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Grid founder × month */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <div className="p-4">
          <h2 className="text-sm font-semibold">Vốn góp theo tháng</h2>
          <p className="text-[11px] text-slate-500">
            Trống = tháng đó founder không góp. Cột "Lũy kế" = tổng đến hết tháng đó.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="text-left p-2">Tháng</th>
              {founderList.map((f) => (
                <th key={f} className="text-right p-2 whitespace-nowrap">
                  {f}
                </th>
              ))}
              <th className="text-right p-2 whitespace-nowrap">Tổng tháng</th>
              <th className="text-right p-2 whitespace-nowrap">Lũy kế</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let running = 0;
              return monthList.map((m) => {
                const perFounder = founderList.map((f) => grid.get(f)?.get(m) ?? 0);
                const monthTotal = perFounder.reduce((s, v) => s + v, 0);
                running += monthTotal;
                return (
                  <tr key={m} className="border-t border-slate-100">
                    <td className="p-2 font-mono text-xs">{m}</td>
                    {perFounder.map((v, i) => (
                      <td key={i} className="p-2 text-right tabular-nums">
                        {v > 0 ? fmt(v) : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                    <td className="p-2 text-right tabular-nums font-medium">{fmt(monthTotal)}</td>
                    <td className="p-2 text-right tabular-nums text-blue-700 font-semibold">
                      {fmt(running)}
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {/* Chi tiết giao dịch */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <div className="p-4">
          <h2 className="text-sm font-semibold">Chi tiết giao dịch ({rows.length} rows)</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="text-left p-2">Ngày</th>
              <th className="text-left p-2">Chi tiết</th>
              <th className="text-right p-2">VND</th>
              <th className="text-left p-2">TK</th>
              <th className="text-left p-2">Founder</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-2 font-mono text-xs">{r.date}</td>
                <td className="p-2 text-xs">{r.description}</td>
                <td className="p-2 text-right tabular-nums">{fmt(Number(r.amount))}</td>
                <td className="p-2 font-mono text-xs">{r.categoryCode}</td>
                <td className="p-2 text-xs">{r.payer ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
