/**
 * Dòng tiền (báo cáo quản trị) — 100% từ sao kê Techcombank cty.
 * Gộp: Số dư & Runway + Vào/Ra per tháng + Phân loại + Top nhận tiền.
 */
import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/schema";
import { sql, desc, gte, lte, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtM = (n: number) => (n / 1_000_000).toFixed(1) + "M";

// Rule-based classifier — CHỐT 2026-08-04:
// Partner-specific check TRƯỚC description keyword, để tránh false positive
// (VD BUI XUAN DAT NVKD nhận phụ cấp có "ho tro" → bị bắt qua "CK khách").
function classifyOut(partnerName: string | null, description: string): string {
  const p = (partnerName ?? "").toUpperCase();
  const d = (description ?? "").toUpperCase();

  // ===== TẦNG 1: Owner (Triết) =====
  if (/NGUYEN MINH TRIET|MINH TRIET/.test(p)) return "Owner (Triết) — hoàn/rút vốn";

  // ===== TẦNG 2: Partner-specific mapping (landlord, KH cụ thể, Kim) =====
  if (/NGUYEN DANG KHIET/.test(p)) return "Thuê VP"; // Landlord VP kỳ 1
  if (/PHAM NGOC THANH TAM/.test(p)) return "Thuê VP"; // Landlord VP kỳ 2
  if (/BUI HOANG DE/.test(p)) return "Hoàn booking/YCTV";
  if (/HO THI LAN KIM/.test(p)) return "Phí dịch vụ (Kim)";
  if (/TO THI NGA/.test(p)) return "Hỗ trợ/CK khách"; // KH Bcons quy đổi vàng

  // ===== TẦNG 3: Employee list — NVKD/Admin partner ăn hết payments =====
  // Bất kỳ khoản nào chuyển cho NVKD (lương, HH, phụ cấp, hỗ trợ, thưởng) → "Sale team NVKD"
  if (/^(DOAN LE BACH|HO NGUYEN CONG THANH|TRAN MINH NHAT|TRAN THI KHANH LINH|LE THI CAM GIANG|LE TRINH THANH THUY|VU DUC THINH|DOAN NGOC HA SANG|HUYNH DUY ANH|NGUYEN THI HONG NHUNG|BUI THI HA UYEN|NGUYEN QUY TAI|VO THI THU THAO|TONG THI NHUNG|TONG THI HONG THAM|VU THI NGOC DUYEN|PHAM VAN QUYET|BUI XUAN DAT)/.test(p)) {
    return "Sale team NVKD";
  }
  // Admin/HR partner
  if (/DANH HOANG THI TUONG VI|PHAM QUANG TUNG|LUONG THI NGA/.test(p)) return "Admin/HR";
  // Content writer / marketing role
  if (/LE THANH TUNG/.test(p)) return "Marketing";

  // ===== TẦNG 4: Description keyword (khi partner không rõ hoặc tổ chức) =====
  // Chi hộ booking KH (TK 3388 Kim) — passthrough, KHÔNG phải chi phí
  if (/CHUYEN TIEN GIU CHO.*KHACH|GIU CHO.*KHACH|NOP THAY|CHI HO.*BOOKING|CHI HỘ|YCTV/i.test(d)) return "Chi hộ booking KH (passthrough)";
  if (/HOAN\s+(BOOKING|COC|TIEN)|HOÀN\s+(BOOKING|CỌC|TIỀN)|HOAN.*YCTV|HOÀN.*YCTV|REFUND/i.test(d)) return "Hoàn booking/YCTV";
  if (/HO TRO|HỖ TRỢ|CHIET KHAU|CHIẾT KHẤU|QUY DOI.*VANG|QUY ĐỔI.*VÀNG/i.test(d)) return "Hỗ trợ/CK khách";
  if (/THUE.*VP|THUÊ.*VP|THUE VAN PHONG|THUÊ VĂN PHÒNG|TIEN THUE NHA|TIỀN THUÊ NHÀ/i.test(d)) return "Thuê VP";
  if (/LUONG|LƯƠNG|PHU CAP|PHỤ CẤP|THUONG DOANH SO|THƯỞNG DOANH SỐ|THU LAO|THÙ LAO/i.test(d)) return "Lương/HH sale";
  if (/TAM UNG|TẠM ỨNG/i.test(d)) return "Tạm ứng";
  if (/BHXH|BAO HIEM|BẢO HIỂM/i.test(d)) return "BHXH";
  if (/THUE.*(GTGT|TNDN|TNCN|MON BAI)|NTDT|THUẾ/i.test(d)) return "Thuế";
  if (/QUANG CAO|QUẢNG CÁO|MARKETING|BATDONGSAN|PROPERTYGURU/i.test(d)) return "Marketing";
  if (/DICH VU KE TOAN|DỊCH VỤ KẾ TOÁN|PHI DICH VU/i.test(d)) return "Phí dịch vụ (Kim)";

  // ===== TẦNG 5: Tổ chức =====
  if (/^(CTY|CONG TY|CN\s|CTCP)/.test(p) && /(BAM LAND|DXMD|DANH KHOI|BCONS|PHU DONG|PHÚ ĐÔNG)/.test(p)) {
    return "CĐT/Đối tác";
  }
  if (/KHO BAC|KBNN/.test(p)) return "Thuế";
  if (/BAO HIEM XA HOI|BHXH/.test(p)) return "BHXH";
  if (/PROPERTYGURU|MOGI|BATDONGSAN/.test(p)) return "Marketing";

  // ===== TẦNG 6: Thiết bị & Dịch vụ khác (mua đồ, sự kiện, dịch vụ ngoài) =====
  if (/MAY TINH|MÁY TÍNH|GIMBAL|MÁY QUAY|THIET BI|THIẾT BỊ|BO MAY|BỘ MÁY/i.test(d)) return "Thiết bị & Dịch vụ khác";
  if (/HOP DONG.*TIEC|HỢP ĐỒNG.*TIỆC|SU KIEN|SỰ KIỆN|TEAM BUILDING/i.test(d)) return "Thiết bị & Dịch vụ khác";
  if (/VAN CHUYEN|VẬN CHUYỂN|LOGISTICS/i.test(d)) return "Thiết bị & Dịch vụ khác";
  if (/PHAP LUAT|PHÁP LUẬT|LEGAL/i.test(d)) return "Thiết bị & Dịch vụ khác";
  if (/TIN HOC|GIA SON|VJS|JETCAR|THU VIEN PHAP LUAT/i.test(p)) return "Thiết bị & Dịch vụ khác";

  return "Khác";
}

type SP = Promise<{ year?: string }>;

export default async function CashFlowPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") notFound();

  const sp = await searchParams;
  const year = sp.year ?? "2025";

  // ===== 1) Số dư hiện tại (running_balance của giao dịch mới nhất) =====
  const [latest] = await db.execute(sql`
    SELECT transaction_date::text as date, running_balance
    FROM bank_transactions
    ORDER BY transaction_date DESC, id DESC
    LIMIT 1
  `) as any[];
  const currentBalance = latest ? Number(latest.running_balance ?? 0) : 0;

  // ===== 2) Trailing 3 tháng burn / runway =====
  const now = new Date();
  const start3M = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const [t3] = await db.execute(sql`
    SELECT
      COALESCE(SUM(credit_amount), 0)::float8 as inflow,
      COALESCE(SUM(ABS(debit_amount)), 0)::float8 as outflow
    FROM bank_transactions
    WHERE transaction_date >= ${start3M.toISOString().slice(0, 10)}::date
      AND transaction_date <= ${now.toISOString().slice(0, 10)}::date
  `) as any[];
  const inflow3M = Number(t3.inflow), outflow3M = Number(t3.outflow);
  const netMonthly = (inflow3M - outflow3M) / 3;
  const isBurning = netMonthly < 0;
  const runwayMonths = isBurning ? currentBalance / Math.abs(netMonthly) : Infinity;

  // ===== 3) All rows năm chọn =====
  const rows = await db.execute(sql`
    SELECT transaction_date::text as tx_date, partner_name, description, debit_amount, credit_amount
    FROM bank_transactions
    WHERE transaction_date >= ${year + '-01-01'}::date
      AND transaction_date <= ${year + '-12-31'}::date
    ORDER BY transaction_date
  `) as any[];

  // Group per month + category
  type MonthlyStats = {
    month: string;
    inTotal: number;
    outTotal: number;
    outByCategory: Map<string, number>;
  };
  const monthly = new Map<string, MonthlyStats>();
  const allOutCats = new Set<string>();
  const topRecipients = new Map<string, { n: number; total: number; category: string }>();

  for (const r of rows) {
    const m = String(r.tx_date).slice(0, 7);
    if (!monthly.has(m)) {
      monthly.set(m, { month: m, inTotal: 0, outTotal: 0, outByCategory: new Map() });
    }
    const stats = monthly.get(m)!;
    if (r.debit_amount) {
      const amt = Math.abs(Number(r.debit_amount));
      stats.outTotal += amt;
      const cat = classifyOut(r.partner_name, r.description ?? "");
      allOutCats.add(cat);
      stats.outByCategory.set(cat, (stats.outByCategory.get(cat) ?? 0) + amt);
      const rk = r.partner_name ?? "—";
      if (!topRecipients.has(rk)) topRecipients.set(rk, { n: 0, total: 0, category: cat });
      const tr = topRecipients.get(rk)!;
      tr.n++; tr.total += amt;
    }
    if (r.credit_amount) stats.inTotal += Number(r.credit_amount);
  }

  const months = [...monthly.keys()].sort();
  const outCatList = [...allOutCats].sort();
  const totalIn = [...monthly.values()].reduce((s, m) => s + m.inTotal, 0);
  const totalOut = [...monthly.values()].reduce((s, m) => s + m.outTotal, 0);
  const topRecipientsList = [...topRecipients.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Dòng tiền</h1>
        <p className="text-sm text-slate-500 mt-1">
          Từ sao kê Techcombank cty (source of truth 100%). Cập nhật đến {latest?.date ?? "—"}.
        </p>
      </div>

      {/* Section 1: Số dư & Runway */}
      <section>
        <h2 className="text-lg font-semibold mb-2">💰 Số dư & Runway</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatCard label="Số dư bank hiện tại" value={fmt(currentBalance)} color="blue" />
          <StatCard label="Vào TB / tháng (3T)" value={fmt(inflow3M / 3)} color="green" />
          <StatCard label="Ra TB / tháng (3T)" value={fmt(outflow3M / 3)} color="red" />
          <StatCard
            label={isBurning ? "Runway" : "Trạng thái"}
            value={isBurning ? `${runwayMonths.toFixed(1)} tháng` : "Đang lãi"}
            color={isBurning ? (runwayMonths < 3 ? "red" : "amber") : "green"}
          />
        </div>
        {isBurning && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
            ⚠️ Burn {fmt(Math.abs(netMonthly))}/tháng — cần bán thêm hoặc cắt chi.
          </div>
        )}
      </section>

      {/* Section 2: Vào/Ra per tháng */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-lg font-semibold">📊 Vào/Ra theo tháng {year}</h2>
          <div className="text-xs text-slate-500">
            Vào <b className="text-green-700 tabular-nums">{fmt(totalIn)}</b> · Ra <b className="text-red-700 tabular-nums">{fmt(totalOut)}</b> · Net <b className={`tabular-nums ${totalIn - totalOut >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(totalIn - totalOut)}</b>
          </div>
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
          <table className="w-max text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-slate-50 z-10">Tháng</th>
                <th className="text-right p-2">Vào</th>
                <th className="text-right p-2">Ra</th>
                <th className="text-right p-2">Net</th>
                {outCatList.map((c) => (
                  <th key={c} className="text-right p-2 whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const s = monthly.get(m)!;
                const net = s.inTotal - s.outTotal;
                return (
                  <tr key={m} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2 font-mono sticky left-0 bg-white z-10">{m}</td>
                    <td className="p-2 text-right tabular-nums text-green-700">{fmtM(s.inTotal)}</td>
                    <td className="p-2 text-right tabular-nums text-red-700">{fmtM(s.outTotal)}</td>
                    <td className={`p-2 text-right tabular-nums font-semibold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>{fmtM(net)}</td>
                    {outCatList.map((c) => {
                      const v = s.outByCategory.get(c) ?? 0;
                      return (
                        <td key={c} className="p-2 text-right tabular-nums text-slate-500">
                          {v > 0 ? fmtM(v) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100 font-bold">
              <tr>
                <td className="p-2 sticky left-0 bg-slate-100 z-10">TỔNG</td>
                <td className="p-2 text-right tabular-nums text-green-700">{fmt(totalIn)}</td>
                <td className="p-2 text-right tabular-nums text-red-700">{fmt(totalOut)}</td>
                <td className={`p-2 text-right tabular-nums ${totalIn - totalOut >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(totalIn - totalOut)}</td>
                {outCatList.map((c) => {
                  const total = [...monthly.values()].reduce((s, m) => s + (m.outByCategory.get(c) ?? 0), 0);
                  return <td key={c} className="p-2 text-right tabular-nums">{fmtM(total)}</td>;
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Section 3: Top nhận tiền */}
      <section>
        <h2 className="text-lg font-semibold mb-2">👥 Top 15 nhận tiền {year}</h2>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2">Người nhận</th>
                <th className="text-left p-2">Nhóm</th>
                <th className="text-right p-2">Số lần</th>
                <th className="text-right p-2">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {topRecipientsList.map((r) => (
                <tr key={r.name} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-slate-500">{r.category}</td>
                  <td className="p-2 text-right tabular-nums">{r.n}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-xs text-slate-500 italic">
        Sao kê chi tiết từng giao dịch (tham khảo): {" "}
        <Link href="/admin/bank-transactions" className="text-blue-600 hover:underline">
          Xem raw sao kê →
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: "green" | "red" | "blue" | "amber" }) {
  const cls = {
    green: "border-green-200 text-green-700 bg-green-50",
    red: "border-red-200 text-red-700 bg-red-50",
    blue: "border-blue-200 text-blue-700 bg-blue-50",
    amber: "border-amber-200 text-amber-700 bg-amber-50",
  }[color];
  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <div className="text-[11px] uppercase font-semibold tracking-wide">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
