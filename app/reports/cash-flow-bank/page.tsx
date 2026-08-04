/**
 * Cash flow từ sao kê Techcombank cty (source of truth 100%).
 * Không phụ thuộc classify của financial_transactions (thiếu 43% data).
 */
import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/schema";
import { sql, gte, lte, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtM = (n: number) => (n / 1_000_000).toFixed(1) + "M";

type SP = Promise<{ year?: string }>;

// Auto-classify partner_name → nhóm chi. Rule-based, có thể mở rộng dần.
function classifyOut(partnerName: string | null, description: string): string {
  const p = (partnerName ?? "").toUpperCase();
  const d = description.toUpperCase();

  // Sale team (NVKD chính thức)
  if (/(BACH|BÁCH|THANH(?!.*(TAM|TUNG))|NHAT|NHẬT|LINH|GIANG|THUY|THÚY|THINH|THỊNH)/.test(p)) {
    // Filter khỏi các tên trùng nhưng không phải NVKD
    if (/PHAM NGOC THANH TAM|LE THANH TUNG|VO THI THU THAO/.test(p)) return "CTV/Khác";
    return "Sale team NVKD";
  }
  // CTV freelance (nhân sự phụ)
  if (/(HA SANG|TUONG VI|TƯỜNG VI|NGA|LAN KIM)/.test(p)) return "Admin/CTV nội bộ";
  // CĐT (booking hoàn, chi hộ khách)
  if (/(BAM LAND|DXMD|DANH KHOI|BCONS|PHU DONG|PHÚ ĐÔNG|PROPERTYGURU)/.test(p)) return "CĐT/Đối tác";
  // Thuế
  if (/KHO BAC|KBNN/.test(p)) return "Thuế";
  // BHXH
  if (/BAO HIEM XA HOI|BHXH/.test(p)) return "BHXH";
  // Landlord VP
  if (/BCONS POLYGON|LANDLORD|CHU NHA/.test(p) || /THUE VP|THUÊ VP|VAN PHONG/.test(d)) return "Thuê VP";
  // Marketing
  if (/PROPERTYGURU|MOGI|BATDONGSAN/.test(p) || /QUAN CAO|MARKETING|AD/.test(d)) return "Marketing";
  // Triết cá nhân
  if (/NGUYEN MINH TRIET|MINH TRIET/.test(p)) return "Triết CN (hoàn/chi)";
  return "Khác";
}

function classifyIn(partnerName: string | null, description: string): string {
  const p = (partnerName ?? "").toUpperCase();
  const d = description.toUpperCase();
  if (/BAM LAND|DXMD|DANH KHOI|PHU DONG|BCONS/.test(p)) return "Doanh thu CĐT";
  if (/LAI SO DU/.test(d) || /INTEREST/.test(d)) return "Lãi tiền gửi";
  if (/HOAN|REFUND/.test(d)) return "Hoàn tiền";
  if (/KHACH HANG|CUSTOMER/.test(d)) return "Từ khách hàng";
  return "Khác";
}

export default async function CashFlowBankPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") notFound();

  const sp = await searchParams;
  const year = sp.year ?? "2025";

  const rows = await db
    .select({
      transactionDate: bankTransactions.transactionDate,
      partnerName: bankTransactions.partnerName,
      description: bankTransactions.description,
      debitAmount: bankTransactions.debitAmount,
      creditAmount: bankTransactions.creditAmount,
    })
    .from(bankTransactions)
    .where(
      and(
        gte(bankTransactions.transactionDate, `${year}-01-01`),
        lte(bankTransactions.transactionDate, `${year}-12-31`),
      ),
    )
    .orderBy(bankTransactions.transactionDate);

  // Group per month + category
  type MonthlyStats = {
    month: string;
    inTotal: number;
    outTotal: number;
    outByCategory: Map<string, number>;
    inByCategory: Map<string, number>;
  };
  const monthly = new Map<string, MonthlyStats>();
  const allOutCats = new Set<string>();
  const allInCats = new Set<string>();
  const topRecipients = new Map<string, { n: number; total: number; category: string }>();

  for (const r of rows) {
    const m = r.transactionDate.slice(0, 7);
    if (!monthly.has(m)) {
      monthly.set(m, {
        month: m,
        inTotal: 0,
        outTotal: 0,
        outByCategory: new Map(),
        inByCategory: new Map(),
      });
    }
    const stats = monthly.get(m)!;
    if (r.debitAmount) {
      const amt = Math.abs(Number(r.debitAmount));
      stats.outTotal += amt;
      const cat = classifyOut(r.partnerName, r.description);
      allOutCats.add(cat);
      stats.outByCategory.set(cat, (stats.outByCategory.get(cat) ?? 0) + amt);
      const rk = r.partnerName ?? "—";
      if (!topRecipients.has(rk)) topRecipients.set(rk, { n: 0, total: 0, category: cat });
      const tr = topRecipients.get(rk)!;
      tr.n++; tr.total += amt;
    }
    if (r.creditAmount) {
      const amt = Number(r.creditAmount);
      stats.inTotal += amt;
      const cat = classifyIn(r.partnerName, r.description);
      allInCats.add(cat);
      stats.inByCategory.set(cat, (stats.inByCategory.get(cat) ?? 0) + amt);
    }
  }

  const months = [...monthly.keys()].sort();
  const outCatList = [...allOutCats].sort();
  const totalIn = [...monthly.values()].reduce((s, m) => s + m.inTotal, 0);
  const totalOut = [...monthly.values()].reduce((s, m) => s + m.outTotal, 0);

  const topRecipientsList = [...topRecipients.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Cash flow — Sao kê Techcombank</h1>
        <p className="text-sm text-slate-500 mt-1">
          Source: sao kê ngân hàng (100% chính xác). Phân loại chi phí tự động
          theo tên đối tác.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label={`Vào ${year}`} value={fmt(totalIn)} color="green" />
        <StatCard label={`Ra ${year}`} value={fmt(totalOut)} color="red" />
        <StatCard label="Net" value={fmt(totalIn - totalOut)} color={totalIn - totalOut >= 0 ? "green" : "red"} />
      </div>

      {/* Monthly breakdown */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Cash flow theo tháng — {year}</h2>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-slate-50">Tháng</th>
                <th className="text-right p-2">Vào</th>
                <th className="text-right p-2">Ra</th>
                <th className="text-right p-2">Net</th>
                {outCatList.map((c) => (
                  <th key={c} className="text-right p-2 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const s = monthly.get(m)!;
                const net = s.inTotal - s.outTotal;
                return (
                  <tr key={m} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2 sticky left-0 bg-white font-mono">{m}</td>
                    <td className="p-2 text-right tabular-nums text-green-700">{fmtM(s.inTotal)}</td>
                    <td className="p-2 text-right tabular-nums text-red-700">{fmtM(s.outTotal)}</td>
                    <td className={`p-2 text-right tabular-nums font-semibold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {fmtM(net)}
                    </td>
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
                <td className="p-2 sticky left-0 bg-slate-100">TỔNG</td>
                <td className="p-2 text-right tabular-nums text-green-700">{fmt(totalIn)}</td>
                <td className="p-2 text-right tabular-nums text-red-700">{fmt(totalOut)}</td>
                <td className={`p-2 text-right tabular-nums ${totalIn - totalOut >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {fmt(totalIn - totalOut)}
                </td>
                {outCatList.map((c) => {
                  const total = [...monthly.values()].reduce(
                    (s, m) => s + (m.outByCategory.get(c) ?? 0),
                    0,
                  );
                  return (
                    <td key={c} className="p-2 text-right tabular-nums">
                      {fmt(total / 1_000_000)}M
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Top recipients */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Top 20 nhận tiền — {year}</h2>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2">Người nhận</th>
                <th className="text-left p-2">Nhóm</th>
                <th className="text-right p-2">Số lần</th>
                <th className="text-right p-2">Tổng nhận</th>
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
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: "green" | "red" }) {
  const cls = color === "green" ? "border-green-200 text-green-700" : "border-red-200 text-red-700";
  return (
    <div className={`bg-white border rounded-xl p-4 ${cls}`}>
      <div className="text-[11px] uppercase font-semibold tracking-wide">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
