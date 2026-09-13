/**
 * Báo cáo lãi/lỗ quản trị. Hai cách nhìn:
 *  - Dòng tiền (mặc định): tiền thật vào/ra bank + két. Năm có sổ NKC lấy chân tiền sổ, chưa có sổ lấy sao kê + tiền mặt founder.
 *  - Dồn tích: theo format báo cáo kế toán, có cột đối chiếu với số kế toán khi kỳ có tham chiếu.
 * Bố cục kể chuyện (chốt 13/09/2026): 3 con số đầu trang, khối Đọc nhanh luôn mở, các bảng gập lại.
 */
import { requirePermission } from "@/lib/auth";
import Link from "next/link";
import type { ReactNode } from "react";
import { loadManagementPnl, findReference, comparePnl, type PnlLine, type PnlComparisonRow, type AccrualMonth } from "@/lib/management-pnl";
import { loadCashPnl, computeRatios, monthsWithData, type BankBalance, type CashLine, type CashMonth, type Ratios } from "@/lib/cash-pnl";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtM = (n: number) => `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}`;
const fmtD = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const fmtDelta = (n: number) => (n === 0 ? "0" : (n > 0 ? "+" : "−") + Math.abs(Math.round(n)).toLocaleString("vi-VN"));
const fmtDeltaM = (n: number) => (Math.round(n / 1e5) === 0 ? "0" : (n > 0 ? "+" : "−") + fmtM(Math.abs(n)) + "tr");
const pct = (n: number, denom: number) => (denom > 0 ? `${((n / denom) * 100).toFixed(1)}%` : "");
const pctR = (r: number | null) => (r == null ? "" : `${(r * 100).toFixed(1)}%`);

type SP = Promise<{ year?: string; period?: string; q?: string; month?: string; basis?: string }>;

