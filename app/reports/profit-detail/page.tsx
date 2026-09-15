/**
 * Báo cáo lãi/lỗ quản trị. Hai cách nhìn: Dòng tiền (mặc định) và Dồn tích.
 * Bố cục bento (chốt 16/09/2026): mở ra thấy ngay hai con số quyết định, rồi biểu đồ bậc thang
 * giải thích vì sao lợi nhuận và tiền lệch nhau, rồi ba chỉ số nhỏ. Bảng chi tiết nằm trong khối gập.
 */
import { requirePermission } from "@/lib/auth";
import Link from "next/link";
import type { ReactNode } from "react";
import { loadManagementPnl, findReference, comparePnl, type PnlLine, type PnlComparisonRow, type AccrualMonth } from "@/lib/management-pnl";
import { loadCashPnl, loadFounderSpendOutsideBooks, computeRatios, monthsWithData, type BankBalance, type CashLine, type CashMonth } from "@/lib/cash-pnl";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtM = (n: number) => `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}`;
/** Số trong câu chữ: dưới 1 tỷ thì ghi triệu, từ 1 tỷ trở lên đổi sang tỷ cho dễ đọc. */
const fmtT = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tỷ`;
  return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
};
const fmtDeltaT = (n: number) => (Math.round(n / 1e5) === 0 ? "0" : (n > 0 ? "+" : "−") + fmtT(Math.abs(n)));
const fmtD = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const fmtDelta = (n: number) => (n === 0 ? "0" : (n > 0 ? "+" : "−") + Math.abs(Math.round(n)).toLocaleString("vi-VN"));
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

  const year = Number(sp.year) || 2026;
  const period = sp.period ?? "year";
  const q = sp.q ? Number(sp.q) : undefined;
  const month = sp.month ? Number(sp.month) : undefined;
  const basis = sp.basis === "accrual" ? "accrual" : "cash";
  const { start, end, label, months } = periodDates(year, period, q, month);

  const linkTo = (p: { year?: number; period?: string; q?: number; month?: number; basis?: string }) => {
    const u = new URLSearchParams();
    u.set("year", String(p.year ?? year));
    u.set("period", p.period ?? period);
    if (p.q !== undefined) u.set("q", String(p.q));
    if (p.month !== undefined) u.set("month", String(p.month));
    u.set("basis", p.basis ?? basis);
    return `/reports/profit-detail?${u}`;
  };
  const pill = (on: boolean, onCls = "bg-slate-800 text-white") =>
    `inline-block px-2.5 py-1 rounded-md text-xs ${on ? onCls : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`;

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-xs text-blue-600 hover:underline">← Báo cáo</Link>
          <h1 className="text-2xl font-bold mt-1">Lãi/lỗ và dòng tiền</h1>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex gap-1">
            <Link href={linkTo({ basis: "cash" })} className={pill(basis === "cash")}>Dòng tiền</Link>
            <Link href={linkTo({ basis: "accrual" })} className={pill(basis === "accrual")}>Dồn tích</Link>
          </div>
          <div className="flex gap-1">
            {[2024, 2025, 2026].map((y) => <Link key={y} href={linkTo({ year: y })} className={pill(y === year, "bg-orange-500 text-white")}>{y}</Link>)}
          </div>
          <div className="flex gap-1">
            <Link href={linkTo({ period: "year" })} className={pill(period === "year", "bg-blue-600 text-white")}>Cả năm</Link>
            {[1, 2, 3, 4].map((qi) => <Link key={qi} href={linkTo({ period: "quarter", q: qi })} className={pill(period === "quarter" && q === qi, "bg-blue-600 text-white")}>Q{qi}</Link>)}
          </div>
          <details className="relative">
            <summary className={`cursor-pointer list-none ${pill(period === "month", "bg-green-600 text-white")}`}>{period === "month" ? `Tháng ${month}` : "Tháng"}</summary>
            <div className="absolute right-0 z-10 mt-1 bg-card rounded-lg ring-1 ring-foreground/10 shadow-lg p-2 grid grid-cols-6 gap-1 w-56">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <Link key={m} href={linkTo({ period: "month", month: m })} className={`text-center ${pill(period === "month" && month === m, "bg-green-600 text-white")}`}>T{m}</Link>
              ))}
            </div>
          </details>
        </div>
      </div>

      {basis === "cash" ? <CashView start={start} end={end} months={months} /> : <AccrualView start={start} end={end} months={months} />}
    </div>
  );
}

// ───────────────────────── Khối bento dùng chung ─────────────────────────

const TONE = { good: "text-green-700", bad: "text-red-700" } as const;

/** Ô lớn: một con số quyết định, đọc được từ xa. */
function BigTile({ label, value, tone, sub }: { label: string; value: string; tone?: "good" | "bad"; sub?: ReactNode }) {
  return (
    <div className="md:col-span-3 bg-card rounded-xl ring-1 ring-foreground/10 p-5 flex flex-col gap-1">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-3xl font-bold tabular-nums leading-tight ${tone ? TONE[tone] : ""}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 leading-snug mt-0.5">{sub}</div>}
    </div>
  );
}

/** Ô nhỏ: chỉ số phụ, ba cái một hàng. */
function SmallTile({ label, value, sub, tone, en }: { label: string; value: string; sub?: ReactNode; tone?: "good" | "bad"; en?: string }) {
  return (
    <div className="md:col-span-2 bg-card rounded-xl ring-1 ring-foreground/10 p-4 flex flex-col gap-0.5">
      <div className="text-xs text-slate-500">{label}{en && <span className="text-slate-400"> · {en}</span>}</div>
      <div className={`text-xl font-semibold tabular-nums ${tone ? TONE[tone] : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 leading-snug">{sub}</div>}
    </div>
  );
}

