/**
 * Nghĩa vụ tài chính: còn thu / còn nợ / nợ thuế.
 * - Còn thu CĐT = accrual revenue − đã nhận từ CĐT (payments_in)
 * - Còn nợ sale team = accrual HH sale − đã trả bank cho sale team (sao kê)
 * - Nợ thuế = NKC accrual thuế − đã nộp KBNN (sao kê)
 */
import { db } from "@/lib/db";
import { revenueReconciliations, paymentsIn, costReconciliations } from "@/lib/schema";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default async function ObligationsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") notFound();

  // 1) Còn thu CĐT = revenue_reconciliations.total_receivable − payments_in
  const [rev] = await db
    .select({ s: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8` })
    .from(revenueReconciliations);
  const [pIn] = await db
    .select({ s: sql<number>`coalesce(sum(${paymentsIn.amount}), 0)::float8` })
    .from(paymentsIn);
  const receivable = Math.max(0, Number(rev?.s ?? 0) - Number(pIn?.s ?? 0));

  // 2) Nghĩa vụ sale team = accrual HH sale/KPI/bonus
  const [costAccrual] = await db
    .select({ s: sql<number>`coalesce(sum(${costReconciliations.amountPayableThisTime}), 0)::float8` })
    .from(costReconciliations);

  // Cash trả cho sale team qua sao kê (2025+, match theo tên NVKD)
  const [saleCash] = await db.execute(sql`
    SELECT COALESCE(SUM(ABS(debit_amount)), 0)::float8 as s
    FROM bank_transactions
    WHERE debit_amount IS NOT NULL
      AND partner_name IN (
        'DOAN LE BACH', 'HO NGUYEN CONG THANH', 'TRAN MINH NHAT',
        'TRAN THI KHANH LINH', 'LE THI CAM GIANG', 'LE TRINH THANH THUY', 'VU DUC THINH'
      )
  `) as any[];

  const saleTeamCash = Number(saleCash.s ?? 0);
  const owedSaleTeam = Math.max(0, Number(costAccrual?.s ?? 0) - saleTeamCash);

  // 3) Nợ thuế = NKC TK 3334/3335/33311 accrual − cash paid to KBNN
  const [taxAccrual] = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::float8 as s
    FROM accounting_journal
    WHERE credit_account IN ('3334','3335','33311')
      AND debit_account != '911'
      AND substr(entry_date, 1, 4) IN ('2025','2026')
  `) as any[];

  const [taxCash] = await db.execute(sql`
    SELECT COALESCE(SUM(ABS(debit_amount)), 0)::float8 as s
    FROM bank_transactions
    WHERE debit_amount IS NOT NULL
      AND (partner_name ILIKE '%KHO BAC%' OR partner_name ILIKE '%KBNN%')
  `) as any[];

  const owedTax = Math.max(0, Number(taxAccrual.s ?? 0) - Number(taxCash.s ?? 0));

  // 4) Nợ BHXH (3383+3384+3386 accrual − cash BHXH)
  const [bhxhAccrual] = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::float8 as s
    FROM accounting_journal
    WHERE credit_account IN ('3383','3384','3386')
      AND debit_account != '911'
      AND substr(entry_date, 1, 4) IN ('2025','2026')
  `) as any[];

  const [bhxhCash] = await db.execute(sql`
    SELECT COALESCE(SUM(ABS(debit_amount)), 0)::float8 as s
    FROM bank_transactions
    WHERE debit_amount IS NOT NULL
      AND partner_name ILIKE '%BAO HIEM XA HOI%'
  `) as any[];

  const owedBhxh = Math.max(0, Number(bhxhAccrual.s ?? 0) - Number(bhxhCash.s ?? 0));

  // Tổng nợ ngoài
  const totalOwed = owedSaleTeam + owedTax + owedBhxh;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Nghĩa vụ tài chính</h1>
        <p className="text-sm text-slate-500 mt-1">
          Còn thu / còn nợ / thuế chưa nộp. Cash side lấy từ sao kê Techcombank.
        </p>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-[11px] uppercase font-semibold tracking-wide text-green-700">
            💰 Còn thu (tiền sắp về)
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1 text-green-800">
            {fmt(receivable)}
          </div>
          <div className="text-xs text-slate-600 mt-1">Từ CĐT theo ĐC</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-[11px] uppercase font-semibold tracking-wide text-red-700">
            📤 Tổng nợ (tiền sắp phải trả)
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1 text-red-800">
            {fmt(totalOwed)}
          </div>
          <div className="text-xs text-slate-600 mt-1">Sale team + Thuế + BHXH</div>
        </div>
      </div>

      {/* Detail */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Chi tiết nghĩa vụ</h2>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="text-left p-3">Loại</th>
                <th className="text-right p-3">Đã ghi nhận (accrual)</th>
                <th className="text-right p-3">Đã trả (cash)</th>
                <th className="text-right p-3">Còn nợ</th>
                <th className="text-left p-3">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              <ObligationRow
                label="🧑‍💼 Sale team NVKD"
                accrual={Number(costAccrual?.s ?? 0)}
                cash={saleTeamCash}
                note="HH sale + KPI + bonus (7 NVKD). Cash từ sao kê partner_name."
                highlight
              />
              <ObligationRow
                label="🏛️ Thuế (GTGT/TNDN/TNCN)"
                accrual={Number(taxAccrual.s ?? 0)}
                cash={Number(taxCash.s ?? 0)}
                note="NKC accrual TK 3334/3335/33311 − đã nộp KBNN"
                highlight
              />
              <ObligationRow
                label="🏥 BHXH cty đóng"
                accrual={Number(bhxhAccrual.s ?? 0)}
                cash={Number(bhxhCash.s ?? 0)}
                note="NKC 3383/3384/3386 − đã nộp BHXH Bình Thạnh"
                highlight
              />
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                <td className="p-3">TỔNG NỢ SẮP TRẢ</td>
                <td className="p-3 text-right tabular-nums">
                  {fmt(Number(costAccrual?.s ?? 0) + Number(taxAccrual.s ?? 0) + Number(bhxhAccrual.s ?? 0))}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {fmt(saleTeamCash + Number(taxCash.s ?? 0) + Number(bhxhCash.s ?? 0))}
                </td>
                <td className="p-3 text-right tabular-nums text-red-700">{fmt(totalOwed)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Net position */}
      <div className={`p-4 rounded-xl border-2 ${
        receivable > totalOwed
          ? "bg-green-50 border-green-300"
          : "bg-amber-50 border-amber-300"
      }`}>
        <div className="text-sm font-semibold">
          Vị thế ròng: {receivable > totalOwed ? "✅ Tài sản > Nợ" : "⚠️ Nợ > Tài sản sắp về"}
        </div>
        <div className="text-2xl font-bold tabular-nums mt-1">
          {fmt(receivable - totalOwed)}
        </div>
        <div className="text-xs text-slate-600 mt-1">
          = Còn thu ({fmt(receivable)}) − Tổng nợ ({fmt(totalOwed)})
        </div>
      </div>
    </div>
  );
}

function ObligationRow({
  label, accrual, cash, note, highlight,
}: {
  label: string; accrual: number; cash: number; note: string; highlight?: boolean;
}) {
  const owed = Math.max(0, accrual - cash);
  return (
    <tr className="border-t border-slate-100">
      <td className="p-3 font-medium">{label}</td>
      <td className="p-3 text-right tabular-nums">{fmt(accrual)}</td>
      <td className="p-3 text-right tabular-nums text-green-700">{fmt(cash)}</td>
      <td className={`p-3 text-right tabular-nums font-semibold ${highlight && owed > 0 ? "text-red-700" : "text-slate-700"}`}>
        {fmt(owed)}
      </td>
      <td className="p-3 text-xs text-slate-500">{note}</td>
    </tr>
  );
}
