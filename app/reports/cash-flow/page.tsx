/**
 * Dòng tiền (báo cáo quản trị) — 100% từ sao kê Techcombank cty.
 * Gộp: Số dư & Runway + Vào/Ra per tháng + Phân loại + Top nhận tiền.
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

// Rule-based classify partner_name → nhóm chi
function classifyOut(partnerName: string | null, description: string): string {
  const p = (partnerName ?? "").toUpperCase();
  const d = description.toUpperCase();
  // Loại tên trùng nhưng không phải NVKD
  if (/PHAM NGOC THANH TAM|LE THANH TUNG|VO THI THU THAO/.test(p)) return "CTV/Khác";
  if (/(BACH|BÁCH|THANH|NHAT|NHẬT|LINH|GIANG|THUY|THÚY|THINH|THỊNH)/.test(p)) return "Sale team NVKD";
  if (/(HA SANG|TUONG VI|TƯỜNG VI|LUONG THI NGA|LAN KIM)/.test(p)) return "Admin/CTV nội bộ";
  if (/(BAM LAND|DXMD|DANH KHOI|BCONS|PHU DONG|PHÚ ĐÔNG)/.test(p)) return "CĐT/Đối tác";
  if (/KHO BAC|KBNN/.test(p)) return "Thuế";
  if (/BAO HIEM XA HOI|BHXH/.test(p)) return "BHXH";
  if (/PROPERTYGURU|MOGI|BATDONGSAN/.test(p) || /QUAN CAO|MARKETING/.test(d)) return "Marketing";
  if (/NGUYEN MINH TRIET|MINH TRIET/.test(p)) return "Triết CN";
  if (/THUE VP|THUÊ VP|VAN PHONG/.test(d) || /BCONS POLYGON/.test(p)) return "Thuê VP";
  return "Khác";
}

type SP = Promise<{ year?: string }>;

export default async function CashFlowPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") notFound();

  const sp = await searchParams;
  const year = sp.year ?? "2025";

  // ===== 1) Số dư hiện tại (running_balance của giao dịch mới nhất) =====
  const [latest] = await db.execute(sql`
    SELECT transaction_date::text as date, running_balance
    FROM bank_transactions
    ORDER BY transaction_date DESC, id DESC
    LIMIT 1
  `) as any[];
  const currentBalance = latest ? Number(latest.running_balance ?? 0) : 0;

  // ===== 2) Trailing 3 tháng burn / runway =====
  const now = new Date();
  const start3M = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const [t3] = await db.execute(sql`
    SELECT
      COALESCE(SUM(credit_amount), 0)::float8 as inflow,
      COALESCE(SUM(ABS(debit_amount)), 0)::float8 as outflow
    FROM bank_transactions
    WHERE transaction_date >= ${start3M.toISOString().slice(0, 10)}::date
      AND transaction_date <= ${now.toISOString().slice(0, 10)}::date
  `) as any[];
  const inflow3M = Number(t3.inflow), outflow3M = Number(t3.outflow);
  const netMonthly = (inflow3M - outflow3M) / 3;
  const isBurning = netMonthly < 0;
  const runwayMonths = isBurning ? currentBalance / Math.abs(netMonthly) : Infinity;

  // ===== 3) All rows năm chọn =====
  const rows = await db.execute(sql`
    SELECT transaction_date::text as tx_date, partner_name, description, debit_amount, credit_amount
    FROM bank_transactions
    WHERE transaction_date >= ${year + '-01-01'}::date
      AND transaction_date <= ${year + '-12-31'}::date
    ORDER BY transaction_date
  `) as any[];

  // Group per month + category
  type MonthlyStats = {
    month: string;
    inTotal: number;
    outTotal: number;
    outByCategory: Map<string, number>;
  };
  const monthly = new Map<string, MonthlyStats>();
  const allOutCats = new Set<string>();
  const topRecipients = new Map<string, { n: number; total: number; category: string }>();

  for (const r of rows) {
    const m = String(r.tx_date).slice(0, 7);
    if (!monthly.has(m)) {
      monthly.set(m, { month: m, inTotal: 0, outTotal: 0, outByCategory: new Map() });
    }
    const stats = monthly.get(m)!;
    if (r.debit_amount) {
      const amt = Math.abs(Number(r.debit_amount));
      stats.outTotal += amt;
      const cat = classifyOut(r.partner_name, r.description ?? "");
      allOutCats.add(cat);
      stats.outByCategory.set(cat, (stats.outByCategory.get(cat) ?? 0) + amt);
      const rk = r.partner_name ?? "—";
      if (!topRecipients.has(rk)) topRecipients.set(rk, { n: 0, total: 0, category: cat });
      const tr = topRecipients.get(rk)!;
      tr.n++; tr.total += amt;
    }
    if (r.credit_amount) stats.inTotal += Number(r.credit_amount);
  }

  const months = [...monthly.keys()].sort();
  const outCatList = [...allOutCats].sort();
  const totalIn = [...monthly.values()].reduce((s, m) => s + m.inTotal, 0);
  const totalOut = [...monthly.values()].reduce((s, m) => s + m.outTotal, 0);
  const topRecipientsList = [...topRecipients.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Dòng tiền</h1>
        <p className="text-sm text-slate-500 mt-1">
          Từ sao kê Techcombank cty (source of truth 100%). Cập nhật đến {latest?.date ?? "—"}.
        </p>
      </div>

      {/* Section 1: Số dư & Runway */}
      <section>
        <h2 className="text-lg font-semibold mb-2">💰 Số dư & Runway</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatCard label="Số dư bank hiện tại" value={fmt(currentBalance)} color="blue" />
          <StatCard label="Vào TB / tháng (3T)" value={fmt(inflow3M / 3)} color="green" />
          <StatCard label="Ra TB / tháng (3T)" value={fmt(outflow3M / 3)} color="red" />
          <StatCard
            label={isBurning ? "Runway" : "Trạng thái"}
            value={isBurning ? `${runwayMonths.toFixed(1)} tháng` : "Đang lãi"}
            color={isBurning ? (runwayMonths < 3 ? "red" : "amber") : "green"}
          />
        </div>
        {isBurning && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
            ⚠️ Burn {fmt(Math.abs(netMonthly))}/tháng — cần bán thêm hoặc cắt chi.
          </div>
        )}
      </section>

      {/* Section 2: Vào/Ra per tháng */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-lg font-semibold">📊 Vào/Ra theo tháng {year}</h2>
          <div className="text-xs text-slate-500">
            Vào <b className="text-green-700 tabular-nums">{fmt(totalIn)}</b> · Ra <b className="text-red-700 tabular-nums">{fmt(totalOut)}</b> · Net <b className={`tabular-nums ${totalIn - totalOut >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(totalIn - totalOut)}</b>
          </div>
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2">Tháng</th>
                <th className="text-right p-2">Vào</th>
                <th className="text-right p-2">Ra</th>
                <th className="text-right p-2">Net</th>
                {outCatList.map((c) => (
                  <th key={c} className="text-right p-2 whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const s = monthly.get(m)!;
                const net = s.inTotal - s.outTotal;
                return (
                  <tr key={m} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2 font-mono">{m}</td>
                    <td className="p-2 text-right tabular-nums text-green-700">{fmtM(s.inTotal)}</td>
                    <td className="p-2 text-right tabular-nums text-red-700">{fmtM(s.outTotal)}</td>
                    <td className={`p-2 text-right tabular-nums font-semibold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>{fmtM(net)}</td>
                    {outCatList.map((c) => {
                      const v = s.outByCategory.get(c) ?? 0;
                      return (
                        <td key={c} className="p-2 text-right tabular-nums text-slate-500">
                          {v > 0 ? fmtM(v) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100 font-bold">
              <tr>
                <td className="p-2">TỔNG</td>
                <td className="p-2 text-right tabular-nums text-green-700">{fmt(totalIn)}</td>
                <td className="p-2 text-right tabular-nums text-red-700">{fmt(totalOut)}</td>
                <td className={`p-2 text-right tabular-nums ${totalIn - totalOut >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(totalIn - totalOut)}</td>
                {outCatList.map((c) => {
                  const total = [...monthly.values()].reduce((s, m) => s + (m.outByCategory.get(c) ?? 0), 0);
                  return <td key={c} className="p-2 text-right tabular-nums">{fmtM(total)}</td>;
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Section 3: Top nhận tiền */}
      <section>
        <h2 className="text-lg font-semibold mb-2">👥 Top 15 nhận tiền {year}</h2>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2">Người nhận</th>
                <th className="text-left p-2">Nhóm</th>
                <th className="text-right p-2">Số lần</th>
                <th className="text-right p-2">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {topRecipientsList.map((r) => (
                <tr key={r.name} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-slate-500">{r.category}</td>
                  <td className="p-2 text-right tabular-nums">{r.n}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-xs text-slate-500 italic">
        Sao kê chi tiết từng giao dịch (tham khảo): {" "}
        <Link href="/admin/bank-transactions" className="text-blue-600 hover:underline">
          Xem raw sao kê →
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: "green" | "red" | "blue" | "amber" }) {
  const cls = {
    green: "border-green-200 text-green-700 bg-green-50",
    red: "border-red-200 text-red-700 bg-red-50",
    blue: "border-blue-200 text-blue-700 bg-blue-50",
    amber: "border-amber-200 text-amber-700 bg-amber-50",
  }[color];
  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <div className="text-[11px] uppercase font-semibold tracking-wide">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
