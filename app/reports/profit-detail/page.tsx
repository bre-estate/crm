import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/schema";
import { sql, and, gte, lte } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CATEGORIES, type CategoryKey } from "@/lib/transaction-classifier";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const pct = (n: number, denom: number) => denom > 0 ? `${((n / denom) * 100).toFixed(2)}%` : "—";

type SP = Promise<{ year?: string; period?: string; q?: string; month?: string }>;

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

  // Aggregate bank_transactions per category trong khoảng
  const rows = await db
    .select({
      category: bankTransactions.category,
      inflow: sql<number>`coalesce(sum(credit_amount), 0)::float8`,
      outflow: sql<number>`coalesce(sum(abs(debit_amount)), 0)::float8`,
    })
    .from(bankTransactions)
    .where(and(
      gte(bankTransactions.transactionDate, start),
      lte(bankTransactions.transactionDate, end),
    ))
    .groupBy(bankTransactions.category);

  const byKey = new Map<CategoryKey, { inflow: number; outflow: number }>();
  for (const r of rows) {
    const k = (r.category ?? "chua_phan_loai") as CategoryKey;
    byKey.set(k, { inflow: Number(r.inflow), outflow: Number(r.outflow) });
  }
  const get = (k: CategoryKey) => byKey.get(k)?.outflow ?? 0;
  const getIn = (k: CategoryKey) => byKey.get(k)?.inflow ?? 0;

  // ── 1. DOANH THU ──
  const dtHhSoCap = getIn("dt_hh_so_cap");
  const dtThuCap = getIn("dt_thu_cap");
  const khacThu = getIn("khac_thu");
  const dtTong = dtHhSoCap + dtThuCap + khacThu;
  // DT không VAT ≈ /1.1 (giả định HĐ 10% VAT)
  const dtNet = dtTong / 1.1;

  // ── 2. GIÁ VỐN TRỰC TIẾP (Kim BC 2.x) ──
  const hh_sale = get("hh_sale");
  const ho_tro_khach = get("ho_tro_khach");
  const cdt_thuong_nvkd = get("cdt_thuong_nvkd");
  const cdt_thuong_ql = get("cdt_thuong_ql");
  const cty_thuong_ql = get("cty_thuong_ql");
  const cty_thuong_tpkd = get("cty_thuong_tpkd");
  const cty_thuong_admin = get("cty_thuong_admin");
  const cty_thuong_ceo = get("cty_thuong_ceo");
  const totalCogs = hh_sale + ho_tro_khach + cdt_thuong_nvkd + cdt_thuong_ql
    + cty_thuong_ql + cty_thuong_tpkd + cty_thuong_admin + cty_thuong_ceo;
  const laiGop = dtNet - totalCogs;

  // ── 4. CHI PHÍ CỐ ĐỊNH (Kim BC 4.x) ──
  const luong_nvkd = get("luong_nvkd");
  const thuong_ds_sale = get("thuong_ds_sale");
  const luong_admin = get("luong_admin");
  const marketing = get("marketing");
  const thue_vp = get("thue_vp");
  const do_dung_vp = get("do_dung_vp");
  const di_lai = get("di_lai");
  const tiep_khach = get("tiep_khach");
  const dich_vu_ngoai = get("dich_vu_ngoai");
  const thue_phi_le_phi = get("thue_phi_le_phi");
  const opex_khac = get("opex_khac");
  const qly_chung_khac = thue_vp + do_dung_vp + di_lai + tiep_khach + dich_vu_ngoai + thue_phi_le_phi + opex_khac;
  const totalFixed = luong_nvkd + thuong_ds_sale + luong_admin + marketing + qly_chung_khac;

  const totalOpex = totalCogs + totalFixed;
  const laiThuan = dtNet - totalOpex;

  // Chưa phân loại — cảnh báo
  const chua_phan_loai_out = get("chua_phan_loai") + get("opex_khac");
  const chua_phan_loai_in = getIn("chua_phan_loai") + getIn("khac_thu");

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
        <h1 className="text-2xl font-bold mt-1">Báo cáo lãi/lỗ quản trị</h1>
        <p className="text-sm text-slate-500 mt-1">
          Format Kim BC — {label}. <b>Chuẩn dòng tiền</b> (cash basis) từ sao kê bank. Không phải dồn tích.
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

      {/* Warning nếu chưa phân loại còn lớn */}
      {(chua_phan_loai_out + chua_phan_loai_in > dtTong * 0.1) && (
        <div className="bg-amber-50 border border-amber-300 rounded p-3 text-sm text-amber-800">
          ⚠️ Chưa phân loại: {fmt(chua_phan_loai_in)} vào + {fmt(chua_phan_loai_out)} ra.
          Số liệu chưa chính xác. <Link href="/finance/bank-review" className="underline">→ Đối chiếu bank</Link> để chỉnh tay.
        </div>
      )}

      {/* Report table */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white text-xs">
            <tr>
              <th className="text-left p-2 w-12">STT</th>
              <th className="text-left p-2">Khoản mục</th>
              <th className="text-right p-2 w-40">Số tiền</th>
              <th className="text-right p-2 w-24">Tỷ trọng/DT</th>
            </tr>
          </thead>
          <tbody>
            <SectionRow stt="1" label="DOANH THU" />
            <ItemRow stt="1.1" label="Doanh thu gồm VAT (thực thu vào bank)" value={dtTong} />
            <ItemRow stt="1.2" label="Doanh thu không VAT" value={dtNet} highlight />
            <ItemRow stt="1.a" label="↳ HH sơ cấp (CĐT trả)" value={dtHhSoCap} indent />
            <ItemRow stt="1.b" label="↳ Thứ cấp" value={dtThuCap} indent />
            <ItemRow stt="1.c" label="↳ Thu khác" value={khacThu} indent />

            <SectionRow stt="2" label="CÁC KHOẢN GIÁ VỐN TRỰC TIẾP" value={totalCogs} pct={pct(totalCogs, dtNet)} />
            <ItemRow stt="2.1" label="Chi phí hoa hồng" value={hh_sale} pctStr={pct(hh_sale, dtNet)} indent />
            <ItemRow stt="2.2" label="Chi phí hỗ trợ khách mua BĐS" value={ho_tro_khach} pctStr={pct(ho_tro_khach, dtNet)} indent />
            <ItemRow stt="2.3" label="CĐT thưởng cho NVKD" value={cdt_thuong_nvkd} pctStr={pct(cdt_thuong_nvkd, dtNet)} indent />
            <ItemRow stt="2.4" label="CĐT thưởng quản lý sàn" value={cdt_thuong_ql} pctStr={pct(cdt_thuong_ql, dtNet)} indent />
            <ItemRow stt="2.5" label="Công ty thưởng quản lý sàn" value={cty_thuong_ql} pctStr={pct(cty_thuong_ql, dtNet)} indent />
            <ItemRow stt="2.6" label="Công ty thưởng trưởng phòng KD" value={cty_thuong_tpkd} pctStr={pct(cty_thuong_tpkd, dtNet)} indent />
            <ItemRow stt="2.7" label="Công ty thưởng Admin" value={cty_thuong_admin} pctStr={pct(cty_thuong_admin, dtNet)} indent />
            <ItemRow stt="2.8" label="Công ty thưởng CEO" value={cty_thuong_ceo} pctStr={pct(cty_thuong_ceo, dtNet)} indent />

            <SectionRow stt="3" label="LÃI GỘP" value={laiGop} pct={pct(laiGop, dtNet)} color={laiGop >= 0 ? "green" : "red"} />

            <SectionRow stt="4" label="CHI PHÍ CỐ ĐỊNH" value={totalFixed} pct={pct(totalFixed, dtNet)} />
            <ItemRow stt="4.1" label="Lương NVKD + BHXH cty" value={luong_nvkd} pctStr={pct(luong_nvkd, dtNet)} indent />
            <ItemRow stt="4.2" label="Thưởng doanh số + khác sale" value={thuong_ds_sale} pctStr={pct(thuong_ds_sale, dtNet)} indent />
            <ItemRow stt="4.3" label="Lương QL + Admin + Kế toán + BHXH cty" value={luong_admin} pctStr={pct(luong_admin, dtNet)} indent />
            <ItemRow stt="4.4" label="Chi phí quảng cáo" value={marketing} pctStr={pct(marketing, dtNet)} indent />
            <ItemRow stt="4.5" label="Chi phí quản lý chung khác" value={qly_chung_khac} pctStr={pct(qly_chung_khac, dtNet)} indent />
            <ItemRow stt="" label="↳ Thuê VP + điện nước internet" value={thue_vp} indent2 />
            <ItemRow stt="" label="↳ Đồ dùng + thiết bị VP" value={do_dung_vp} indent2 />
            <ItemRow stt="" label="↳ Đi lại + xăng xe" value={di_lai} indent2 />
            <ItemRow stt="" label="↳ Tiếp khách" value={tiep_khach} indent2 />
            <ItemRow stt="" label="↳ Dịch vụ mua ngoài" value={dich_vu_ngoai} indent2 />
            <ItemRow stt="" label="↳ Thuế phí lệ phí" value={thue_phi_le_phi} indent2 />
            <ItemRow stt="" label="↳ OPEX khác" value={opex_khac} indent2 />

            <SectionRow stt="5" label="TỔNG CHI PHÍ HOẠT ĐỘNG" value={totalOpex} pct={pct(totalOpex, dtNet)} />

            <SectionRow stt="6" label="LỢI NHUẬN" value={laiThuan} pct={pct(laiThuan, dtNet)} color={laiThuan >= 0 ? "green" : "red"} />
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 italic space-y-1">
        <p>💡 Nguồn: <b>bank_transactions</b> (sao kê Techcombank) — 824 rows đã classify vào 32 bucket.</p>
        <p>💡 Không tính vào P&L: thuế (TNCN/TNDN/VAT), chuyển nội bộ, rút vốn, hoàn khách — xem trong Cash flow.</p>
        <p>💡 Nếu số không khớp Kim BC: check <Link href="/finance/bank-review" className="underline">Đối chiếu bank</Link> → tìm bucket sai → chỉnh tay.</p>
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
