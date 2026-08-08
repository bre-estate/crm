import { db } from "@/lib/db";
import { costReconciliations, revenueReconciliations, accountingJournal } from "@/lib/schema";
import { sql, and, eq, ne, gte, lte } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const pct = (n: number, denom: number) => denom > 0 ? `${((n / denom) * 100).toFixed(2)}%` : "—";

type SP = Promise<{ year?: string; period?: string; q?: string; month?: string }>;

// Đây là période filter (start / end date)
function periodDates(year: number, period: string, q?: number, month?: number): { start: string; end: string; label: string } {
  if (period === "month" && month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(year, month, 0).toISOString().slice(0, 10);
    return { start, end, label: `T${month}/${year}` };
  }
  if (period === "quarter" && q) {
    const startMonth = (q - 1) * 3 + 1;
    const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const end = new Date(year, startMonth + 2, 0).toISOString().slice(0, 10);
    return { start, end, label: `Q${q}/${year}` };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Năm ${year}` };
}

export default async function ProfitDetailPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sp = await searchParams;

  const year = Number(sp.year) || 2025;
  const period = sp.period ?? "year";
  const q = sp.q ? Number(sp.q) : undefined;
  const month = sp.month ? Number(sp.month) : undefined;
  const { start, end, label } = periodDates(year, period, q, month);

  // ═══════════════════════════════════════════════════════
  // 1. DOANH THU — từ revenue_reconciliations (BCDT)
  // ═══════════════════════════════════════════════════════
  const revRes = await db
    .select({
      total: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8`,
      rev: sql<number>`coalesce(sum(${revenueReconciliations.revenueThisTime}), 0)::float8`,
      bonusSale: sql<number>`coalesce(sum(${revenueReconciliations.cdtBonusSale}), 0)::float8`,
      bonusMgr: sql<number>`coalesce(sum(${revenueReconciliations.cdtBonusManager}), 0)::float8`,
    })
    .from(revenueReconciliations)
    .where(and(
      gte(revenueReconciliations.reconciliationDate, start),
      lte(revenueReconciliations.reconciliationDate, end),
    ));
  const r = revRes[0];
  const dtGross = Number(r.total); // Tổng phải thu (gồm VAT + bonus CĐT)
  const dtNet = dtGross / 1.1; // Doanh thu không VAT
  const bonusSaleGross = Number(r.bonusSale);
  const bonusMgrGross = Number(r.bonusMgr);
  const dtNetNoBonus = dtNet - bonusSaleGross / 1.1 - bonusMgrGross / 1.1;

  // ═══════════════════════════════════════════════════════
  // 2. GIÁ VỐN TRỰC TIẾP — từ cost_reconciliations per cost_type
  // ═══════════════════════════════════════════════════════
  const costRes = await db
    .select({
      costType: costReconciliations.costType,
      sum: sql<number>`coalesce(sum(${costReconciliations.amountPayableThisTime}), 0)::float8`,
    })
    .from(costReconciliations)
    .where(and(
      gte(costReconciliations.reconciliationDate, start),
      lte(costReconciliations.reconciliationDate, end),
    ))
    .groupBy(costReconciliations.costType);

  const costByType = new Map<string, number>();
  for (const c of costRes) costByType.set(c.costType, Number(c.sum));

  const hh = costByType.get("sale_commission") ?? 0;
  const support = costByType.get("customer_support") ?? 0;
  const cdtBonusNvkd = (costByType.get("cdt_bonus_sale") ?? 0) / 1.1;
  const cdtBonusQlSan = (costByType.get("cdt_bonus_manager") ?? 0) / 1.1;
  const ctyBonusQlSan = costByType.get("bonus_sale") ?? 0;
  const kpiTpkd = costByType.get("kpi_tpkd") ?? 0;
  const kpiAdmin = costByType.get("kpi_admin") ?? 0;
  const kpiCeo = costByType.get("kpi_ceo") ?? 0;
  const bonusMgrCty = costByType.get("bonus_manager") ?? 0;

  const totalCogs = hh + support + cdtBonusNvkd + cdtBonusQlSan + ctyBonusQlSan + kpiTpkd + kpiAdmin + kpiCeo + bonusMgrCty;
  const laiGop = dtNet - totalCogs;

  // ═══════════════════════════════════════════════════════
  // 4. CHI PHÍ CỐ ĐỊNH — từ Kim NKC
  // ═══════════════════════════════════════════════════════
  const nkc = await db
    .select({
      tk: accountingJournal.debitAccount,
      sum: sql<number>`coalesce(sum(${accountingJournal.amount}), 0)::float8`,
    })
    .from(accountingJournal)
    .where(and(
      gte(accountingJournal.entryDate, start),
      lte(accountingJournal.entryDate, end),
      ne(accountingJournal.creditAccount, "911"),
    ))
    .groupBy(accountingJournal.debitAccount);

  const nkcByTk = new Map<string, number>();
  for (const x of nkc) nkcByTk.set(x.tk, Number(x.sum));

  const luongNvkd = nkcByTk.get("6411") ?? 0;
  const luongQlAdmin = nkcByTk.get("6421") ?? 0;
  const thueVpDichVu = nkcByTk.get("6427") ?? 0;
  const doDungVp = nkcByTk.get("6423") ?? 0;
  const thuePhi = nkcByTk.get("6425") ?? 0;
  const cpKhac = nkcByTk.get("811") ?? 0;
  const cpTaiChinh = nkcByTk.get("635") ?? 0;
  const cpQlChungKhac = thueVpDichVu + doDungVp + thuePhi + cpKhac + cpTaiChinh;

  // Marketing = 6417 rows có description quảng cáo/marketing/thiết bị content/tiếp khách.
  // Kim tính rộng: quảng cáo + phí dịch vụ QC + BDS.com.vn + thiết bị content
  // (DJI/máy ảnh) + in tờ rơi + tiếp khách khách hàng.
  const [mkt] = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::float8 as s
    FROM accounting_journal
    WHERE debit_account = '6417'
      AND credit_account != '911'
      AND entry_date >= ${start}
      AND entry_date <= ${end}
      AND (
        description ILIKE '%quảng cáo%'
        OR description ILIKE '%quang cao%'
        OR description ILIKE '%marketing%'
        OR description ILIKE '%batdongsan%'
        OR description ILIKE '%sự kiện%'
        OR description ILIKE '%su kien%'
        OR description ILIKE '%PR %'
        OR description ILIKE '%DJI%'
        OR description ILIKE '%máy ảnh%'
        OR description ILIKE '%may anh%'
        OR description ILIKE '%tay cầm chống rung%'
        OR description ILIKE '%in tờ rơi%'
        OR description ILIKE '%in to roi%'
      )
  `) as any[];
  const marketing = Number(mkt?.s ?? 0);

  const totalFixed = luongNvkd + luongQlAdmin + marketing + cpQlChungKhac;

  const totalOpex = totalCogs + totalFixed;
  const laiThuan = dtNet - totalOpex;

  const tk8211 = nkcByTk.get("8211") ?? 0;
  const laiSauThue = laiThuan - tk8211;

  // Toggle links
  const years = [2024, 2025, 2026];
  const quarters = [1, 2, 3, 4];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const linkTo = (params: { year?: number; period?: string; q?: number; month?: number }) => {
    const p = new URLSearchParams();
    p.set("year", String(params.year ?? year));
    p.set("period", params.period ?? period);
    if (params.q !== undefined) p.set("q", String(params.q));
    if (params.month !== undefined) p.set("month", String(params.month));
    return `/reports/profit-detail?${p}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Báo cáo chi tiết lợi nhuận</h1>
        <p className="text-sm text-slate-500 mt-1">
          Format Kim BCTC — {label}. Doanh thu + giá vốn từ BCDT (per cost_type). Chi phí cố định từ Kim NKC.
        </p>
      </div>

      {/* Period selector */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 flex flex-wrap gap-3 items-center text-xs">
        <div>
          <span className="text-slate-500 mr-2">Năm:</span>
          {years.map((y) => (
            <Link key={y} href={linkTo({ year: y })} className={`inline-block px-2 py-1 rounded mr-1 ${y === year ? "bg-orange-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
              {y}
            </Link>
          ))}
        </div>
        <div>
          <span className="text-slate-500 mr-2">Kỳ:</span>
          <Link href={linkTo({ period: "year" })} className={`inline-block px-2 py-1 rounded mr-1 ${period === "year" ? "bg-blue-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
            Cả năm
          </Link>
          {quarters.map((qi) => (
            <Link key={qi} href={linkTo({ period: "quarter", q: qi })} className={`inline-block px-2 py-1 rounded mr-1 ${period === "quarter" && q === qi ? "bg-blue-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
              Q{qi}
            </Link>
          ))}
        </div>
        <div>
          <span className="text-slate-500 mr-2">Tháng:</span>
          {months.map((m) => (
            <Link key={m} href={linkTo({ period: "month", month: m })} className={`inline-block px-1.5 py-1 rounded mr-1 text-[10px] ${period === "month" && month === m ? "bg-green-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
              T{m}
            </Link>
          ))}
        </div>
      </div>

      {/* Report table */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white text-xs">
            <tr>
              <th className="text-left p-2 w-12">STT</th>
              <th className="text-left p-2">Khoản mục</th>
              <th className="text-right p-2 w-40">Số tiền</th>
              <th className="text-right p-2 w-24">Tỷ trọng</th>
            </tr>
          </thead>
          <tbody>
            {/* 1. Doanh thu */}
            <SectionRow stt="1" label="DOANH THU" />
            <ItemRow stt="1.1" label="Doanh thu (gồm VAT)" value={dtGross} />
            <ItemRow stt="1.2" label="Doanh thu (không VAT)" value={dtNet} highlight />
            <ItemRow stt="1.3" label="CĐT thưởng sale (gồm VAT)" value={bonusSaleGross} />
            <ItemRow stt="1.4" label="CĐT thưởng quản lý (gồm VAT)" value={bonusMgrGross} />
            <ItemRow stt="1.5" label="Doanh thu không gồm thưởng CĐT" value={dtNetNoBonus} />

            {/* 2. Giá vốn */}
            <SectionRow stt="2" label="CÁC KHOẢN GIÁ VỐN TRỰC TIẾP" value={totalCogs} pct={pct(totalCogs, dtNet)} />
            <ItemRow stt="2.1" label="Chi phí hoa hồng" value={hh} pctStr={pct(hh, dtNet)} indent />
            <ItemRow stt="2.2" label="Chi phí hỗ trợ khách mua BĐS" value={support} pctStr={pct(support, dtNet)} indent />
            <ItemRow stt="2.3" label="CĐT thưởng cho NVKD (không VAT)" value={cdtBonusNvkd} pctStr={pct(cdtBonusNvkd, dtNet)} indent />
            <ItemRow stt="2.4" label="CĐT thưởng quản lý sàn (không VAT)" value={cdtBonusQlSan} pctStr={pct(cdtBonusQlSan, dtNet)} indent />
            <ItemRow stt="2.5" label="Công ty thưởng quản lý sàn" value={ctyBonusQlSan} pctStr={pct(ctyBonusQlSan, dtNet)} indent />
            <ItemRow stt="2.6" label="Công ty thưởng trưởng phòng KD" value={kpiTpkd + bonusMgrCty} pctStr={pct(kpiTpkd + bonusMgrCty, dtNet)} indent />
            <ItemRow stt="2.7" label="Công ty thưởng Admin" value={kpiAdmin} pctStr={pct(kpiAdmin, dtNet)} indent />
            <ItemRow stt="2.8" label="Công ty thưởng CEO" value={kpiCeo} pctStr={pct(kpiCeo, dtNet)} indent />

            {/* 3. Lãi gộp */}
            <SectionRow stt="3" label="LÃI GỘP" value={laiGop} pct={pct(laiGop, dtNet)} color="green" />

            {/* 4. Chi phí cố định */}
            <SectionRow stt="4" label="CHI PHÍ CỐ ĐỊNH" value={totalFixed} pct={pct(totalFixed, dtNet)} />
            <ItemRow stt="4.1" label="Lương NVKD + BHXH cty" value={luongNvkd} pctStr={pct(luongNvkd, dtNet)} indent />
            <ItemRow stt="4.2" label="Thưởng doanh số + khác sale" value={0} pctStr="—" indent />
            <ItemRow stt="4.3" label="Lương QL + admin + kế toán + BHXH" value={luongQlAdmin} pctStr={pct(luongQlAdmin, dtNet)} indent />
            <ItemRow stt="4.4" label="Chi phí quảng cáo" value={marketing} pctStr={pct(marketing, dtNet)} indent />
            <ItemRow stt="4.5" label="Chi phí quản lý chung khác" value={cpQlChungKhac} pctStr={pct(cpQlChungKhac, dtNet)} indent />
            <ItemRow stt="" label="↳ Thuê VP + dịch vụ" value={thueVpDichVu} indent2 />
            <ItemRow stt="" label="↳ Đồ dùng VP" value={doDungVp} indent2 />
            <ItemRow stt="" label="↳ Thuế phí lệ phí" value={thuePhi} indent2 />
            <ItemRow stt="" label="↳ Chi phí khác" value={cpKhac} indent2 />
            <ItemRow stt="" label="↳ Chi phí tài chính" value={cpTaiChinh} indent2 />

            {/* 5. Tổng CP HĐ */}
            <SectionRow stt="5" label="TỔNG CHI PHÍ HOẠT ĐỘNG" value={totalOpex} pct={pct(totalOpex, dtNet)} />

            {/* 6. Lợi nhuận trước thuế */}
            <SectionRow stt="6" label="LỢI NHUẬN TRƯỚC THUẾ" value={laiThuan} pct={pct(laiThuan, dtNet)} color={laiThuan >= 0 ? "green" : "red"} />

            {/* 6.1 Thuế TNDN */}
            {tk8211 > 0 && (
              <>
                <ItemRow stt="6.1" label="Thuế TNDN (8211)" value={tk8211} pctStr={pct(tk8211, dtNet)} indent />
                <SectionRow stt="7" label="LỢI NHUẬN SAU THUẾ" value={laiSauThue} pct={pct(laiSauThue, dtNet)} color={laiSauThue >= 0 ? "green" : "red"} />
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 italic">
        Ghi chú: Marketing (4.4) hiện chưa parse được từ Kim NKC 6417 (cần split description). Mục 4.2 và một số dòng phụ thuộc kế toán nội bộ nhập chi tiết hơn.
      </div>
    </div>
  );
}

function SectionRow({ stt, label, value, pct: pctStr, color }: { stt: string; label: string; value?: number; pct?: string; color?: "green" | "red" }) {
  const cls = color === "green" ? "text-green-700" : color === "red" ? "text-red-700" : "text-slate-800";
  return (
    <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
      <td className="p-2 font-mono">{stt}</td>
      <td className={`p-2 ${cls}`}>{label}</td>
      <td className={`p-2 text-right tabular-nums ${cls}`}>{value !== undefined ? fmt(value) : ""}</td>
      <td className={`p-2 text-right ${cls}`}>{pctStr ?? ""}</td>
    </tr>
  );
}

function ItemRow({ stt, label, value, pctStr, indent, indent2, highlight }: { stt: string; label: string; value: number; pctStr?: string; indent?: boolean; indent2?: boolean; highlight?: boolean }) {
  const padCls = indent2 ? "pl-10" : indent ? "pl-6" : "";
  return (
    <tr className={`border-t border-slate-100 ${highlight ? "bg-blue-50/50" : ""}`}>
      <td className="p-2 font-mono text-xs text-slate-500">{stt}</td>
      <td className={`p-2 ${padCls} ${highlight ? "font-semibold" : ""}`}>{label}</td>
      <td className={`p-2 text-right tabular-nums ${highlight ? "font-semibold" : ""}`}>{fmt(value)}</td>
      <td className="p-2 text-right text-xs text-slate-500">{pctStr ?? ""}</td>
    </tr>
  );
}
