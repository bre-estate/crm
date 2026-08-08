/**
 * Balance Sheet quản trị (BCĐKT) — chuẩn TT200 B01-DN.
 * Nguồn: trial_balance (import từ sheet CDPS của Kim). Tài sản = Nợ + Vốn.
 */
import { db } from "@/lib/db";
import { trialBalance } from "@/lib/schema";
import { sql, eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

type SP = Promise<{ period?: string }>;

// TK mapping theo TT200 B01-DN
const TS_NGAN_HAN = [
  { code: "111", label: "Tiền mặt" },
  { code: "112", label: "Tiền gửi ngân hàng" },
  { code: "131", label: "Phải thu khách hàng" },
  { code: "133", label: "Thuế GTGT được khấu trừ" },
  { code: "138", label: "Phải thu khác" },
  { code: "141", label: "Tạm ứng nội bộ" },
  { code: "152", label: "Nguyên vật liệu" },
  { code: "153", label: "Công cụ dụng cụ" },
  { code: "242", label: "Chi phí trả trước" },
];
const TS_DAI_HAN = [
  { code: "211", label: "TSCĐ hữu hình" },
  { code: "213", label: "TSCĐ vô hình" },
  { code: "244", label: "Cầm cố, ký quỹ, ký cược dài hạn" },
];
const NPT = [
  { code: "331", label: "Phải trả người bán" },
  { code: "333", label: "Thuế và các khoản phải nộp NN" },
  { code: "334", label: "Phải trả người lao động" },
  { code: "335", label: "Chi phí phải trả (trích trước)" },
  { code: "338", label: "Phải trả, phải nộp khác" },
  { code: "341", label: "Vay và nợ thuê tài chính" },
];
const VCSH = [
  { code: "411", label: "Vốn đầu tư của CSH" },
  { code: "421", label: "Lợi nhuận sau thuế chưa phân phối" },
];

export default async function BalanceSheetPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sp = await searchParams;
  const periodEnd = sp.period || "2025-12-31";

  // Get all trial balance rows for period, length=3 (parent) để không dupe
  const rows = await db
    .select()
    .from(trialBalance)
    .where(and(eq(trialBalance.periodEnd, periodEnd), sql`length(${trialBalance.accountCode}) = 3`));

  const bal = new Map<string, { name: string; debit: number; credit: number; opening: number }>();
  for (const r of rows) {
    bal.set(r.accountCode, {
      name: r.accountName,
      debit: Number(r.closingDebit ?? 0),
      credit: Number(r.closingCredit ?? 0),
      opening: Number(r.openingDebit ?? 0) - Number(r.openingCredit ?? 0),
    });
  }

  // TS = debit - credit (Nợ − Có). NPT + VCSH = credit - debit.
  const getTs = (code: string) => {
    const b = bal.get(code);
    return b ? b.debit - b.credit : 0;
  };
  const getNpt = (code: string) => {
    const b = bal.get(code);
    return b ? b.credit - b.debit : 0;
  };

  const tsNganHan = TS_NGAN_HAN.map(a => ({ ...a, amount: getTs(a.code) })).filter(a => a.amount !== 0);
  const tsDaiHan = TS_DAI_HAN.map(a => ({ ...a, amount: getTs(a.code) })).filter(a => a.amount !== 0);
  const npt = NPT.map(a => ({ ...a, amount: getNpt(a.code) })).filter(a => a.amount !== 0);
  const vcsh = VCSH.map(a => ({ ...a, amount: getNpt(a.code) })).filter(a => a.amount !== 0);

  const totalTsNganHan = tsNganHan.reduce((s, r) => s + r.amount, 0);
  const totalTsDaiHan = tsDaiHan.reduce((s, r) => s + r.amount, 0);
  const totalTs = totalTsNganHan + totalTsDaiHan;
  const totalNpt = npt.reduce((s, r) => s + r.amount, 0);
  const totalVcsh = vcsh.reduce((s, r) => s + r.amount, 0);
  const totalNv = totalNpt + totalVcsh;
  const diff = totalTs - totalNv;

  // Rows chưa xử lý (nếu có TK khác không nằm trong template)
  const knownCodes = new Set([...TS_NGAN_HAN, ...TS_DAI_HAN, ...NPT, ...VCSH].map(a => a.code));
  const untracked = Array.from(bal.entries())
    .filter(([code]) => !knownCodes.has(code) && !code.startsWith("5") && !code.startsWith("6") && !code.startsWith("7") && !code.startsWith("8") && !code.startsWith("9"))
    .map(([code, v]) => ({ code, name: v.name, debit: v.debit, credit: v.credit }));

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs"><Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link></div>
        <h1 className="text-2xl font-bold mt-1">Bảng cân đối kế toán</h1>
        <p className="text-sm text-slate-500 mt-1">Chuẩn TT200 B01-DN. Ngày báo cáo: <b>{periodEnd}</b>. Nguồn: CDPS Kim ({diff === 0 ? "✅ cân" : `❌ lệch ${fmt(diff)}`}).</p>
      </div>

      <div className={`p-4 rounded-xl border-2 ${diff === 0 ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-slate-600 uppercase">Tổng tài sản</div>
            <div className="text-2xl font-bold tabular-nums text-blue-800">{fmt(totalTs)}</div>
          </div>
          <div className="text-2xl font-bold self-center">=</div>
          <div>
            <div className="text-xs text-slate-600 uppercase">Nợ phải trả + Vốn CSH</div>
            <div className="text-2xl font-bold tabular-nums text-blue-800">{fmt(totalNv)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TÀI SẢN */}
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <div className="bg-blue-800 text-white p-3 font-bold">A. TÀI SẢN</div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="bg-blue-50 font-semibold border-t">
                <td className="p-2">I. Tài sản ngắn hạn</td>
                <td className="p-2 text-right tabular-nums">{fmt(totalTsNganHan)}</td>
              </tr>
              {tsNganHan.map(a => (
                <tr key={a.code} className="border-t">
                  <td className="p-2 pl-6"><span className="font-mono text-xs text-slate-500 mr-2">{a.code}</span>{a.label}</td>
                  <td className={`p-2 text-right tabular-nums ${a.amount < 0 ? "text-red-700" : ""}`}>{fmt(a.amount)}</td>
                </tr>
              ))}
              <tr className="bg-blue-50 font-semibold border-t">
                <td className="p-2">II. Tài sản dài hạn</td>
                <td className="p-2 text-right tabular-nums">{fmt(totalTsDaiHan)}</td>
              </tr>
              {tsDaiHan.map(a => (
                <tr key={a.code} className="border-t">
                  <td className="p-2 pl-6"><span className="font-mono text-xs text-slate-500 mr-2">{a.code}</span>{a.label}</td>
                  <td className={`p-2 text-right tabular-nums ${a.amount < 0 ? "text-red-700" : ""}`}>{fmt(a.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 bg-blue-100 font-bold">
                <td className="p-2">TỔNG TÀI SẢN</td>
                <td className="p-2 text-right tabular-nums text-blue-800">{fmt(totalTs)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* NGUỒN VỐN */}
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <div className="bg-blue-800 text-white p-3 font-bold">B. NGUỒN VỐN</div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="bg-blue-50 font-semibold border-t">
                <td className="p-2">I. Nợ phải trả</td>
                <td className="p-2 text-right tabular-nums">{fmt(totalNpt)}</td>
              </tr>
              {npt.map(a => (
                <tr key={a.code} className="border-t">
                  <td className="p-2 pl-6"><span className="font-mono text-xs text-slate-500 mr-2">{a.code}</span>{a.label}</td>
                  <td className={`p-2 text-right tabular-nums ${a.amount < 0 ? "text-red-700" : ""}`}>{fmt(a.amount)}</td>
                </tr>
              ))}
              <tr className="bg-blue-50 font-semibold border-t">
                <td className="p-2">II. Vốn chủ sở hữu</td>
                <td className="p-2 text-right tabular-nums">{fmt(totalVcsh)}</td>
              </tr>
              {vcsh.map(a => (
                <tr key={a.code} className="border-t">
                  <td className="p-2 pl-6"><span className="font-mono text-xs text-slate-500 mr-2">{a.code}</span>{a.label}</td>
                  <td className={`p-2 text-right tabular-nums ${a.amount < 0 ? "text-red-700" : ""}`}>{fmt(a.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 bg-blue-100 font-bold">
                <td className="p-2">TỔNG NGUỒN VỐN</td>
                <td className="p-2 text-right tabular-nums text-blue-800">{fmt(totalNv)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {untracked.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded p-3 text-sm">
          <div className="font-semibold mb-2">⚠️ TK chưa xếp vào template:</div>
          <table className="w-full text-xs">
            <tbody>
              {untracked.map(u => (
                <tr key={u.code}>
                  <td className="pr-2"><span className="font-mono">{u.code}</span> {u.name}</td>
                  <td className="text-right tabular-nums">D {fmt(u.debit)} / C {fmt(u.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-slate-500 italic">
        Nguồn: sheet CDPS trong file <b>SO SACH BRE 2025.xlsx</b> (Kim làm chuẩn TT200).
        Import lại: <code>npx tsx scripts/import-trial-balance.ts</code>.
      </div>
    </div>
  );
}
