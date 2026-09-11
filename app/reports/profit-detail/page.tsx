/**
 * Lãi/lỗ quản trị theo format "BC chi tiết lợi nhuận" của kế toán, chuẩn dồn tích.
 * Nguồn: doanh thu và giá vốn từ đối chiếu trong CRM (+ trích trước cuối kỳ), chi phí cố định từ sổ NKC.
 * Khi kỳ có báo cáo kế toán tham chiếu thì hiện thêm cột kế toán và lệch.
 */
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadManagementPnl, findReference, comparePnl, type PnlLine, type PnlComparisonRow } from "@/lib/management-pnl";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtDelta = (n: number) => (n === 0 ? "0" : (n > 0 ? "+" : "−") + Math.abs(Math.round(n)).toLocaleString("vi-VN"));
const pct = (n: number, denom: number) => (denom > 0 ? `${((n / denom) * 100).toFixed(2)}%` : "");

type SP = Promise<{ year?: string; period?: string; q?: string; month?: string }>;

function periodDates(year: number, period: string, q?: number, month?: number): { start: string; end: string; label: string } {
  if (period === "month" && month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start, end, label: `T${month}/${year}` };
  }
  if (period === "quarter" && q) {
    const startMonth = (q - 1) * 3 + 1;
    const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, startMonth + 2, 0)).toISOString().slice(0, 10);
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

  const pnl = await loadManagementPnl({ start, end });
  const ref = findReference({ start, end });
  const cmp = ref ? comparePnl(pnl, ref) : null;
  const cmpByCode = new Map<string, PnlComparisonRow>(cmp?.map((c) => [c.code, c]) ?? []);
  const explained = cmp?.filter((c) => c.delta != null && Math.abs(c.delta) >= 1000 && c.note) ?? [];
  const unexplained = cmp?.filter((c) => c.delta != null && Math.abs(c.delta) >= 1000 && !c.note) ?? [];

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

  const denom = pnl.revenue.net;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Báo cáo lãi/lỗ quản trị</h1>
        <p className="text-sm text-slate-500 mt-1">
          {label}. Chuẩn dồn tích theo format báo cáo kế toán. Doanh thu và giá vốn lấy từ đối chiếu trong CRM, chi phí cố định lấy từ sổ nhật ký chung.
        </p>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 flex flex-wrap gap-3 items-center text-xs">
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
          {months.map((m) => (
            <Link key={m} href={linkTo({ period: "month", month: m })} className={`inline-block px-1.5 py-1 rounded mr-1 text-[10px] ${period === "month" && month === m ? "bg-green-500 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>T{m}</Link>
          ))}
        </div>
      </div>

      {!pnl.opexAvailable && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
          Kỳ này chưa có sổ nhật ký chung từ kế toán nên phần chi phí cố định (mục 4) đang trống. Doanh thu và giá vốn vẫn đầy đủ.
        </div>
      )}

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
          <p className="text-slate-600">
            Cột Lệch = App trừ Kế toán. Dòng có ghi chú là lệch đã tìm ra nguyên nhân.
          </p>
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
        <p>Chi phí cố định: sổ nhật ký chung đã phân loại, sửa phân loại tại <Link href="/finance/nkc-review" className="underline">Đối chiếu sổ NKC</Link>.</p>
      </div>
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
