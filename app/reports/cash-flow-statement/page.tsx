import { db } from "@/lib/db";
import { financialTransactions, paymentsIn, paymentsOut, revenueReconciliations, costReconciliations } from "@/lib/schema";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { sql, inArray, eq, gte, lte, and } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const OPEX_CATEGORIES = ["6421", "6427-rent", "6427-svc", "6417", "6428", "6425", "635"];

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

type SearchParams = Promise<{ year?: string }>;

/**
 * LCTT (Cash Flow Statement) — direct method, simplified.
 *
 * 3 dòng tiền:
 *   I.  HĐ kinh doanh (operating): thu từ khách, trả NCC/NLĐ, chi OPEX, nộp thuế
 *   II. HĐ đầu tư (investing): mua TSCĐ, ký quỹ dài hạn
 *   III. HĐ tài chính (financing): vốn góp founder, hoàn booking, tạm ứng
 *
 * Filter theo năm (tab).
 */
export default async function CashFlowStatementPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  const sp = await searchParams;
  const nowYear = new Date().getFullYear().toString();

  // Xác định năm có data
  const yearsRow = await db
    .select({ y: sql<string>`substring(transaction_month, 1, 4)` })
    .from(financialTransactions)
    .groupBy(sql`substring(transaction_month, 1, 4)`);
  const yearsSet = new Set(yearsRow.map((r) => r.y));
  const yearList = [...yearsSet].sort().reverse();
  const selectedYear = sp.year && yearsSet.has(sp.year) ? sp.year : yearsSet.has(nowYear) ? nowYear : yearList[0] ?? nowYear;

  const yearStart = `${selectedYear}-01-01`;
  const yearEnd = `${selectedYear}-12-31`;
  const yearMonthPrefix = `${selectedYear}-`;

  // ===== I. HĐ KINH DOANH =====

  // Thu từ khách (paymentsIn trong năm)
  const [thuKhach] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(paymentsIn)
    .where(and(gte(paymentsIn.paymentDate, yearStart), lte(paymentsIn.paymentDate, yearEnd)));

  // Trả NCC/NLĐ (paymentsOut trong năm — thực chi cho HH sale/thù lao)
  const [traNCC] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(paymentsOut)
    .where(and(gte(paymentsOut.paymentDate, yearStart), lte(paymentsOut.paymentDate, yearEnd)));

  // Chi OPEX trong năm (financial_transactions nhóm 1-8 trong tháng năm này)
  const opexRows = await db
    .select({
      code: financialTransactions.categoryCode,
      s: sql<number>`sum(amount)::float8`,
    })
    .from(financialTransactions)
    .where(
      and(
        inArray(financialTransactions.categoryCode, OPEX_CATEGORIES),
        sql`transaction_month LIKE ${yearMonthPrefix + "%"}`,
      ),
    )
    .groupBy(financialTransactions.categoryCode);
  const chiOpex = opexRows.reduce((s, r) => s + Number(r.s), 0);

  // Nộp thuế pass-through (nhóm 7b, code 3331-3334)
  const [thue] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "3331-3334"),
        sql`transaction_month LIKE ${yearMonthPrefix + "%"}`,
      ),
    );

  const netOperating =
    Number(thuKhach.s) - Number(traNCC.s) - chiOpex - Number(thue.s);

  // ===== II. HĐ ĐẦU TƯ =====

  // Mua TSCĐ (nhóm 5)
  const [tscd] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "153-211"),
        sql`transaction_month LIKE ${yearMonthPrefix + "%"}`,
      ),
    );

  // Ký quỹ dài hạn (nhóm 11, code 244)
  const [kyquy] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "244"),
        sql`transaction_month LIKE ${yearMonthPrefix + "%"}`,
      ),
    );

  const netInvesting = -(Number(tscd.s) + Number(kyquy.s));

  // ===== III. HĐ TÀI CHÍNH =====

  // Vốn góp founder (nhóm 11, code 411)
  const [vonGop] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "411"),
        sql`transaction_month LIKE ${yearMonthPrefix + "%"}`,
      ),
    );

  // Hoàn booking YCTV (nhóm 13, code 3411) — cty chi ra để trả nội bộ
  const [hoanYctv] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "3411"),
        sql`transaction_month LIKE ${yearMonthPrefix + "%"}`,
      ),
    );

  // Cấp tạm ứng (nhóm 15, code 141) — cty chi ra
  const [capTU] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "141"),
        sql`transaction_month LIKE ${yearMonthPrefix + "%"}`,
      ),
    );

  // Cọc hộ khách (nhóm 14, code 131) — cty chi ra
  const [cocHo] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "131"),
        sql`transaction_month LIKE ${yearMonthPrefix + "%"}`,
      ),
    );

  const netFinancing =
    Number(vonGop.s) - Number(hoanYctv.s) - Number(capTU.s) - Number(cocHo.s);

  const netCashFlow = netOperating + netInvesting + netFinancing;

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">
            ← Báo cáo
          </Link>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <h1 className="text-2xl font-bold">Báo cáo lưu chuyển tiền tệ</h1>
          <YearTabs years={yearList} selected={selectedYear} />
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Năm {selectedYear} · Phương pháp trực tiếp · 3 dòng tiền: hoạt động kinh doanh, đầu tư, tài chính.
        </p>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="I. Từ HĐ Kinh doanh" value={fmt(Math.round(netOperating))} highlight={netOperating >= 0} bad={netOperating < 0} />
        <StatCard label="II. Từ HĐ Đầu tư" value={fmt(Math.round(netInvesting))} bad={netInvesting < 0} highlight={netInvesting >= 0} />
        <StatCard label="III. Từ HĐ Tài chính" value={fmt(Math.round(netFinancing))} highlight={netFinancing >= 0} bad={netFinancing < 0} />
        <StatCard
          label="LƯU CHUYỂN THUẦN"
          value={fmt(Math.round(netCashFlow))}
          highlight={netCashFlow >= 0}
          bad={netCashFlow < 0}
          emphasis
        />
      </div>

      {/* Chi tiết */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="text-left p-2">Chỉ tiêu</th>
              <th className="text-right p-2 w-40">Số tiền (VND)</th>
            </tr>
          </thead>
          <tbody>
            {/* I */}
            <tr className="bg-blue-50 font-semibold">
              <td className="p-2">I. Lưu chuyển tiền từ HĐ Kinh doanh</td>
              <td></td>
            </tr>
            <Row label="(+) Tiền thu từ bán hàng/khách" value={Number(thuKhach.s)} />
            <Row label="(−) Tiền trả cho NCC + NLĐ (từ recon)" value={-Number(traNCC.s)} negative />
            <Row label="(−) Tiền chi phí quản lý (OPEX)" value={-chiOpex} negative />
            <Row label="(−) Tiền nộp thuế (VAT/TNDN/TNCN)" value={-Number(thue.s)} negative />
            <tr className="bg-blue-50 font-semibold border-t border-blue-200">
              <td className="p-2">Cộng I</td>
              <td className={`p-2 text-right tabular-nums ${netOperating >= 0 ? "text-green-700" : "text-red-700"}`}>
                {fmt(Math.round(netOperating))}
              </td>
            </tr>

            {/* II */}
            <tr className="bg-purple-50 font-semibold border-t-2 border-slate-200">
              <td className="p-2">II. Lưu chuyển tiền từ HĐ Đầu tư</td>
              <td></td>
            </tr>
            <Row label="(−) Tiền mua TSCĐ/CCDC (thiết bị)" value={-Number(tscd.s)} negative />
            <Row label="(−) Tiền ký quỹ dài hạn (dự án A&T, ...)" value={-Number(kyquy.s)} negative />
            <tr className="bg-purple-50 font-semibold border-t border-purple-200">
              <td className="p-2">Cộng II</td>
              <td className={`p-2 text-right tabular-nums ${netInvesting >= 0 ? "text-green-700" : "text-red-700"}`}>
                {fmt(Math.round(netInvesting))}
              </td>
            </tr>

            {/* III */}
            <tr className="bg-amber-50 font-semibold border-t-2 border-slate-200">
              <td className="p-2">III. Lưu chuyển tiền từ HĐ Tài chính</td>
              <td></td>
            </tr>
            <Row label="(+) Founder góp vốn (nộp TK cty)" value={Number(vonGop.s)} />
            <Row label="(−) Hoàn tiền booking YCTV (trả nội bộ)" value={-Number(hoanYctv.s)} negative />
            <Row label="(−) Cấp tạm ứng cho HR/Admin" value={-Number(capTU.s)} negative />
            <Row label="(−) Đặt cọc hộ khách" value={-Number(cocHo.s)} negative />
            <tr className="bg-amber-50 font-semibold border-t border-amber-200">
              <td className="p-2">Cộng III</td>
              <td className={`p-2 text-right tabular-nums ${netFinancing >= 0 ? "text-green-700" : "text-red-700"}`}>
                {fmt(Math.round(netFinancing))}
              </td>
            </tr>

            {/* Total */}
            <tr className="bg-slate-100 font-bold text-base border-t-4 border-slate-300">
              <td className="p-3">LƯU CHUYỂN TIỀN THUẦN TRONG NĂM</td>
              <td className={`p-3 text-right tabular-nums ${netCashFlow >= 0 ? "text-green-700" : "text-red-700"}`}>
                {fmt(Math.round(netCashFlow))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
        <p className="font-semibold">Ghi chú:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <b>"Trả NCC + NLĐ"</b> lấy từ paymentsOut CRM (thực chi cho HH sale/thù lao) — chưa
            include trả NCC ngoài trong tương lai.
          </li>
          <li>
            <b>"Thu từ khách"</b> lấy từ paymentsIn CRM (thực nhận từ CĐT).
          </li>
          <li>
            Chưa track: lãi ngân hàng, vay ngoài, tăng vốn điều lệ (những mục này sẽ có khi
            triển khai sổ nhật ký chung ở Phase 4).
          </li>
        </ul>
      </div>
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="p-2 pl-6 text-slate-700">{label}</td>
      <td className={`p-2 text-right tabular-nums ${negative ? "text-orange-700" : ""}`}>
        {value === 0 ? <span className="text-slate-300">—</span> : fmt(Math.round(value))}
      </td>
    </tr>
  );
}

function YearTabs({ years, selected }: { years: string[]; selected: string }) {
  if (years.length <= 1) return null;
  return (
    <div className="flex gap-1">
      {years.map((y) => {
        const active = y === selected;
        return (
          <Link
            key={y}
            href={`/reports/cash-flow-statement?year=${y}`}
            className={
              active
                ? "px-3 py-1 rounded text-xs font-semibold bg-orange-500 text-white"
                : "px-3 py-1 rounded text-xs bg-slate-100 text-slate-700 hover:bg-slate-200"
            }
          >
            {y}
          </Link>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  bad,
  emphasis,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  bad?: boolean;
  emphasis?: boolean;
}) {
  const border = emphasis
    ? "border-2 border-slate-400"
    : bad
      ? "border-red-300"
      : highlight
        ? "border-green-300"
        : "border-slate-200";
  const color = bad ? "text-red-700" : highlight ? "text-green-700" : "";
  return (
    <div className={`bg-white border ${border} rounded-xl p-4`}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${color}`}>{value}</div>
    </div>
  );
}
