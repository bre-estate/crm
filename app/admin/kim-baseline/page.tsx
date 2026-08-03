import { db } from "@/lib/db";
import {
  accountingJournal,
  revenueReconciliations,
  costReconciliations,
  paymentsIn,
  paymentsOut,
  financialTransactions,
} from "@/lib/schema";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { sql, eq } from "drizzle-orm";
import Link from "next/link";
import { fmtMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// ============================================================================
// Chart of Accounts (TT200) — tên + nhóm
// ============================================================================
type TKType = "asset" | "liability" | "equity" | "revenue" | "expense" | "closing";

const TK_META: Record<string, { name: string; type: TKType }> = {
  "1111": { name: "Tiền mặt VND", type: "asset" },
  "11211": { name: "Ngân hàng MB", type: "asset" },
  "131": { name: "Phải thu khách hàng", type: "asset" },
  "1331": { name: "Thuế GTGT được khấu trừ", type: "asset" },
  "141": { name: "Tạm ứng", type: "asset" },
  "242": { name: "Chi phí trả trước", type: "asset" },
  "244": { name: "Cầm cố, ký quỹ", type: "asset" },
  "331": { name: "Phải trả NCC", type: "liability" },
  "3341": { name: "Phải trả người lao động", type: "liability" },
  "335": { name: "Chi phí phải trả", type: "liability" },
  "33311": { name: "Thuế GTGT phải nộp", type: "liability" },
  "3334": { name: "Thuế TNDN phải nộp", type: "liability" },
  "3335": { name: "Thuế TNCN phải nộp", type: "liability" },
  "3383": { name: "BHXH phải nộp", type: "liability" },
  "3384": { name: "BHYT phải nộp", type: "liability" },
  "3386": { name: "BHTN phải nộp", type: "liability" },
  "3388": { name: "Phải trả khác (Thu hộ/Chi hộ YCTV)", type: "liability" },
  "411": { name: "Vốn góp CSH", type: "equity" },
  "4211": { name: "Lãi/lỗ năm trước", type: "equity" },
  "4212": { name: "Lãi/lỗ năm nay", type: "equity" },
  "5113": { name: "Doanh thu dịch vụ (HH môi giới)", type: "revenue" },
  "515": { name: "DT hoạt động tài chính", type: "revenue" },
  "6411": { name: "Lương NVKD", type: "expense" },
  "6417": { name: "HH sale + Marketing + Thưởng doanh số", type: "expense" },
  "6421": { name: "Lương admin + kế toán", type: "expense" },
  "6423": { name: "Đồ dùng VP", type: "expense" },
  "6425": { name: "Thuế môn bài", type: "expense" },
  "6427": { name: "Thuê VP + tiện ích + dịch vụ", type: "expense" },
  "811": { name: "Chi phí khác (không hóa đơn)", type: "expense" },
  "821": { name: "Chi phí thuế TNDN", type: "expense" },
  "635": { name: "Chi phí tài chính", type: "expense" },
  "911": { name: "Xác định KQKD (closing)", type: "closing" },
};

const TYPE_ORDER: TKType[] = ["asset", "liability", "equity", "revenue", "expense", "closing"];
const TYPE_LABEL: Record<TKType, string> = {
  asset: "TÀI SẢN",
  liability: "NỢ PHẢI TRẢ",
  equity: "VỐN CHỦ SỞ HỮU",
  revenue: "DOANH THU",
  expense: "CHI PHÍ",
  closing: "KẾT CHUYỂN CUỐI KỲ",
};

// Với TK asset/expense: dùng debit − credit (positive normal balance)
// Với TK liability/equity/revenue: dùng credit − debit
function normalBalance(tk: string, debit: number, credit: number): number {
  const type = TK_META[tk]?.type;
  if (type === "asset" || type === "expense") return debit - credit;
  return credit - debit;
}

async function getKimTotals(): Promise<Map<string, { debit: number; credit: number }>> {
  const debit = await db
    .select({
      tk: accountingJournal.debitAccount,
      s: sql<number>`sum(${accountingJournal.amount})::float8`,
    })
    .from(accountingJournal)
    .groupBy(accountingJournal.debitAccount);
  const credit = await db
    .select({
      tk: accountingJournal.creditAccount,
      s: sql<number>`sum(${accountingJournal.amount})::float8`,
    })
    .from(accountingJournal)
    .groupBy(accountingJournal.creditAccount);
  const map = new Map<string, { debit: number; credit: number }>();
  for (const r of debit) {
    map.set(r.tk, { debit: Number(r.s), credit: 0 });
  }
  for (const r of credit) {
    const cur = map.get(r.tk) ?? { debit: 0, credit: 0 };
    cur.credit = Number(r.s);
    map.set(r.tk, cur);
  }
  return map;
}

// Map từng TK sang CRM equivalent value (chỉ 2025 để so 1:1 với Kim)
async function getCrmEquivalents(): Promise<Record<string, { value: number; source: string }>> {
  const YEAR_START = "2025-01-01";
  const YEAR_END = "2025-12-31";

  const [rev5113] = await db
    .select({ s: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8` })
    .from(revenueReconciliations)
    .where(sql`${revenueReconciliations.reconciliationDate} BETWEEN ${YEAR_START} AND ${YEAR_END}`);

  const [pIn] = await db
    .select({ s: sql<number>`coalesce(sum(${paymentsIn.amount}), 0)::float8` })
    .from(paymentsIn)
    .where(sql`${paymentsIn.paymentDate} BETWEEN ${YEAR_START} AND ${YEAR_END}`);

  const [pOut] = await db
    .select({ s: sql<number>`coalesce(sum(${paymentsOut.amount}), 0)::float8` })
    .from(paymentsOut)
    .where(sql`${paymentsOut.paymentDate} BETWEEN ${YEAR_START} AND ${YEAR_END}`);

  const [costRecon] = await db
    .select({ s: sql<number>`coalesce(sum(${costReconciliations.amountPayableThisTime}), 0)::float8` })
    .from(costReconciliations)
    .where(sql`${costReconciliations.reconciliationDate} BETWEEN ${YEAR_START} AND ${YEAR_END}`);

  // Financial txns per category 2025
  const finTxs = await db
    .select({
      cat: financialTransactions.categoryCode,
      s: sql<number>`coalesce(sum(${financialTransactions.amount}), 0)::float8`,
    })
    .from(financialTransactions)
    .where(sql`${financialTransactions.transactionMonth} LIKE '2025-%'`)
    .groupBy(financialTransactions.categoryCode);
  const finByCat = new Map<string, number>();
  for (const r of finTxs) finByCat.set(r.cat, Number(r.s));

  return {
    "1111": { value: 0, source: "(chưa track — bank balance chỉ có 11211)" },
    "11211": { value: Number(pIn.s) - Number(pOut.s), source: "payments_in − payments_out" },
    "131": { value: Number(rev5113.s), source: "sum revenue_reconciliations" },
    "1331": { value: finByCat.get("1331") ?? 0, source: "fin_txn category=1331" },
    "141": { value: finByCat.get("141") ?? 0, source: "fin_txn category=141" },
    "242": { value: finByCat.get("242") ?? 0, source: "fin_txn category=242" },
    "244": { value: finByCat.get("244") ?? 0, source: "fin_txn category=244" },
    "331": { value: finByCat.get("331") ?? 0, source: "fin_txn category=331" },
    "3341": { value: 0, source: "(không track — HH sale ở cost_recon)" },
    "335": { value: 0, source: "(không track)" },
    "33311": { value: (finByCat.get("3331-3334") ?? 0) * 0.4, source: "≈ 40% của 3331-3334 (GTGT)" },
    "3334": { value: (finByCat.get("3331-3334") ?? 0) * 0.1, source: "≈ 10% của 3331-3334 (TNDN)" },
    "3335": { value: (finByCat.get("3331-3334") ?? 0) * 0.5, source: "≈ 50% của 3331-3334 (TNCN)" },
    "3388": { value: finByCat.get("3411") ?? 0, source: "fin_txn category=3411 (chỉ có leg out)" },
    "411": { value: finByCat.get("411") ?? 0, source: "fin_txn category=411" },
    "5113": { value: Number(rev5113.s) / 1.1, source: "sum revenue_reconciliations / 1.1 (excl VAT)" },
    "6411": { value: finByCat.get("6411") ?? 0, source: "fin_txn category=6411" },
    "6417": { value: Number(costRecon.s) + (finByCat.get("6417") ?? 0), source: "cost_reconciliations + fin_txn 6417" },
    "6421": { value: finByCat.get("6421") ?? 0, source: "fin_txn category=6421" },
    "6423": { value: finByCat.get("6423") ?? 0, source: "fin_txn category=6423" },
    "6425": { value: finByCat.get("6425") ?? 0, source: "fin_txn category=6425" },
    "6427": { value: finByCat.get("6427") ?? 0, source: "fin_txn category=6427" },
    "811": { value: finByCat.get("811") ?? 0, source: "fin_txn category=811" },
    "635": { value: finByCat.get("635") ?? 0, source: "fin_txn category=635" },
    "515": { value: 0, source: "(không track — lãi bank)" },
    "911": { value: 0, source: "(closing entry, không tính)" },
    "4211": { value: 0, source: "(closing entry, không tính)" },
    "4212": { value: 0, source: "(closing entry, không tính)" },
    "821": { value: 0, source: "(không track)" },
  };
}

function statusOf(kimNet: number, crmValue: number, tk: string): { status: "ok" | "warn" | "gap"; label: string } {
  if (TK_META[tk]?.type === "closing") return { status: "ok", label: "N/A" };
  const abs = Math.abs(kimNet - crmValue);
  const pct = kimNet !== 0 ? (abs / Math.abs(kimNet)) * 100 : 0;
  if (kimNet === 0 && crmValue === 0) return { status: "ok", label: "Bỏ qua" };
  if (abs < 100_000) return { status: "ok", label: "Khớp" }; // < 100k VND accept
  if (pct < 5) return { status: "ok", label: `${pct.toFixed(1)}% gap` };
  if (pct < 20) return { status: "warn", label: `${pct.toFixed(1)}% gap` };
  return { status: "gap", label: `${pct.toFixed(1)}% gap` };
}

export default async function KimBaselinePage() {
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  const [kimTotals, crmEquiv] = await Promise.all([getKimTotals(), getCrmEquivalents()]);

  // Group by TK type
  const rows: Array<{
    tk: string;
    meta: (typeof TK_META)[string];
    kimDebit: number;
    kimCredit: number;
    kimNet: number;
    crmValue: number;
    crmSource: string;
    status: ReturnType<typeof statusOf>;
  }> = [];

  const allTks = new Set([...Array.from(kimTotals.keys()), ...Object.keys(TK_META)]);
  for (const tk of allTks) {
    const meta = TK_META[tk] ?? { name: `TK ${tk}`, type: "asset" as TKType };
    const kim = kimTotals.get(tk) ?? { debit: 0, credit: 0 };
    const kimNet = normalBalance(tk, kim.debit, kim.credit);
    const equiv = crmEquiv[tk] ?? { value: 0, source: "(chưa map)" };
    rows.push({
      tk,
      meta,
      kimDebit: kim.debit,
      kimCredit: kim.credit,
      kimNet,
      crmValue: equiv.value,
      crmSource: equiv.source,
      status: statusOf(kimNet, equiv.value, tk),
    });
  }

  // Sort: theo type order rồi theo TK code
  rows.sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(a.meta.type);
    const tb = TYPE_ORDER.indexOf(b.meta.type);
    if (ta !== tb) return ta - tb;
    return a.tk.localeCompare(b.tk);
  });

  const gapCount = rows.filter((r) => r.status.status === "gap").length;
  const warnCount = rows.filter((r) => r.status.status === "warn").length;
  const okCount = rows.filter((r) => r.status.status === "ok").length;

  const rowsByType = new Map<TKType, typeof rows>();
  for (const r of rows) {
    if (!rowsByType.has(r.meta.type)) rowsByType.set(r.meta.type, []);
    rowsByType.get(r.meta.type)!.push(r);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs">
          <Link href="/" className="text-blue-600 hover:underline">← Trang chủ</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">📚 Kim baseline vs CRM</h1>
        <p className="text-sm text-slate-500 mt-1">
          So sánh sổ Nhật ký chung của Kim (import 2025, 756 entries đã CÂN) với data
          CRM hiện tại theo từng TK. Gap lớn = có bug import hoặc data missing.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatBox label="✅ Khớp / N/A" count={okCount} color="green" />
        <StatBox label="⚠️ Gap 5-20%" count={warnCount} color="amber" />
        <StatBox label="❌ Gap > 20%" count={gapCount} color="red" />
      </div>

      {TYPE_ORDER.map((type) => {
        const list = rowsByType.get(type) ?? [];
        if (list.length === 0) return null;
        return (
          <div key={type}>
            <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider mb-2">
              {TYPE_LABEL[type]}
            </div>
            <Card className="p-0 gap-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full w-max text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left p-2 sticky left-0 bg-slate-50 z-10">TK</th>
                      <th className="text-left p-2">Tên</th>
                      <th className="text-right p-2">Kim Nợ</th>
                      <th className="text-right p-2">Kim Có</th>
                      <th className="text-right p-2 bg-slate-100">Kim (số dư)</th>
                      <th className="text-right p-2">CRM</th>
                      <th className="text-left p-2">Nguồn CRM</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      const statusCfg = {
                        ok: { icon: "✅", cls: "text-slate-500" },
                        warn: { icon: "⚠️", cls: "text-amber-700 font-semibold" },
                        gap: { icon: "❌", cls: "text-red-700 font-bold" },
                      }[r.status.status];
                      return (
                        <tr key={r.tk} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="p-2 font-mono sticky left-0 bg-white">{r.tk}</td>
                          <td className="p-2">{r.meta.name}</td>
                          <td className="p-2 text-right tabular-nums text-slate-500">
                            {r.kimDebit > 0 ? fmtMoney(r.kimDebit) : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums text-slate-500">
                            {r.kimCredit > 0 ? fmtMoney(r.kimCredit) : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums font-semibold bg-slate-50">
                            {r.kimNet !== 0 ? fmtMoney(r.kimNet) : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {r.crmValue !== 0 ? fmtMoney(r.crmValue) : "—"}
                          </td>
                          <td className="p-2 text-slate-500 text-[10px] italic">
                            {r.crmSource}
                          </td>
                          <td className={cn("p-2 text-center whitespace-nowrap", statusCfg.cls)}>
                            {statusCfg.icon} {r.status.label}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );
      })}

      <Card className="bg-blue-50 ring-blue-200 [--card-spacing:1rem] px-4">
        <div className="text-xs uppercase text-blue-800 font-semibold tracking-wider mb-2">
          Ghi chú
        </div>
        <ul className="text-xs text-blue-900 space-y-1 list-disc list-inside">
          <li><b>Kim (số dư)</b>: normal balance — với TS/CP = Nợ − Có, với NPT/VCSH/DT = Có − Nợ.</li>
          <li><b>Gap phổ biến</b>: TK 3388 (YCTV) sẽ gap lớn — CRM chỉ có leg 4 (out), Kim có đủ 4 leg.</li>
          <li><b>TK 6417</b>: CRM sum cost_reconciliations + fin_txn 6417 để tránh double count.</li>
          <li>Thuế 33311/3334/3335 hiện fin_txn merge vào 1 category "3331-3334" → chia % ước lượng.</li>
          <li>TK 911/4211/4212 = closing entries cuối kỳ, không map CRM.</li>
        </ul>
      </Card>
    </div>
  );
}

function StatBox({ label, count, color }: { label: string; count: number; color: "green" | "amber" | "red" }) {
  const cls =
    color === "green"
      ? "bg-green-50 ring-green-200 text-green-800"
      : color === "amber"
        ? "bg-amber-50 ring-amber-200 text-amber-800"
        : "bg-red-50 ring-red-200 text-red-800";
  return (
    <Card className={cn("px-4", cls)}>
      <div className="text-xs uppercase font-semibold">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{count}</div>
    </Card>
  );
}