interface FlowStep { label: string; value: number; kind: "start" | "add" | "sub" | "end" }

/** Biểu đồ bậc thang: từ một con số đầu, cộng trừ từng bước, ra con số cuối. */
function Waterfall({ title, note, steps }: { title: string; note?: string; steps: FlowStep[] }) {
  const max = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
  return (
    <div className="md:col-span-6 bg-card rounded-xl ring-1 ring-foreground/10 p-5 flex flex-col gap-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-sm font-semibold">{title}</span>
        {note && <span className="text-xs text-slate-500">{note}</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        {steps.map((s) => {
          const w = Math.max(1.5, (Math.abs(s.value) / max) * 100);
          const mau = s.kind === "sub" ? "bg-red-400" : s.kind === "end" ? (s.value >= 0 ? "bg-green-600" : "bg-red-600") : s.kind === "start" ? "bg-slate-600" : "bg-sky-500";
          const dau = s.kind === "sub" ? "−" : s.kind === "add" ? "+" : "";
          return (
            <div key={s.label} className="grid grid-cols-[minmax(8rem,14rem)_1fr_auto] items-center gap-3">
              <div className={`text-xs ${s.kind === "end" || s.kind === "start" ? "font-semibold text-slate-800" : "text-slate-600"}`}>{s.label}</div>
              <div className="h-4 bg-slate-100 rounded-sm overflow-hidden">
                <div className={`h-full ${mau} rounded-sm`} style={{ width: `${w}%` }} />
              </div>
              <div className={`text-sm tabular-nums text-right w-36 ${s.kind === "sub" ? "text-red-700" : s.kind === "end" ? (s.value >= 0 ? "text-green-700 font-semibold" : "text-red-700 font-semibold") : ""}`}>
                {dau}{fmt(Math.abs(s.value))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Cột theo tháng: dương lên trên, âm xuống dưới, có đường 0 ở giữa. */
function MonthBars({ title, rows, note }: { title: string; rows: { label: string; value: number; has: boolean }[]; note?: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <div className="md:col-span-6 bg-card rounded-xl ring-1 ring-foreground/10 p-5 flex flex-col gap-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-sm font-semibold">{title}</span>
        {note && <span className="text-xs text-slate-500">{note}</span>}
        <span className="text-xs text-slate-400 ml-auto">triệu đồng</span>
      </div>
      <div className="flex items-stretch gap-1.5 overflow-x-auto">
        {rows.map((r) => {
          const h = r.has ? Math.max(2, (Math.abs(r.value) / max) * 56) : 0;
          return (
            <div key={r.label} className="flex-1 min-w-[2.4rem] flex flex-col items-center gap-1">
              <div className="h-14 w-full flex items-end justify-center">
                {r.has && r.value >= 0 && <div className="w-full bg-green-600 rounded-t-sm" style={{ height: `${h}px` }} />}
              </div>
              <div className="h-px w-full bg-slate-300" />
              <div className="h-14 w-full flex items-start justify-center">
                {r.has && r.value < 0 && <div className="w-full bg-red-500 rounded-b-sm" style={{ height: `${h}px` }} />}
              </div>
              <div className="text-[10px] text-slate-500">{r.label}</div>
              <div className={`text-[10px] tabular-nums ${r.value < 0 ? "text-red-700" : "text-slate-600"}`}>{r.has ? fmtM(r.value) : "—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Fold({ title, teaser, children }: { title: string; teaser?: ReactNode; children: ReactNode }) {
  return (
    <details className="group bg-card rounded-xl ring-1 ring-foreground/10">
      <summary className="cursor-pointer list-none select-none flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4 text-sm">
        <span className="font-semibold"><span className="inline-block w-4 text-slate-400 transition-transform group-open:rotate-90">▸</span>{title}</span>
        {teaser && <span className="text-xs text-slate-500">{teaser}</span>}
      </summary>
      <div className="px-4 pb-4 space-y-3">{children}</div>
    </details>
  );
}

function Banner({ tone, children }: { tone: "info" | "warn"; children: ReactNode }) {
  const cls = tone === "warn" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-sky-50 border-sky-200 text-sky-900";
  return <div className={`rounded-lg border p-3 text-sm ${cls}`}>{children}</div>;
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
  const giuHo = b.giu_cho + b.hoan_khach;
  const { pnl: acc } = await loadManagementPnl({ start, end });
  const lntt = acc.totals.profitBeforeTax;
  const doanhThu = acc.revenue.net;
  const gomVat = acc.revenue.gross ?? doanhThu;
  const bienTien = doanhThu > 0 ? t.hoatDongRong / doanhThu : null;
  const chuyenDoi = lntt > 0 ? t.hoatDongRong / lntt : null;
  const tienCoTh = bb ? bb.close + bb.tietKiemRong - Math.max(giuHo, 0) : null;
  const coDinhThang = t.chiCoDinh / Math.max(1, soThang);
  const soThangTru = tienCoTh != null && coDinhThang > 0 ? tienCoTh / coDinhThang : null;
  const bbLech = bb ? Math.round(dBank - (bb.close - bb.open)) : 0;

  if (!r.available) {
    return <Banner tone="warn">Kỳ này chưa có dữ liệu tiền: không có sổ nhật ký chung, cũng chưa có sao kê.</Banner>;
  }

  // Cầu nối từ lợi nhuận sang tiền. Cộng lại đúng bằng dòng tiền hoạt động ròng.
  const buoc: FlowStep[] = ([
    { label: "Lợi nhuận trước thuế", value: lntt, kind: "start" },
    { label: "VAT thu hộ trong giá bán", value: gomVat - doanhThu, kind: "add" },
    { label: "Thu tiền hơn doanh thu ghi nhận", value: t.thu - gomVat, kind: "add" },
    { label: "Giá vốn ghi nhận hơn tiền đã chi", value: acc.totals.cogs - t.chiGiaVon, kind: "add" },
    { label: "Chi phí ghi nhận hơn tiền đã chi", value: acc.totals.fixed - t.chiCoDinh, kind: "add" },
    { label: "Thuế đã nộp", value: t.thue, kind: "sub" },
    { label: "Dòng tiền hoạt động ròng", value: t.hoatDongRong, kind: "end" },
  ] as FlowStep[]).filter((s) => s.kind !== "add" || Math.abs(s.value) >= 1000);
  for (const s of buoc) if (s.kind === "add" && s.value < 0) { s.kind = "sub"; s.value = -s.value; }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <BigTile
          label="Dòng tiền hoạt động ròng"
          value={fmt(t.hoatDongRong)}
          tone={t.hoatDongRong >= 0 ? "good" : "bad"}
          sub={<>Thu {fmtT(t.thu)}, trừ giá vốn {fmtT(t.chiGiaVon)}, chi cố định {fmtT(t.chiCoDinh)} và thuế {fmtT(t.thue)}. Tiếng Anh: net cash flow from operating activities.</>}
        />
        {bb ? (
          <BigTile
            label={`Số dư tài khoản ngày ${fmtD(bb.closeDate)}`}
            value={fmt(bb.close)}
            tone={bb.close - bb.open >= 0 ? "good" : "bad"}
            sub={<>Đầu kỳ {fmtT(bb.open)}, <b>{fmtDeltaT(bb.close - bb.open)}</b>, đúng bằng số dư cuối trên sao kê.{bb.tietKiemRong > 0 ? <> Ngoài ra còn {fmtT(bb.tietKiemRong)} gửi tiết kiệm có kỳ hạn.</> : null}</>}
          />
        ) : (
          <BigTile label="Thay đổi tiền trong kỳ" value={fmtDelta(t.thayDoiTien)} tone={t.thayDoiTien >= 0 ? "good" : "bad"} sub="bank và két tiền mặt" />
        )}

        <Waterfall title="Từ lợi nhuận sang tiền mặt" note="vì sao hai con số khác nhau, cộng lại khớp từng đồng" steps={buoc} />

        <SmallTile
          label="Biên dòng tiền hoạt động" en="operating cash flow margin"
          value={bienTien == null ? "—" : pctR(bienTien)}
          tone={bienTien == null ? undefined : bienTien >= 0 ? "good" : "bad"}
          sub={bienTien == null ? "chưa có doanh thu" : <>doanh thu {fmtT(doanhThu)}, thu về {pctR(bienTien)} tiền mặt</>}
        />
        <SmallTile
          label="Tỷ lệ chuyển đổi tiền" en="cash conversion"
          value={chuyenDoi == null ? "—" : pctR(chuyenDoi)}
          sub={chuyenDoi == null ? "kỳ này chưa có lợi nhuận" : <>trong {fmtT(lntt)} lợi nhuận, bấy nhiêu đã thành tiền</>}
        />
        <SmallTile
          label="Tiền đủ trụ bao lâu" en="cash runway"
          value={soThangTru == null ? "—" : `${soThangTru.toFixed(1)} tháng`}
          tone={soThangTru == null ? undefined : soThangTru >= 6 ? "good" : "bad"}
          sub={soThangTru == null ? "chưa có số dư cuối kỳ" : <>tiền {fmtT(tienCoTh!)}, chi cố định {fmtT(coDinhThang)} mỗi tháng</>}
        />

        {monthly.length > 1 && (
          <MonthBars
            title="Dòng tiền hoạt động ròng theo tháng"
            note={dataThrough ? `số liệu đến ${fmtD(dataThrough)}` : undefined}
            rows={monthly.map((m) => ({ label: m.label, value: m.hoatDongRong, has: !dataThrough || m.period.start <= dataThrough }))}
          />
        )}
      </div>

      <div className="text-xs text-slate-500">
        {source === "nkc"
          ? "Nguồn: từng lần tiền vào ra trên sổ nhật ký chung của kế toán, cộng sổ chi cá nhân của hai người sáng lập."
          : "Nguồn: sao kê Techcombank phân loại theo luật, cộng sổ chi cá nhân của hai người sáng lập. Kỳ này chưa có sổ kế toán."}
        {r.unclassified.length > 0 && <> Còn <b>{r.unclassified.length}</b> khoản chưa phân loại, sửa tại <Link href="/finance/bank-review" className="underline">Sao kê bank</Link>.</>}
        {giuHo !== 0 && <> Trong số dư có {fmtT(giuHo)} tiền khách giữ chỗ chưa hoàn, không phải tiền của công ty.</>}
      </div>

      {monthly.length > 1 && (
        <Fold title="Bảng theo tháng" teaser={<>{soThang} tháng có số liệu</>}>
          <CashMonthlyTable rows={monthly} dataThrough={dataThrough} />
        </Fold>
      )}

      <Fold title="Chi tiết từng dòng" teaser="9 mục, từ tiền thu đến thay đổi tiền trong kỳ">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr><th className="text-left p-2 w-12">STT</th><th className="text-left p-2">Khoản mục</th><th className="text-right p-2 w-40">Số tiền</th><th className="text-right p-2 w-24">Tỷ trọng/thu</th></tr>
            </thead>
            <tbody>
              {r.lines.map((l) => <CashRow key={l.code} line={l} denom={t.thu} />)}
              <tr><td colSpan={4} className="p-1 bg-slate-50" /></tr>
              {r.memo.map((l) => <CashRow key={l.code} line={l} denom={0} />)}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Dòng lương chia khối kinh doanh và quản lý theo tỷ lệ sao kê từng người, xem tại <Link href="/finance/employee-pay" className="underline">Tiền trả nhân sự</Link>. Thuế thu nhập cá nhân là tiền khấu trừ của nhân viên nộp hộ.</p>
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
        {r.unclassified.length > 0 && <Banner tone="warn">{r.unclassified.length} khoản chưa phân loại, đang nằm ở dòng 8.8.</Banner>}
      </Fold>

      <Fold title="Điểm hòa vốn theo tiền" teaser={ratios.hoaVonThuThang != null ? <>cần thu {fmtT(ratios.hoaVonThuThang)} mỗi tháng</> : <>chưa tính được</>}>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <SmallTile label="Chênh gộp bằng tiền" value={fmt(t.chenhGop)} sub={`biên ${pctR(ratios.bienGop)}`} tone={t.chenhGop >= 0 ? "good" : "bad"} />
          <SmallTile label="Hòa vốn: thu cần mỗi tháng" value={ratios.hoaVonThuThang == null ? "—" : fmt(ratios.hoaVonThuThang)} sub={ratios.canCanMoiThang != null ? <>khoảng {ratios.canCanMoiThang} căn mỗi tháng, thực tế {ratios.canBinhQuanThang} căn</> : undefined} />
          <SmallTile label="Biên an toàn" value={pctR(ratios.anToan)} sub="phần thu vượt mức hòa vốn" tone={ratios.anToan == null ? undefined : ratios.anToan >= 0 ? "good" : "bad"} />
        </div>
        <p className="text-xs text-slate-500">Hòa vốn ở đây tính trên tiền thu và chưa gồm thuế. Bản chuẩn tính trên doanh thu nằm ở cách nhìn Dồn tích.</p>
      </Fold>
    </>
  );
}

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
            <tr><td className="pr-6 py-0.5 text-slate-600">Đã chuyển sang tiết kiệm có kỳ hạn{bb.tietKiemDate ? ` ngày ${fmtD(bb.tietKiemDate)}` : ""}, chưa quay lại tài khoản, nằm ngoài số dư trên</td><td className="text-right tabular-nums">{fmt(bb.tietKiemRong)}</td></tr>
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
            {rows.map((m) => <td key={m.label} className="p-2 text-right tabular-nums">{!hasData(m) ? "" : m.thu >= 10_000_000 ? pct(m.chenhGop, m.thu) : <span className="text-slate-400" title="Tháng này CĐT không chuyển phí, không tính biên">không thu</span>}</td>)}
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
  const ngoaiSo = pnl.opexSource === "nkc" ? await loadFounderSpendOutsideBooks({ start, end }) : 0;
  const ref = findReference({ start, end });
  const cmp = ref ? comparePnl(pnl, ref) : null;
  const cmpByCode = new Map<string, PnlComparisonRow>(cmp?.map((c) => [c.code, c]) ?? []);
  const explained = cmp?.filter((c) => c.delta != null && Math.abs(c.delta) >= 1000 && c.note) ?? [];
  const unexplained = cmp?.filter((c) => c.delta != null && Math.abs(c.delta) >= 1000 && !c.note) ?? [];
  const denom = pnl.revenue.net;
  const soThang = Math.min(months, monthsWithData({ start, end }, dataThrough));
  const ratios = computeRatios(pnl.revenue.net, pnl.totals.grossProfit, pnl.totals.fixed, pnl.totals.profitBeforeTax, soThang, pnl.units);
  const lo = pnl.totals.profitBeforeTax;
  const sauThue = pnl.lines.find((l) => l.code === "7")?.value ?? null;

  const buoc: FlowStep[] = [
    { label: "Doanh thu không VAT", value: denom, kind: "start" },
    { label: "Giá vốn", value: pnl.totals.cogs, kind: "sub" },
    { label: "Chi phí cố định", value: pnl.totals.fixed, kind: "sub" },
    { label: "Lợi nhuận trước thuế", value: lo, kind: "end" },
  ];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <BigTile
          label="Lợi nhuận trước thuế" value={fmt(lo)} tone={lo >= 0 ? "good" : "bad"}
          sub={<>Biên {pctR(ratios.bienHoatDong)} trên doanh thu {fmtT(denom)}. Tiếng Anh: profit before tax.{sauThue ? <> Sau thuế còn {fmtT(sauThue)}.</> : null}</>}
        />
        <BigTile
          label="Lãi gộp" value={fmt(pnl.totals.grossProfit)} tone={pnl.totals.grossProfit >= 0 ? "good" : "bad"}
          sub={<>Biên gộp {pctR(ratios.bienGop)}. Doanh thu trừ hoa hồng, hỗ trợ khách và thưởng, tức phần còn lại để nuôi bộ máy.</>}
        />

        <Waterfall title="Doanh thu đi về đâu" note="ghi theo kỳ phát sinh, không theo ngày tiền vào ra" steps={buoc} />

        <SmallTile label="Điểm hòa vốn" en="break-even" value={ratios.hoaVonThuThang == null ? "—" : `${fmtT(ratios.hoaVonThuThang)}`} sub={ratios.canCanMoiThang != null ? <>mỗi tháng, khoảng {ratios.canCanMoiThang} căn, thực tế {ratios.canBinhQuanThang} căn</> : "chi phí cố định chia biên gộp"} />
        <SmallTile label="Biên an toàn" en="margin of safety" value={pctR(ratios.anToan)} sub="doanh thu tụt bấy nhiêu vẫn chưa lỗ" tone={ratios.anToan == null ? undefined : ratios.anToan >= 0 ? "good" : "bad"} />
        <SmallTile label="Doanh thu mỗi căn" value={ratios.thuMoiCan == null ? "—" : `${fmtT(ratios.thuMoiCan)}`} sub={ratios.soCan ? <>{ratios.soCan} căn có đối chiếu trong kỳ</> : "chưa có căn nào"} />

        {monthly.length > 1 && (
          <MonthBars
            title="Lợi nhuận trước thuế theo tháng"
            note={dataThrough ? `số liệu đến ${fmtD(dataThrough)}` : undefined}
            rows={monthly.map((m) => ({ label: m.label, value: m.profitBeforeTax, has: !dataThrough || m.period.start <= dataThrough }))}
          />
        )}
      </div>

      {pnl.opexSource === "none" && <Banner tone="warn">Kỳ này chưa có sổ kế toán và cũng chưa có sao kê nên chi phí cố định đang trống, lợi nhuận và hòa vốn chưa đúng.</Banner>}
      {ngoaiSo > 0 && (
        <Banner tone="info">
          Ngoài sổ kế toán, hai người sáng lập còn bỏ <b>{fmtT(ngoaiSo)}</b> từ tài khoản cá nhân để chi cho công ty trong kỳ này.
          Tính thêm khoản đó thì lợi nhuận trước thuế là <b>{fmtT(lo - ngoaiSo)}</b>. Bản dồn tích giữ nguyên số của kế toán để còn đối chiếu, bản dòng tiền đã tính đủ.
        </Banner>
      )}

      <div className="text-xs text-slate-500">
        {pnl.opexSource === "nkc" && "Doanh thu và giá vốn theo đối chiếu trong CRM, chi phí cố định theo sổ nhật ký chung của kế toán."}
        {pnl.opexSource === "bank" && "Doanh thu và giá vốn theo đối chiếu trong CRM. Chưa có sổ kế toán nên chi phí cố định tạm lấy theo tiền đã chi trên sao kê và sổ cá nhân của hai người sáng lập."}
      </div>

      {monthly.length > 1 && (
        <Fold title="Bảng theo tháng" teaser={<>{soThang} tháng có số liệu</>}>
          <AccrualMonthlyTable rows={monthly} dataThrough={dataThrough} />
        </Fold>
      )}

      <Fold title="Chi tiết từng dòng" teaser={ref ? "có cột kế toán và cột lệch" : "doanh thu, giá vốn, chi phí cố định"}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left p-2 w-12">STT</th><th className="text-left p-2">Khoản mục</th>
                <th className="text-right p-2 w-40">App</th><th className="text-right p-2 w-20">Tỷ trọng/DT</th>
                {ref && <th className="text-right p-2 w-40">Kế toán</th>}
                {ref && <th className="text-right p-2 w-32">Lệch</th>}
              </tr>
            </thead>
            <tbody>{pnl.lines.map((l) => <Row key={l.code} line={l} denom={denom} cmp={cmpByCode.get(l.code)} withRef={!!ref} />)}</tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Giá vốn gồm trích trước cuối năm của kế toán, trừ phần hoàn nhập khi kỳ sau chi thật. Chi phí cố định sửa phân loại tại <Link href="/finance/nkc-review" className="underline">Sổ NKC</Link>.</p>
      </Fold>

      {ref && (
        <Fold title={`Đối chiếu với ${ref.label}`} teaser={<span className={unexplained.length > 0 ? "text-amber-800" : "text-green-700"}>{explained.length + unexplained.length === 0 ? "khớp từng dòng" : `${explained.length} lệch đã rõ, ${unexplained.length} chưa rõ`}</span>}>
          <p className="text-slate-600 text-sm">Cột Lệch bằng App trừ Kế toán. Dòng có ghi chú là lệch đã tìm ra nguyên nhân.</p>
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
          {unexplained.length > 0 && <Banner tone="warn">Chưa có giải thích: {unexplained.map((c) => `${c.code} (${fmtDelta(c.delta!)})`).join(", ")}</Banner>}
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
            {rows.map((m) => <td key={m.label} className="p-2 text-right tabular-nums">{!hasData(m) ? "" : m.revenueNet >= 10_000_000 ? pct(m.grossProfit, m.revenueNet) : <span className="text-slate-400" title="Tháng này không ghi nhận doanh thu">không thu</span>}</td>)}
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
