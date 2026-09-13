/**
 * Báo cáo lãi/lỗ quản trị. Hai cách nhìn:
 *  - Dòng tiền (mặc định): tiền thật vào/ra bank + két, từ chân tiền sổ NKC (năm có sổ).
 *  - Dồn tích: theo format báo cáo kế toán, có cột đối chiếu với số kế toán khi kỳ có tham chiếu.
 * Mỗi cách nhìn: thẻ tổng quan (biên, hòa vốn), bảng theo tháng, rồi bảng chi tiết từng dòng.
 */
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadManagementPnl, findReference, comparePnl, type PnlLine, type PnlComparisonRow, type AccrualMonth } from "@/lib/management-pnl";
import { loadCashPnl, computeRatios, type CashLine, type CashMonth, type Ratios } from "@/lib/cash-pnl";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtM = (n: number) => `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}`;
const fmtDelta = (n: number) => (n === 0 ? "0" : (n > 0 ? "+" : "−") + Math.abs(Math.round(n)).toLocaleString("vi-VN"));
const pct = (n: number, denom: number) => (denom > 0 ? `${((n / denom) * 100).toFixed(1)}%` : "");
// Biên theo tháng: tháng không có tiền CĐT về (thu chỉ vài trăm nghìn lãi tài khoản) thì tỷ lệ vô nghĩa, để trống.
const pctMonth = (n: number, denom: number) => (denom >= 10_000_000 ? pct(n, denom) : "");
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
  const user = await getCurrentUser();
  if (!user) notFound();
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

  return (
    <div className="space-y-6">
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

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 flex flex-wrap gap-3 items-center text-xs">
        <div>
          <span className="text-slate-500 mr-2">Cách nhìn:</span>
          <Link href={linkTo({ basis: "cash" })} className={`inline-block px-2 py-1 rounded mr-1 ${basis === "cash" ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>Dòng tiền</Link>
          <Link href={linkTo({ basis: "accrual" })} className={`inline-block px-2 py-1 rounded mr-1 ${basis === "accrual" ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>Dồn tích</Link>
        </div>
        <div>
          <span className="text-slate-500 mr-2">Năm:</span>
          {years.map((y) => (
            <Link key={y} href={linkTo({ year: y })} className={`inline-block px-2 py-1 rounded mr-1 ${y === year ? "bg-orange-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>{y}</Link>
          ))}
        </div>
        <div>
          <span className="text-slate-500 mr-2">Kỳ:</span>
          <Link href={linkTo({ period: "year" })} className={`inline-block px-2 py-1 rounded mr-1 ${period === "year" ? "bg-blue-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>Cả năm</Link>
          {quarters.map((qi) => (
            <Link key={qi} href={linkTo({ period: "quarter", q: qi })} className={`inline-block px-2 py-1 rounded mr-1 ${period === "quarter" && q === qi ? "bg-blue-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>Q{qi}</Link>
          ))}
        </div>
        <div>
          <span className="text-slate-500 mr-2">Tháng:</span>
          {monthList.map((m) => (
            <Link key={m} href={linkTo({ period: "month", month: m })} className={`inline-block px-1.5 py-1 rounded mr-1 text-[10px] ${period === "month" && month === m ? "bg-green-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>T{m}</Link>
          ))}
        </div>
      </div>

      {basis === "cash" ? <CashView start={start} end={end} months={months} /> : <AccrualView start={start} end={end} months={months} />}
    </div>
  );
}

// ───────────────────────── Thẻ tổng quan dùng chung ─────────────────────────

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : "";
  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function RatioCards({ r, thuLabel, thu, gop, coDinh, rong, rongLabel }: { r: Ratios; thuLabel: string; thu: number; gop: number; coDinh: number; rong: number; rongLabel: string }) {
  const hoaVonOk = r.hoaVonThuThang != null && r.thuBinhQuanThang >= r.hoaVonThuThang;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
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
  const { pnl: r, monthly, units, source } = await loadCashPnl({ start, end });
  const thu = r.totals.thu;
  const dBank = r.totals.bankIn - r.totals.bankOut;
  const dCash = r.totals.cashIn - r.totals.cashOut;
  const khop = Math.abs(dBank + dCash - r.totals.thayDoiTien) < 1000;
  const ratios = computeRatios(thu, r.totals.chenhGop, r.totals.chiCoDinh, r.totals.hoatDongRong, months, units);

  if (!r.available) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
        Kỳ này chưa có dữ liệu tiền: không có sổ nhật ký chung, cũng chưa có sao kê.
      </div>
    );
  }

  return (
    <>
      {source === "bank" && (
        <div className="bg-sky-50 border border-sky-200 rounded p-3 text-sm text-sky-900">
          Kỳ này chưa có sổ kế toán. Số lấy từ sao kê Techcombank phân loại theo luật (người nhận, diễn giải) và sổ chi tiền mặt của founder.
          {r.unclassified.length > 0 && <> Còn <b>{r.unclassified.length}</b> khoản chưa phân loại, sửa tại <Link href="/finance/bank-review" className="underline">Sao kê bank</Link>, sửa tay được ưu tiên.</>}
          {" "}Thuế nộp kho bạc chưa tách được loại vì sao kê không ghi.
        </div>
      )}
      <RatioCards r={ratios} thuLabel="Tiền thu hoạt động" thu={thu} gop={r.totals.chenhGop} coDinh={r.totals.chiCoDinh} rong={r.totals.hoatDongRong} rongLabel="Dòng tiền hoạt động ròng" />

      {monthly.length > 1 && <CashMonthlyTable rows={monthly} />}

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
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
            {r.lines.map((l) => <CashRow key={l.code} line={l} denom={thu} />)}
            <tr><td colSpan={4} className="p-1 bg-slate-50" /></tr>
            {r.memo.map((l) => <CashRow key={l.code} line={l} denom={0} />)}
          </tbody>
        </table>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 text-sm space-y-2">
        <div className="font-semibold">Khớp với số dư</div>
        <table className="text-sm">
          <tbody>
            <tr><td className="pr-6 py-0.5 text-slate-600">Bank: vào {fmt(r.totals.bankIn)}, ra {fmt(r.totals.bankOut)}</td><td className="text-right tabular-nums">{fmtDelta(dBank)}</td></tr>
            <tr><td className="pr-6 py-0.5 text-slate-600">Tiền mặt: vào {fmt(r.totals.cashIn)}, ra {fmt(r.totals.cashOut)}</td><td className="text-right tabular-nums">{fmtDelta(dCash)}</td></tr>
            <tr className="font-semibold"><td className="pr-6 py-0.5">Cộng, so với dòng 9</td><td className={`text-right tabular-nums ${khop ? "text-green-700" : "text-red-700"}`}>{fmtDelta(dBank + dCash)} {khop ? "khớp" : "lệch"}</td></tr>
          </tbody>
        </table>
        {r.unclassified.length > 0 && (
          <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
            {r.unclassified.length} khoản chưa phân loại, đang nằm ở dòng 8.8.
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        <p>{source === "nkc"
          ? "Nguồn: từng lần tiền vào ra trên sổ nhật ký chung (TK 11211 bank, TK 1111 tiền mặt). Phân loại theo tài khoản đối ứng kế toán đã ghi, trả nhà cung cấp thì đọc diễn giải."
          : "Nguồn: sao kê Techcombank và sổ chi tiền mặt founder. Khi kế toán giao sổ nhật ký chung, trang tự chuyển sang dùng sổ."}</p>
        <p>Dòng lương chia khối kinh doanh và quản lý theo tỷ lệ sao kê từng người. Xem từng người tại <Link href="/finance/employee-pay" className="underline">Tiền trả nhân sự</Link>.</p>
        <p>Thuế TNCN là tiền khấu trừ của nhân viên nộp hộ, để riêng ở mục 6 để nhìn đúng tiền ra khỏi công ty.</p>
      </div>
    </>
  );
}

function CashMonthlyTable({ rows }: { rows: CashMonth[] }) {
  const sum = (k: keyof Omit<CashMonth, "label" | "period">) => rows.reduce((s, m) => s + m[k], 0);
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
  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
      <div className="px-3 pt-3 text-sm font-semibold">Theo tháng (triệu đồng)</div>
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left p-2">Khoản mục</th>
            {rows.map((m) => <th key={m.label} className="text-right p-2">{m.label}</th>)}
            <th className="text-right p-2 font-semibold">Cộng</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className={`border-t border-slate-100 ${l.bold ? "font-semibold bg-slate-50" : ""}`}>
              <td className="p-2">{l.label}</td>
              {rows.map((m) => <td key={m.label} className={`p-2 text-right tabular-nums ${l.tone && m[l.key] < 0 ? "text-red-700" : ""}`}>{m[l.key] ? fmtM(m[l.key]) : ""}</td>)}
              <td className={`p-2 text-right tabular-nums font-semibold ${l.tone && sum(l.key) < 0 ? "text-red-700" : ""}`}>{fmtM(sum(l.key))}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 text-slate-500">
            <td className="p-2">Biên gộp</td>
            {rows.map((m) => <td key={m.label} className="p-2 text-right tabular-nums">{pctMonth(m.chenhGop, m.thu)}</td>)}
            <td className="p-2 text-right tabular-nums">{pct(sum("chenhGop"), sum("thu"))}</td>
          </tr>
        </tbody>
      </table>
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
  const { pnl, monthly } = await loadManagementPnl({ start, end });
  const ref = findReference({ start, end });
  const cmp = ref ? comparePnl(pnl, ref) : null;
  const cmpByCode = new Map<string, PnlComparisonRow>(cmp?.map((c) => [c.code, c]) ?? []);
  const explained = cmp?.filter((c) => c.delta != null && Math.abs(c.delta) >= 1000 && c.note) ?? [];
  const unexplained = cmp?.filter((c) => c.delta != null && Math.abs(c.delta) >= 1000 && !c.note) ?? [];
  const denom = pnl.revenue.net;
  const ratios = computeRatios(pnl.revenue.net, pnl.totals.grossProfit, pnl.totals.fixed, pnl.totals.profitBeforeTax, months, pnl.units);

  return (
    <>
      {pnl.opexSource === "none" && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
          Kỳ này chưa có sổ nhật ký chung và cũng chưa có sao kê nên phần chi phí cố định (mục 4) đang trống, biên và điểm hòa vốn chưa đúng. Doanh thu và giá vốn vẫn đầy đủ.
        </div>
      )}
      {pnl.opexSource === "bank" && (
        <div className="bg-sky-50 border border-sky-200 rounded p-3 text-sm text-sky-900">
          Kỳ này chưa có sổ kế toán: doanh thu và giá vốn theo đối chiếu (dồn tích), còn chi phí cố định mục 4 tạm lấy theo tiền đã chi trên sao kê và sổ tiền mặt founder. Khi kế toán giao sổ, mục 4 tự chuyển sang sổ.
        </div>
      )}

      <RatioCards r={ratios} thuLabel="Doanh thu không VAT" thu={pnl.revenue.net} gop={pnl.totals.grossProfit} coDinh={pnl.totals.fixed} rong={pnl.totals.profitBeforeTax} rongLabel="Lợi nhuận trước thuế" />

      {monthly.length > 1 && <AccrualMonthlyTable rows={monthly} />}

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
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
            {pnl.lines.map((l) => (
              <Row key={l.code} line={l} denom={denom} cmp={cmpByCode.get(l.code)} withRef={!!ref} />
            ))}
          </tbody>
        </table>
      </div>

      {ref && (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 text-sm space-y-3">
          <div className="font-semibold">Đối chiếu với {ref.label}</div>
          <p className="text-slate-600">Cột Lệch = App trừ Kế toán. Dòng có ghi chú là lệch đã tìm ra nguyên nhân.</p>
          {explained.length > 0 && (
            <ul className="space-y-2">
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
            <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
              Chưa có giải thích: {unexplained.map((c) => `${c.code} (${fmtDelta(c.delta!)})`).join(", ")}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-slate-500 space-y-1">
        <p>Doanh thu: đối chiếu doanh thu theo ngày đối chiếu, gồm VAT và thưởng nóng của CĐT.</p>
        <p>Giá vốn: đối chiếu giá vốn theo loại chi phí, cộng trích trước cuối năm của kế toán, trừ phần hoàn nhập khi kỳ sau chi thật cho căn đã trích.</p>
        <p>Chi phí cố định: sổ nhật ký chung đã phân loại, sửa phân loại tại <Link href="/finance/nkc-review" className="underline">Sổ NKC</Link>.</p>
      </div>
    </>
  );
}

function AccrualMonthlyTable({ rows }: { rows: AccrualMonth[] }) {
  const sum = (k: "revenueNet" | "cogs" | "grossProfit" | "fixed" | "profitBeforeTax") => rows.reduce((s, m) => s + m[k], 0);
  const lines: { label: string; key: "revenueNet" | "cogs" | "grossProfit" | "fixed" | "profitBeforeTax"; bold?: boolean; tone?: boolean }[] = [
    { label: "Doanh thu không VAT", key: "revenueNet" },
    { label: "Giá vốn", key: "cogs" },
    { label: "Lãi gộp", key: "grossProfit", bold: true, tone: true },
    { label: "Chi phí cố định", key: "fixed" },
    { label: "Lợi nhuận trước thuế", key: "profitBeforeTax", bold: true, tone: true },
  ];
  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
      <div className="px-3 pt-3 text-sm font-semibold">Theo tháng (triệu đồng)</div>
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left p-2">Khoản mục</th>
            {rows.map((m) => <th key={m.label} className="text-right p-2">{m.label}{!m.opexAvailable && <span title="chưa có sổ NKC tháng này"> *</span>}</th>)}
            <th className="text-right p-2 font-semibold">Cộng</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className={`border-t border-slate-100 ${l.bold ? "font-semibold bg-slate-50" : ""}`}>
              <td className="p-2">{l.label}</td>
              {rows.map((m) => <td key={m.label} className={`p-2 text-right tabular-nums ${l.tone && m[l.key] < 0 ? "text-red-700" : ""}`}>{m[l.key] ? fmtM(m[l.key]) : ""}</td>)}
              <td className={`p-2 text-right tabular-nums font-semibold ${l.tone && sum(l.key) < 0 ? "text-red-700" : ""}`}>{fmtM(sum(l.key))}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 text-slate-500">
            <td className="p-2">Biên gộp</td>
            {rows.map((m) => <td key={m.label} className="p-2 text-right tabular-nums">{pctMonth(m.grossProfit, m.revenueNet)}</td>)}
            <td className="p-2 text-right tabular-nums">{pct(sum("grossProfit"), sum("revenueNet"))}</td>
          </tr>
        </tbody>
      </table>
      {rows.some((m) => !m.opexAvailable) && <div className="px-3 pb-2 text-[11px] text-slate-500">* tháng chưa có sổ NKC nên chi phí cố định bằng 0.</div>}
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