function periodDates(year: number, period: string, q?: number, month?: number): { start: string; end: string; label: string; months: number } {
  if (period === "month" && month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start, end, label: `T${month}/${year}`, months: 1 };
  }
  if (period === "quarter" && q) {
    const startMonth = (q - 1) * 3 + 1;
    const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, startMonth + 2, 0)).toISOString().slice(0, 10);
    return { start, end, label: `Q${q}/${year}`, months: 3 };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Năm ${year}`, months: 12 };
}

export default async function ProfitDetailPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("reports.profit-detail");
  const sp = await searchParams;

  const year = Number(sp.year) || 2025;
  const period = sp.period ?? "year";
  const q = sp.q ? Number(sp.q) : undefined;
  const month = sp.month ? Number(sp.month) : undefined;
  const basis = sp.basis === "accrual" ? "accrual" : "cash";
  const { start, end, label, months } = periodDates(year, period, q, month);

  const years = [2024, 2025, 2026];
  const quarters = [1, 2, 3, 4];
  const monthList = Array.from({ length: 12 }, (_, i) => i + 1);
  const linkTo = (params: { year?: number; period?: string; q?: number; month?: number; basis?: string }) => {
    const p = new URLSearchParams();
    p.set("year", String(params.year ?? year));
    p.set("period", params.period ?? period);
    if (params.q !== undefined) p.set("q", String(params.q));
    if (params.month !== undefined) p.set("month", String(params.month));
    p.set("basis", params.basis ?? basis);
    return `/reports/profit-detail?${p}`;
  };
  const pill = (active: boolean, activeCls = "bg-slate-800 text-white") => `inline-block px-2 py-1 rounded ${active ? activeCls : "bg-slate-100 hover:bg-slate-200"}`;

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Lãi/lỗ và dòng tiền</h1>
        <p className="text-sm text-slate-500 mt-1">
          {label}. {basis === "cash"
            ? "Theo dòng tiền: chỉ tính tiền thật đã vào và đã ra khỏi bank và két tiền mặt."
            : "Theo dồn tích: doanh thu và chi phí ghi nhận theo kỳ phát sinh, đúng format báo cáo kế toán."}
        </p>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 flex flex-wrap gap-x-5 gap-y-2 items-center text-xs">
        <div className="flex gap-1 items-center">
          <Link href={linkTo({ basis: "cash" })} className={pill(basis === "cash")}>Dòng tiền</Link>
          <Link href={linkTo({ basis: "accrual" })} className={pill(basis === "accrual")}>Dồn tích</Link>
        </div>
        <div className="flex gap-1 items-center">
          {years.map((y) => <Link key={y} href={linkTo({ year: y })} className={pill(y === year, "bg-orange-500 text-white")}>{y}</Link>)}
        </div>
        <div className="flex gap-1 items-center">
          <Link href={linkTo({ period: "year" })} className={pill(period === "year", "bg-blue-500 text-white")}>Cả năm</Link>
          {quarters.map((qi) => <Link key={qi} href={linkTo({ period: "quarter", q: qi })} className={pill(period === "quarter" && q === qi, "bg-blue-500 text-white")}>Q{qi}</Link>)}
        </div>
        <details className="relative">
          <summary className={`cursor-pointer list-none ${pill(period === "month", "bg-green-600 text-white")}`}>{period === "month" ? `Tháng ${month}` : "Chọn tháng"}</summary>
          <div className="absolute z-10 mt-1 bg-card rounded-lg ring-1 ring-foreground/10 shadow p-2 grid grid-cols-6 gap-1 w-56">
            {monthList.map((m) => <Link key={m} href={linkTo({ period: "month", month: m })} className={`text-center ${pill(period === "month" && month === m, "bg-green-600 text-white")}`}>T{m}</Link>)}
          </div>
        </details>
      </div>

      {basis === "cash" ? <CashView start={start} end={end} months={months} /> : <AccrualView start={start} end={end} months={months} />}
    </div>
  );
}

// ───────────────────────── Khối dùng chung ─────────────────────────

function Headline({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : "";
  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${cls}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1 leading-snug">{sub}</div>}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : "";
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/** Khối gập được. Tiêu đề kèm một dòng tóm tắt để chưa mở cũng biết bên trong nói gì. */
function Fold({ title, teaser, open, children }: { title: string; teaser?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group bg-card rounded-xl ring-1 ring-foreground/10">
      <summary className="cursor-pointer list-none select-none flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3 text-sm">
        <span className="font-semibold"><span className="inline-block w-4 text-slate-400 transition-transform group-open:rotate-90">▸</span>{title}</span>
        {teaser && <span className="text-xs text-slate-500">{teaser}</span>}
      </summary>
      <div className="px-3 pb-3 space-y-3">{children}</div>
    </details>
  );
}

function RatioCards({ r, thuLabel, thu, gop, coDinh, rong, rongLabel }: { r: Ratios; thuLabel: string; thu: number; gop: number; coDinh: number; rong: number; rongLabel: string }) {
  const hoaVonOk = r.hoaVonThuThang != null && r.thuBinhQuanThang >= r.hoaVonThuThang;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
      <Stat label={thuLabel} value={fmt(thu)} sub={r.soThang > 1 ? `bình quân ${fmtM(r.thuBinhQuanThang)}tr/tháng` : undefined} />
      <Stat label="Chênh gộp" value={fmt(gop)} sub={`biên gộp ${pctR(r.bienGop)}`} tone={gop >= 0 ? "good" : "bad"} />
      <Stat label="Chi cố định" value={fmt(coDinh)} sub={r.soThang > 1 ? `bình quân ${fmtM(r.chiCoDinhBinhQuanThang)}tr/tháng` : undefined} />
      <Stat label={rongLabel} value={fmt(rong)} sub={`biên ${pctR(r.bienHoatDong)}`} tone={rong >= 0 ? "good" : "bad"} />
      <Stat
        label="Hòa vốn: thu cần mỗi tháng"
        value={r.hoaVonThuThang == null ? "chưa tính được" : fmt(r.hoaVonThuThang)}
        sub={r.hoaVonThuThang == null ? "chưa có biên gộp dương" : `= chi cố định ÷ biên gộp. Thực tế ${fmtM(r.thuBinhQuanThang)}tr/tháng${r.canCanMoiThang != null ? `. Khoảng ${r.canCanMoiThang} căn/tháng, thực tế ${r.canBinhQuanThang} căn, bình quân ${fmtM(r.thuMoiCan!)}tr/căn` : ""}`}
        tone={r.hoaVonThuThang == null ? undefined : hoaVonOk ? "good" : "bad"}
      />
      <Stat label="Biên an toàn" value={pctR(r.anToan)} sub="phần thu vượt điểm hòa vốn" tone={r.anToan == null ? undefined : r.anToan >= 0 ? "good" : "bad"} />
    </div>
  );
}

// ───────────────────────── Dòng tiền ─────────────────────────

async function CashView({ start, end, months }: { start: string; end: string; months: number }) {
  const { pnl: r, monthly, units, source, dataThrough, bankBalance: bb } = await loadCashPnl({ start, end });
  const t = r.totals;
  const b = r.byLine;
  const dBank = t.bankIn - t.bankOut;
  const dCash = t.cashIn - t.cashOut;
  const khop = Math.abs(dBank + dCash - t.thayDoiTien) < 1000;
  const soThang = Math.min(months, monthsWithData({ start, end }, dataThrough));
  const ratios = computeRatios(t.thu, t.chenhGop, t.chiCoDinh, t.hoatDongRong, soThang, units);
  const partial = dataThrough != null && dataThrough < end;
  const giuHo = b.giu_cho + b.hoan_khach; // còn giữ hộ khách: nhận trừ đã hoàn
  const tienCuoi = bb ? bb.close + bb.tietKiemRong : null;
  const dTien = bb && tienCuoi != null ? tienCuoi - bb.open : t.thayDoiTien;
  const amMonths = monthly.filter((m) => m.hoatDongRong < 0 && (!dataThrough || m.period.start <= dataThrough));
  const khongThu = amMonths.filter((m) => m.thu < 10_000_000 && (m.chiGiaVon > 0 || m.chiCoDinh > 0));
  const bbLech = bb ? Math.round(dBank - (bb.close - bb.open)) : 0;

  if (!r.available) {
    return <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">Kỳ này chưa có dữ liệu tiền: không có sổ nhật ký chung, cũng chưa có sao kê.</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Headline label="Tiền thu hoạt động" value={fmt(t.thu)} sub={soThang > 1 ? `${soThang} tháng, bình quân ${fmtM(ratios.thuBinhQuanThang)}tr/tháng` : undefined} />
        <Headline label="Dòng tiền hoạt động ròng" value={fmt(t.hoatDongRong)} tone={t.hoatDongRong >= 0 ? "good" : "bad"} sub="thu trừ giá vốn, chi cố định và thuế đã nộp" />
        {bb && tienCuoi != null ? (
          <Headline label="Tiền công ty cuối kỳ" value={fmt(tienCuoi)} tone={dTien >= 0 ? "good" : "bad"} sub={<>đầu kỳ {fmtM(bb.open)}tr, <b>{fmtDeltaM(dTien)}</b>{bb.tietKiemRong > 0 ? <>. Gồm bank {fmtM(bb.close)}tr và tiết kiệm {fmtM(bb.tietKiemRong)}tr</> : null}</>} />
        ) : (
          <Headline label="Thay đổi tiền trong kỳ" value={fmtDelta(t.thayDoiTien)} tone={t.thayDoiTien >= 0 ? "good" : "bad"} sub="bank và két tiền mặt, gồm cả tiền giữ hộ khách" />
        )}
      </div>

      <div className="text-xs text-slate-500">
        {partial && <>Số liệu đến <b>{fmtD(dataThrough!)}</b>, tức {soThang} tháng. Bình quân và hòa vốn chia cho {soThang} tháng. </>}
        {source === "nkc"
          ? "Nguồn: từng lần tiền vào ra trên sổ nhật ký chung của kế toán."
          : "Nguồn: sao kê Techcombank phân loại theo luật và sổ chi tiền mặt founder, kỳ này chưa có sổ kế toán."}
        {r.unclassified.length > 0 && <> Còn <b>{r.unclassified.length}</b> khoản chưa phân loại, sửa tại <Link href="/finance/bank-review" className="underline">Sao kê bank</Link>.</>}
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 text-sm">
        <div className="font-semibold mb-2">Đọc nhanh</div>
        <ol className="list-decimal pl-5 space-y-1.5 text-slate-700">
          <li>Thu về <b>{fmtM(t.thu)}tr</b> từ CĐT và đối tác. Trả hoa hồng, hỗ trợ khách <b>{fmtM(t.chiGiaVon)}tr</b>, còn <b>{fmtM(t.chenhGop)}tr</b> ({pctR(t.thu > 0 ? t.chenhGop / t.thu : null)}).</li>
          <li>Chi cố định <b>{fmtM(t.chiCoDinh)}tr</b>: lương {fmtM(b.chi_luong)}tr, BHXH {fmtM(b.chi_bhxh)}tr, văn phòng {fmtM(b.chi_thue_vp)}tr, quảng cáo {fmtM(b.chi_marketing)}tr, còn lại {fmtM(t.chiCoDinh - b.chi_luong - b.chi_bhxh - b.chi_thue_vp - b.chi_marketing)}tr. Sau chi cố định còn <b className={t.hoatDongTruocThue >= 0 ? "text-green-700" : "text-red-700"}>{fmtM(t.hoatDongTruocThue)}tr</b>.</li>
          <li>
            Nộp thuế <b>{fmtM(t.thue)}tr</b>{t.thue > 0 && <>: GTGT {fmtM(b.thue_vat)}tr, TNDN {fmtM(b.thue_tndn)}tr, TNCN nộp hộ nhân viên {fmtM(b.thue_tncn)}tr{b.thue_kbnn ? <>, chưa rõ loại {fmtM(b.thue_kbnn)}tr</> : null}</>}.
            {" "}Còn lại <b className={t.hoatDongRong >= 0 ? "text-green-700" : "text-red-700"}>{fmtM(t.hoatDongRong)}tr</b>, là dòng tiền hoạt động ròng.
            {t.hoatDongRong < 0 && t.hoatDongTruocThue > 0 && <> Âm vì thuế nộp trong kỳ, gồm cả thuế của kỳ trước nộp năm nay, lớn hơn phần còn lại sau chi cố định.</>}
          </li>
          {(b.giu_cho !== 0 || b.hoan_khach !== 0) && (
            <li>Tiền giữ chỗ của khách đi qua tài khoản: nhận {fmtM(b.giu_cho)}tr, đã hoàn {fmtM(-b.hoan_khach)}tr, <b>đang giữ hộ {fmtM(giuHo)}tr</b>. Tiền này của khách, sẽ hoàn hoặc chuyển CĐT, không tính vào lãi lỗ.</li>
          )}
          {bb && tienCuoi != null ? (
            <li>
              Tiền công ty đầu kỳ <b>{fmtM(bb.open)}tr</b>, cuối kỳ <b>{fmtM(tienCuoi)}tr</b>{bb.tietKiemRong > 0 ? ` (bank ${fmtM(bb.close)}tr, tiết kiệm ${fmtM(bb.tietKiemRong)}tr)` : ""}, tức <b className={dTien >= 0 ? "text-green-700" : "text-red-700"}>{fmtDeltaM(dTien)}</b>.
              {giuHo !== 0 && <> Trừ phần giữ hộ khách thì tiền thật của công ty <b className={dTien - giuHo >= 0 ? "text-green-700" : "text-red-700"}>{fmtDeltaM(dTien - giuHo)}</b>.</>}
            </li>
          ) : (
            <li>Tiền trong bank và két thay đổi <b className={t.thayDoiTien >= 0 ? "text-green-700" : "text-red-700"}>{fmtDeltaM(t.thayDoiTien)}</b> trong kỳ{giuHo !== 0 ? <>, trong đó giữ hộ khách {fmtDeltaM(giuHo)}</> : null}.</li>
          )}
          {amMonths.length > 0 && soThang > 1 && (
            <li>Tháng âm: {amMonths.map((m) => m.label).join(", ")}.{khongThu.length > 0 && <> {khongThu.map((m) => m.label).join(", ")} không có CĐT chuyển phí nhưng vẫn trả hoa hồng và chi phí.</>} Sàn thu theo đợt CĐT trả, chi đều hàng tháng, nên nhìn cả kỳ mới đúng.</li>
          )}
        </ol>
      </div>

      {monthly.length > 1 && (
        <Fold title="Theo tháng" teaser={<>{soThang} tháng có số{amMonths.length > 0 ? `, âm ${amMonths.map((m) => m.label).join(", ")}` : ", không tháng nào âm"}</>}>
          <CashMonthlyTable rows={monthly} dataThrough={dataThrough} />
        </Fold>
      )}

      <Fold title="Chi tiết từng dòng" teaser="9 mục, từ tiền thu đến thay đổi tiền trong kỳ">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left p-2 w-12">STT</th>
                <th className="text-left p-2">Khoản mục</th>
                <th className="text-right p-2 w-40">Số tiền</th>
                <th className="text-right p-2 w-24">Tỷ trọng/thu</th>
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l) => <CashRow key={l.code} line={l} denom={t.thu} />)}
              <tr><td colSpan={4} className="p-1 bg-slate-50" /></tr>
              {r.memo.map((l) => <CashRow key={l.code} line={l} denom={0} />)}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Dòng lương chia khối kinh doanh và quản lý theo tỷ lệ sao kê từng người. Xem từng người tại <Link href="/finance/employee-pay" className="underline">Tiền trả nhân sự</Link>.</p>
          <p>Thuế TNCN là tiền khấu trừ của nhân viên nộp hộ, để riêng ở mục 6 để nhìn đúng tiền ra khỏi công ty.</p>
        </div>
      </Fold>

      <Fold title="Biên và điểm hòa vốn" teaser={<>biên gộp {pctR(ratios.bienGop)}{ratios.hoaVonThuThang != null ? `, cần thu ${fmtM(ratios.hoaVonThuThang)}tr/tháng để hòa vốn` : ""}</>}>
        <RatioCards r={ratios} thuLabel="Tiền thu hoạt động" thu={t.thu} gop={t.chenhGop} coDinh={t.chiCoDinh} rong={t.hoatDongRong} rongLabel="Dòng tiền hoạt động ròng" />
        <p className="text-xs text-slate-500">Hòa vốn chưa gồm thuế. Biên an toàn là phần thu thực tế vượt mức hòa vốn.</p>
      </Fold>

      <Fold
        title="Đối chiếu số dư"
        teaser={<span className={khop && Math.abs(bbLech) < 1000 ? "text-green-700" : "text-red-700"}>{khop ? "các dòng khớp dòng 9" : "các dòng lệch dòng 9"}{bb ? (Math.abs(bbLech) < 1000 ? ", sao kê đủ dòng" : `, sao kê thiếu ${fmtDelta(bbLech)}`) : ""}</span>}
      >
        <table className="text-sm">
          <tbody>
            <tr><td className="pr-6 py-0.5 text-slate-600">Bank: vào {fmt(t.bankIn)}, ra {fmt(t.bankOut)}</td><td className="text-right tabular-nums">{fmtDelta(dBank)}</td></tr>
            <tr><td className="pr-6 py-0.5 text-slate-600">Tiền mặt: vào {fmt(t.cashIn)}, ra {fmt(t.cashOut)}</td><td className="text-right tabular-nums">{fmtDelta(dCash)}</td></tr>
            <tr className="font-semibold"><td className="pr-6 py-0.5">Cộng, so với dòng 9</td><td className={`text-right tabular-nums ${khop ? "text-green-700" : "text-red-700"}`}>{fmtDelta(dBank + dCash)} {khop ? "khớp" : "lệch"}</td></tr>
          </tbody>
        </table>
        {bb && <BankBalanceCheck bb={bb} dBank={dBank} />}
        {r.unclassified.length > 0 && (
          <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 text-sm">{r.unclassified.length} khoản chưa phân loại, đang nằm ở dòng 8.8.</div>
        )}
      </Fold>
    </>
  );
}

/** Đối chiếu tổng dòng tiền bank trong báo cáo với số dư đầu và cuối trên sao kê. Lệch nghĩa là sao kê thiếu dòng. */
function BankBalanceCheck({ bb, dBank }: { bb: BankBalance; dBank: number }) {
  const dSaoKe = bb.close - bb.open;
  const lech = Math.round(dBank - dSaoKe);
  const khop = Math.abs(lech) < 1000;
  return (
    <div className="border-t pt-2 space-y-1 text-sm">
      <div className="font-semibold">Số dư trên sao kê</div>
      <table className="text-sm">
        <tbody>
          <tr><td className="pr-6 py-0.5 text-slate-600">Đầu kỳ, trước giao dịch đầu ngày {fmtD(bb.openDate)}</td><td className="text-right tabular-nums">{fmt(bb.open)}</td></tr>
          <tr><td className="pr-6 py-0.5 text-slate-600">Cuối kỳ, sau giao dịch cuối ngày {fmtD(bb.closeDate)}</td><td className="text-right tabular-nums">{fmt(bb.close)}</td></tr>
          <tr><td className="pr-6 py-0.5 text-slate-600">Thay đổi theo sao kê</td><td className="text-right tabular-nums">{fmtDelta(dSaoKe)}</td></tr>
          <tr><td className="pr-6 py-0.5 text-slate-600">Thay đổi theo các dòng đã nạp vào báo cáo</td><td className="text-right tabular-nums">{fmtDelta(dBank)}</td></tr>
          <tr className="font-semibold"><td className="pr-6 py-0.5">Chênh lệch</td><td className={`text-right tabular-nums ${khop ? "text-green-700" : "text-red-700"}`}>{khop ? "0, sao kê đủ dòng" : `${fmtDelta(lech)}, sao kê thiếu dòng`}</td></tr>
          {bb.tietKiemRong > 0 && (
            <tr><td className="pr-6 py-0.5 text-slate-600">Đang gửi tiết kiệm có kỳ hạn, chuyển từ bank, vẫn là tiền công ty</td><td className="text-right tabular-nums">{fmt(bb.tietKiemRong)}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CashMonthlyTable({ rows, dataThrough }: { rows: CashMonth[]; dataThrough: string | null }) {
  const sum = (k: keyof Omit<CashMonth, "label" | "period">) => rows.reduce((s, m) => s + m[k], 0);
  const hasData = (m: CashMonth) => !dataThrough || m.period.start <= dataThrough;
  const lines: { label: string; key: keyof Omit<CashMonth, "label" | "period">; bold?: boolean; tone?: boolean }[] = [
    { label: "Tiền thu hoạt động", key: "thu" },
    { label: "Chi giá vốn", key: "chiGiaVon" },
    { label: "Chênh gộp", key: "chenhGop", bold: true, tone: true },
    { label: "Chi cố định", key: "chiCoDinh" },
    { label: "Thuế đã nộp", key: "thue" },
    { label: "Hoạt động ròng", key: "hoatDongRong", bold: true, tone: true },
    { label: "Ngoài hoạt động", key: "ngoaiHoatDong" },
    { label: "Thay đổi tiền", key: "thayDoiTien", bold: true, tone: true },
  ];
  let luyKe = 0;
  const cum = rows.map((m) => (luyKe += m.hoatDongRong));
  return (
    <div className="overflow-x-auto">
      <div className="text-xs text-slate-500 mb-1">Đơn vị: triệu đồng</div>
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left p-2">Khoản mục</th>
            {rows.map((m) => <th key={m.label} className={`text-right p-2 ${hasData(m) ? "" : "text-slate-300"}`}>{m.label}</th>)}
            <th className="text-right p-2 font-semibold">Cộng</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className={`border-t border-slate-100 ${l.bold ? "font-semibold bg-slate-50" : ""}`}>
              <td className="p-2">{l.label}</td>
              {rows.map((m) => <td key={m.label} className={`p-2 text-right tabular-nums ${l.tone && m[l.key] < 0 ? "text-red-700" : ""}`}>{hasData(m) ? (m[l.key] ? fmtM(m[l.key]) : "0") : ""}</td>)}
              <td className={`p-2 text-right tabular-nums font-semibold ${l.tone && sum(l.key) < 0 ? "text-red-700" : ""}`}>{fmtM(sum(l.key))}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 text-slate-600 italic">
            <td className="p-2">Lũy kế hoạt động ròng</td>
            {rows.map((m, i) => <td key={m.label} className={`p-2 text-right tabular-nums ${cum[i] < 0 ? "text-red-700" : ""}`}>{hasData(m) ? fmtM(cum[i]) : ""}</td>)}
            <td className="p-2" />
          </tr>
          <tr className="border-t border-slate-200 text-slate-500">
            <td className="p-2">Biên gộp</td>
            {rows.map((m) => <td key={m.label} className="p-2 text-right tabular-nums">{!hasData(m) ? "" : m.thu >= 10_000_000 ? pct(m.chenhGop, m.thu) : <span className="text-slate-400" title="Tháng này CĐT không chuyển phí, chỉ có lãi tài khoản, không tính biên">không thu</span>}</td>)}
            <td className="p-2 text-right tabular-nums">{pct(sum("chenhGop"), sum("thu"))}</td>
          </tr>
        </tbody>
      </table>
      {dataThrough && dataThrough < rows[rows.length - 1].period.end && (
        <div className="pt-2 text-[11px] text-slate-500">Dữ liệu đến {fmtD(dataThrough)}. Tháng cuối chưa đủ, các tháng sau chưa có.</div>
      )}
    </div>
  );
}

function CashRow({ line, denom }: { line: CashLine; denom: number }) {
  const isSection = line.kind === "section";
  const isSub = line.kind === "sub";
  const keyLine = ["3", "5", "7", "9"].includes(line.code);
  const colorCls = keyLine ? (line.value >= 0 ? "text-green-700" : "text-red-700") : isSub ? "text-slate-600" : "";
  return (
    <tr className={isSection ? "border-t-2 border-slate-300 bg-slate-100 font-bold" : isSub ? "text-xs" : "border-t border-slate-100"}>
      <td className="p-2 font-mono text-xs text-slate-500">{line.code}</td>
      <td className={`p-2 ${isSection ? "" : isSub ? "pl-10" : "pl-6"} ${colorCls}`}>{line.label}{line.note && <span className="text-slate-400"> · {line.note}</span>}</td>
      <td className={`p-2 text-right tabular-nums ${colorCls}`}>{fmt(line.value)}</td>
      <td className="p-2 text-right text-xs text-slate-500">{denom > 0 && (!isSection || keyLine) ? pct(line.value, denom) : ""}</td>
    </tr>
  );
}

// ───────────────────────── Dồn tích ─────────────────────────

async function AccrualView({ start, end, months }: { start: string; end: string; months: number }) {
  const { pnl, monthly, dataThrough } = await loadManagementPnl({ start, end });
  const ref = findReference({ start, end });
  const cmp = ref ? comparePnl(pnl, ref) : null;
  const cmpByCode = new Map<string, PnlComparisonRow>(cmp?.map((c) => [c.code, c]) ?? []);
  const explained = cmp?.filter((c) => c.delta != null && Math.abs(c.delta) >= 1000 && c.note) ?? [];
  const unexplained = cmp?.filter((c) => c.delta != null && Math.abs(c.delta) >= 1000 && !c.note) ?? [];
  const denom = pnl.revenue.net;
  const soThang = Math.min(months, monthsWithData({ start, end }, dataThrough));
  const ratios = computeRatios(pnl.revenue.net, pnl.totals.grossProfit, pnl.totals.fixed, pnl.totals.profitBeforeTax, soThang, pnl.units);
  const partial = dataThrough != null && dataThrough < end;
  const lo = pnl.totals.profitBeforeTax;
  const amMonths = monthly.filter((m) => m.profitBeforeTax < 0 && (!dataThrough || m.period.start <= dataThrough));

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Headline label="Doanh thu không VAT" value={fmt(pnl.revenue.net)} sub={soThang > 1 ? `${soThang} tháng, bình quân ${fmtM(ratios.thuBinhQuanThang)}tr/tháng` : undefined} />
        <Headline label="Lãi gộp" value={fmt(pnl.totals.grossProfit)} tone={pnl.totals.grossProfit >= 0 ? "good" : "bad"} sub={`doanh thu trừ giá vốn, biên ${pctR(ratios.bienGop)}`} />
        <Headline label="Lợi nhuận trước thuế" value={fmt(lo)} tone={lo >= 0 ? "good" : "bad"} sub={pnl.opexSource === "none" ? "chưa có chi phí cố định, số này chưa đúng" : "lãi gộp trừ chi phí cố định"} />
      </div>

      <div className="text-xs text-slate-500">
        {partial && <>Số liệu đến <b>{fmtD(dataThrough!)}</b>, tức {soThang} tháng. Bình quân và hòa vốn chia cho {soThang} tháng. </>}
        {pnl.opexSource === "nkc" && "Doanh thu và giá vốn theo đối chiếu trong CRM, chi phí cố định theo sổ nhật ký chung của kế toán."}
        {pnl.opexSource === "bank" && "Doanh thu và giá vốn theo đối chiếu trong CRM. Chưa có sổ kế toán nên chi phí cố định tạm lấy theo tiền đã chi trên sao kê và sổ tiền mặt founder."}
        {pnl.opexSource === "none" && <span className="text-amber-800">Chưa có sổ kế toán và cũng chưa có sao kê nên chi phí cố định đang trống, lợi nhuận và hòa vốn chưa đúng.</span>}
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 text-sm">
        <div className="font-semibold mb-2">Đọc nhanh</div>
        <ol className="list-decimal pl-5 space-y-1.5 text-slate-700">
          <li>Doanh thu không VAT <b>{fmtM(pnl.revenue.net)}tr</b>. Giá vốn (hoa hồng, hỗ trợ khách, thưởng, gồm trích trước) <b>{fmtM(pnl.totals.cogs)}tr</b>, lãi gộp <b>{fmtM(pnl.totals.grossProfit)}tr</b> ({pctR(ratios.bienGop)}).</li>
          <li>Chi phí cố định <b>{fmtM(pnl.totals.fixed)}tr</b>. Lợi nhuận trước thuế <b className={lo >= 0 ? "text-green-700" : "text-red-700"}>{fmtM(lo)}tr</b>{soThang > 1 ? <>, bình quân {fmtM(lo / soThang)}tr/tháng</> : null}.</li>
          {ref && (
            <li>
              So với {ref.label}: {explained.length + unexplained.length === 0
                ? "khớp từng dòng."
                : <>{explained.length} dòng lệch đã rõ nguyên nhân{unexplained.length > 0 ? <>, <b className="text-amber-800">{unexplained.length} dòng chưa giải thích được</b></> : null}. Chi tiết ở khối Đối chiếu bên dưới.</>}
            </li>
          )}
          {amMonths.length > 0 && soThang > 1 && <li>Tháng lỗ: {amMonths.map((m) => m.label).join(", ")}. Doanh thu ghi nhận theo ngày đối chiếu từng đợt, còn chi phí đều hàng tháng.</li>}
        </ol>
      </div>

      {monthly.length > 1 && (
        <Fold title="Theo tháng" teaser={<>{soThang} tháng có số{amMonths.length > 0 ? `, lỗ ${amMonths.map((m) => m.label).join(", ")}` : ", không tháng nào lỗ"}</>}>
          <AccrualMonthlyTable rows={monthly} dataThrough={dataThrough} />
        </Fold>
      )}

      <Fold title="Chi tiết từng dòng" teaser={ref ? "có cột kế toán và cột lệch" : "doanh thu, giá vốn, chi phí cố định"}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left p-2 w-12">STT</th>
                <th className="text-left p-2">Khoản mục</th>
                <th className="text-right p-2 w-40">App</th>
                <th className="text-right p-2 w-20">Tỷ trọng/DT</th>
                {ref && <th className="text-right p-2 w-40">Kế toán</th>}
                {ref && <th className="text-right p-2 w-32">Lệch</th>}
              </tr>
            </thead>
            <tbody>
              {pnl.lines.map((l) => <Row key={l.code} line={l} denom={denom} cmp={cmpByCode.get(l.code)} withRef={!!ref} />)}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Doanh thu: đối chiếu doanh thu theo ngày đối chiếu, gồm VAT và thưởng nóng của CĐT.</p>
          <p>Giá vốn: đối chiếu giá vốn theo loại chi phí, cộng trích trước cuối năm của kế toán, trừ phần hoàn nhập khi kỳ sau chi thật cho căn đã trích.</p>
          <p>Chi phí cố định: sổ nhật ký chung đã phân loại, sửa phân loại tại <Link href="/finance/nkc-review" className="underline">Sổ NKC</Link>.</p>
        </div>
      </Fold>

      <Fold title="Biên và điểm hòa vốn" teaser={<>biên gộp {pctR(ratios.bienGop)}{ratios.hoaVonThuThang != null ? `, cần doanh thu ${fmtM(ratios.hoaVonThuThang)}tr/tháng để hòa vốn` : ""}</>}>
        <RatioCards r={ratios} thuLabel="Doanh thu không VAT" thu={pnl.revenue.net} gop={pnl.totals.grossProfit} coDinh={pnl.totals.fixed} rong={pnl.totals.profitBeforeTax} rongLabel="Lợi nhuận trước thuế" />
      </Fold>

      {ref && (
        <Fold title={`Đối chiếu với ${ref.label}`} teaser={<span className={unexplained.length > 0 ? "text-amber-800" : "text-green-700"}>{explained.length + unexplained.length === 0 ? "khớp từng dòng" : `${explained.length} lệch đã rõ, ${unexplained.length} chưa rõ`}</span>}>
          <p className="text-slate-600 text-sm">Cột Lệch = App trừ Kế toán. Dòng có ghi chú là lệch đã tìm ra nguyên nhân.</p>
          {explained.length > 0 && (
            <ul className="space-y-2 text-sm">
              {explained.map((c) => (
                <li key={c.code} className="flex gap-3">
                  <span className="font-mono text-xs text-slate-500 w-10 shrink-0 pt-0.5">{c.code}</span>
                  <span className="tabular-nums w-32 shrink-0 text-right">{fmtDelta(c.delta!)}</span>
                  <span className="text-slate-700">{c.note}</span>
                </li>
              ))}
            </ul>
          )}
          {unexplained.length > 0 && (
            <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 text-sm">Chưa có giải thích: {unexplained.map((c) => `${c.code} (${fmtDelta(c.delta!)})`).join(", ")}</div>
          )}
        </Fold>
      )}
    </>
  );
}

function AccrualMonthlyTable({ rows, dataThrough }: { rows: AccrualMonth[]; dataThrough: string | null }) {
  const sum = (k: "revenueNet" | "cogs" | "grossProfit" | "fixed" | "profitBeforeTax") => rows.reduce((s, m) => s + m[k], 0);
  const hasData = (m: AccrualMonth) => !dataThrough || m.period.start <= dataThrough;
  const lines: { label: string; key: "revenueNet" | "cogs" | "grossProfit" | "fixed" | "profitBeforeTax"; bold?: boolean; tone?: boolean }[] = [
    { label: "Doanh thu không VAT", key: "revenueNet" },
    { label: "Giá vốn", key: "cogs" },
    { label: "Lãi gộp", key: "grossProfit", bold: true, tone: true },
    { label: "Chi phí cố định", key: "fixed" },
    { label: "Lợi nhuận trước thuế", key: "profitBeforeTax", bold: true, tone: true },
  ];
  return (
    <div className="overflow-x-auto">
      <div className="text-xs text-slate-500 mb-1">Đơn vị: triệu đồng</div>
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left p-2">Khoản mục</th>
            {rows.map((m) => <th key={m.label} className={`text-right p-2 ${hasData(m) ? "" : "text-slate-300"}`}>{m.label}{hasData(m) && !m.opexAvailable && <span title="chưa có sổ NKC tháng này"> *</span>}</th>)}
            <th className="text-right p-2 font-semibold">Cộng</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className={`border-t border-slate-100 ${l.bold ? "font-semibold bg-slate-50" : ""}`}>
              <td className="p-2">{l.label}</td>
              {rows.map((m) => <td key={m.label} className={`p-2 text-right tabular-nums ${l.tone && m[l.key] < 0 ? "text-red-700" : ""}`}>{hasData(m) ? (m[l.key] ? fmtM(m[l.key]) : "0") : ""}</td>)}
              <td className={`p-2 text-right tabular-nums font-semibold ${l.tone && sum(l.key) < 0 ? "text-red-700" : ""}`}>{fmtM(sum(l.key))}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 text-slate-500">
            <td className="p-2">Biên gộp</td>
            {rows.map((m) => <td key={m.label} className="p-2 text-right tabular-nums">{!hasData(m) ? "" : m.revenueNet >= 10_000_000 ? pct(m.grossProfit, m.revenueNet) : <span className="text-slate-400" title="Tháng này không ghi nhận doanh thu, không tính biên">không thu</span>}</td>)}
            <td className="p-2 text-right tabular-nums">{pct(sum("grossProfit"), sum("revenueNet"))}</td>
          </tr>
        </tbody>
      </table>
      {rows.some((m) => !m.opexAvailable) && <div className="pt-2 text-[11px] text-slate-500">* tháng chưa có sổ NKC nên chi phí cố định bằng 0.</div>}
    </div>
  );
}

function Row({ line, denom, cmp, withRef }: { line: PnlLine; denom: number; cmp?: PnlComparisonRow; withRef: boolean }) {
  const isSection = line.kind === "section";
  const padCls = line.kind === "sub" ? "pl-10" : line.kind === "item" ? "pl-6" : "";
  const profitLine = line.code === "3" || line.code === "6" || line.code === "7";
  const colorCls = profitLine ? (line.value >= 0 ? "text-green-700" : "text-red-700") : "";
  const delta = cmp?.delta ?? null;
  const deltaCls = delta == null ? "text-slate-400" : Math.abs(delta) < 1000 ? "text-slate-400" : cmp?.note ? "text-slate-700" : "text-amber-700 font-medium";
  return (
    <tr className={isSection ? "border-t-2 border-slate-300 bg-slate-100 font-bold" : "border-t border-slate-100"} title={line.source}>
      <td className="p-2 font-mono text-xs text-slate-500">{line.code}</td>
      <td className={`p-2 ${padCls} ${colorCls}`}>
        {line.label}
        {line.source && line.kind !== "sub" && <div className="text-[11px] text-slate-400 font-normal">{line.source}</div>}
      </td>
      <td className={`p-2 text-right tabular-nums align-top ${colorCls}`}>{fmt(line.value)}</td>
      <td className="p-2 text-right text-xs text-slate-500 align-top">{line.pctBase ? pct(line.value, denom) : ""}</td>
      {withRef && <td className="p-2 text-right tabular-nums text-slate-600 align-top">{cmp?.ref == null ? "" : fmt(cmp.ref)}</td>}
      {withRef && <td className={`p-2 text-right tabular-nums align-top ${deltaCls}`}>{delta == null ? "" : fmtDelta(delta)}</td>}
    </tr>
  );
}
