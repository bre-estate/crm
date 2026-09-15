/**
 * A/R aging — Phí môi giới đã bán nhưng chưa thu về, chia hai nhóm:
 *  A. Đã ra đối chiếu, CĐT chưa trả đủ — revenue_reconciliations − payments_in, tuổi theo ngày đối chiếu.
 *  B. Chưa tới đợt đối chiếu — products.total_revenue − tổng đối chiếu, tuổi theo ngày cọc.
 * Cả hai trường đều tính gồm VAT nên trừ trực tiếp được (xác minh 16/09/2026: căn tất toán xong ra đúng tỷ lệ 1,000).
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtD = (d: string) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d || "");

interface AgingRow {
  partner: string;
  count: number;
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b91: number;
  total: number;
}

interface PendingRow {
  partner: string;
  project: string;
  count: number;
  expected: number;
  reconciled: number;
  b3: number;
  b6: number;
  b12: number;
  b12plus: number;
  total: number;
}

interface PendingUnit {
  id: number;
  project: string;
  unitCode: string;
  customer: string | null;
  depositDate: string;
  expected: number;
  reconciled: number;
  paid: number;
  remaining: number;
}

export default async function ARAgingPage() {
  await requirePermission("reports.ar-aging");

  // Ngày chốt: hôm nay
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db.execute(sql`
    WITH recon AS (
      SELECT
        r.id,
        COALESCE(pa_inv.name, pa_pj.name, 'Không rõ') AS partner,
        r.reconciliation_date,
        r.total_receivable_this_time,
        COALESCE((SELECT SUM(amount) FROM payments_in pi WHERE pi.reconciliation_id = r.id), 0) AS paid
      FROM revenue_reconciliations r
      LEFT JOIN products p ON p.id = r.product_id
      LEFT JOIN projects pj ON pj.id = p.project_id
      LEFT JOIN partners pa_pj ON pa_pj.id = pj.partner_id
      LEFT JOIN invoices i ON i.id = r.invoice_id
      LEFT JOIN partners pa_inv ON pa_inv.id = i.partner_id
      WHERE r.total_receivable_this_time > 0
    )
    SELECT
      partner,
      COUNT(*)::int AS count,
      SUM(CASE WHEN (${today}::date - reconciliation_date::date) <= 30
        THEN GREATEST(0, total_receivable_this_time - paid) ELSE 0 END)::float8 AS b0_30,
      SUM(CASE WHEN (${today}::date - reconciliation_date::date) BETWEEN 31 AND 60
        THEN GREATEST(0, total_receivable_this_time - paid) ELSE 0 END)::float8 AS b31_60,
      SUM(CASE WHEN (${today}::date - reconciliation_date::date) BETWEEN 61 AND 90
        THEN GREATEST(0, total_receivable_this_time - paid) ELSE 0 END)::float8 AS b61_90,
      SUM(CASE WHEN (${today}::date - reconciliation_date::date) > 90
        THEN GREATEST(0, total_receivable_this_time - paid) ELSE 0 END)::float8 AS b91,
      SUM(GREATEST(0, total_receivable_this_time - paid))::float8 AS total
    FROM recon
    GROUP BY partner
    HAVING SUM(GREATEST(0, total_receivable_this_time - paid)) > 0
    ORDER BY total DESC
  `) as any[];

  // Các đợt phí môi giới chưa ra đối chiếu. Tuổi tính từ ngày cọc vì chưa có ngày đối chiếu.
  const pendingRows = await db.execute(sql`
    WITH u AS (
      SELECT
        p.id,
        COALESCE(pa_pj.name, 'Không rõ') AS partner,
        COALESCE(pj.name, 'Không rõ') AS project,
        p.deposit_date,
        p.total_revenue,
        COALESCE((SELECT SUM(r.total_receivable_this_time) FROM revenue_reconciliations r WHERE r.product_id = p.id), 0) AS dc
      FROM products p
      LEFT JOIN projects pj ON pj.id = p.project_id
      LEFT JOIN partners pa_pj ON pa_pj.id = pj.partner_id
      WHERE p.total_revenue > 0 AND p.deposit_date IS NOT NULL AND p.deposit_date <> ''
    ), con AS (
      SELECT *, GREATEST(0, total_revenue - dc) AS remaining,
        (${today}::date - deposit_date::date) AS tuoi
      FROM u
    )
    SELECT partner, project,
      COUNT(*)::int AS count,
      SUM(total_revenue)::float8 AS expected,
      SUM(dc)::float8 AS reconciled,
      SUM(CASE WHEN tuoi <= 90 THEN remaining ELSE 0 END)::float8 AS b3,
      SUM(CASE WHEN tuoi BETWEEN 91 AND 180 THEN remaining ELSE 0 END)::float8 AS b6,
      SUM(CASE WHEN tuoi BETWEEN 181 AND 365 THEN remaining ELSE 0 END)::float8 AS b12,
      SUM(CASE WHEN tuoi > 365 THEN remaining ELSE 0 END)::float8 AS b12plus,
      SUM(remaining)::float8 AS total
    FROM con
    WHERE remaining > 1000
    GROUP BY partner, project
    ORDER BY total DESC
  `) as any[];

  const pendingUnitRows = await db.execute(sql`
    SELECT p.id, COALESCE(pj.name, 'Không rõ') AS project, p.unit_code, p.customer_name, p.deposit_date,
      p.total_revenue::float8 AS expected,
      COALESCE((SELECT SUM(r.total_receivable_this_time) FROM revenue_reconciliations r WHERE r.product_id = p.id), 0)::float8 AS reconciled,
      COALESCE((SELECT SUM(pi.amount) FROM payments_in pi
        JOIN revenue_reconciliations r ON r.id = pi.reconciliation_id WHERE r.product_id = p.id), 0)::float8 AS paid
    FROM products p
    LEFT JOIN projects pj ON pj.id = p.project_id
    WHERE p.total_revenue > 0 AND p.deposit_date IS NOT NULL AND p.deposit_date <> ''
      AND p.total_revenue - COALESCE((SELECT SUM(r.total_receivable_this_time) FROM revenue_reconciliations r WHERE r.product_id = p.id), 0) > 1000
    ORDER BY (p.total_revenue - COALESCE((SELECT SUM(r.total_receivable_this_time) FROM revenue_reconciliations r WHERE r.product_id = p.id), 0)) DESC
  `) as any[];

  const aging: AgingRow[] = rows.map(r => ({
    partner: String(r.partner),
    count: Number(r.count),
    b0_30: Number(r.b0_30 ?? 0),
    b31_60: Number(r.b31_60 ?? 0),
    b61_90: Number(r.b61_90 ?? 0),
    b91: Number(r.b91 ?? 0),
    total: Number(r.total ?? 0),
  }));

  const pending: PendingRow[] = pendingRows.map(r => ({
    partner: String(r.partner),
    project: String(r.project),
    count: Number(r.count),
    expected: Number(r.expected ?? 0),
    reconciled: Number(r.reconciled ?? 0),
    b3: Number(r.b3 ?? 0),
    b6: Number(r.b6 ?? 0),
    b12: Number(r.b12 ?? 0),
    b12plus: Number(r.b12plus ?? 0),
    total: Number(r.total ?? 0),
  }));

  const pendingUnits: PendingUnit[] = pendingUnitRows.map(r => ({
    id: Number(r.id),
    project: String(r.project),
    unitCode: String(r.unit_code ?? ""),
    customer: r.customer_name ? String(r.customer_name) : null,
    depositDate: String(r.deposit_date ?? ""),
    expected: Number(r.expected ?? 0),
    reconciled: Number(r.reconciled ?? 0),
    paid: Number(r.paid ?? 0),
    remaining: Number(r.expected ?? 0) - Number(r.reconciled ?? 0),
  }));

  const totals = aging.reduce((acc, r) => ({
    count: acc.count + r.count,
    b0_30: acc.b0_30 + r.b0_30,
    b31_60: acc.b31_60 + r.b31_60,
    b61_90: acc.b61_90 + r.b61_90,
    b91: acc.b91 + r.b91,
    total: acc.total + r.total,
  }), { count: 0, b0_30: 0, b31_60: 0, b61_90: 0, b91: 0, total: 0 });

  const pTotals = pending.reduce((acc, r) => ({
    count: acc.count + r.count,
    expected: acc.expected + r.expected,
    reconciled: acc.reconciled + r.reconciled,
    b3: acc.b3 + r.b3,
    b6: acc.b6 + r.b6,
    b12: acc.b12 + r.b12,
    b12plus: acc.b12plus + r.b12plus,
    total: acc.total + r.total,
  }), { count: 0, expected: 0, reconciled: 0, b3: 0, b6: 0, b12: 0, b12plus: 0, total: 0 });

  const tongChuaThu = totals.total + pTotals.total;
  const quaHan = totals.b61_90 + totals.b91 + pTotals.b12 + pTotals.b12plus;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">← Báo cáo</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Phí môi giới đã bán chưa thu</h1>
        <p className="text-sm text-slate-500 mt-1">
          Hàng đã bán nhưng tiền chưa về, chia hai nhóm theo mức độ đòi được: đã ra đối chiếu mà CĐT chưa trả, và các đợt chưa tới lượt đối chiếu.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Tổng chưa thu" value={tongChuaThu} color="orange" bold />
        <SummaryCard label="Đã đối chiếu, CĐT chưa trả" value={totals.total} color="red" />
        <SummaryCard label="Chưa tới đợt đối chiếu" value={pTotals.total} color="amber" />
        <SummaryCard label="Đã quá lâu, cần hối" value={quaHan} color="red" />
      </div>

      {/* ── A. Đã đối chiếu ────────────────────────────────────────── */}
      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold">A. Đã ra đối chiếu, CĐT chưa trả đủ</h2>
          <p className="text-xs text-slate-500">Có chứng từ đối chiếu rồi nên đòi được ngay. Tuổi tính từ ngày đối chiếu.</p>
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left p-2">CĐT / Đối tác</th>
                <th className="text-right p-2 w-16">Số ĐC</th>
                <th className="text-right p-2">0-30</th>
                <th className="text-right p-2">31-60</th>
                <th className="text-right p-2">61-90</th>
                <th className="text-right p-2">&gt;90</th>
                <th className="text-right p-2 border-l">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {aging.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">Không có đối chiếu nào còn phải thu.</td></tr>
              )}
              {aging.map(r => (
                <tr key={r.partner} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-medium">{r.partner}</td>
                  <td className="p-2 text-right text-xs text-slate-500">{r.count}</td>
                  <td className="p-2 text-right tabular-nums text-green-700">{r.b0_30 > 0 ? fmt(r.b0_30) : ""}</td>
                  <td className="p-2 text-right tabular-nums text-amber-700">{r.b31_60 > 0 ? fmt(r.b31_60) : ""}</td>
                  <td className="p-2 text-right tabular-nums text-orange-700">{r.b61_90 > 0 ? fmt(r.b61_90) : ""}</td>
                  <td className="p-2 text-right tabular-nums text-red-700 font-semibold">{r.b91 > 0 ? fmt(r.b91) : ""}</td>
                  <td className="p-2 text-right tabular-nums font-bold border-l">{fmt(r.total)}</td>
                </tr>
              ))}
              {aging.length > 0 && (
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                  <td className="p-2">TỔNG</td>
                  <td className="p-2 text-right text-xs">{totals.count}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(totals.b0_30)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(totals.b31_60)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(totals.b61_90)}</td>
                  <td className="p-2 text-right tabular-nums text-red-700">{fmt(totals.b91)}</td>
                  <td className="p-2 text-right tabular-nums border-l">{fmt(totals.total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── B. Chưa tới đợt đối chiếu ──────────────────────────────── */}
      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold">B. Chưa tới đợt đối chiếu</h2>
          <p className="text-xs text-slate-500">
            Phần phí môi giới còn lại của những căn đã bán, chưa ra chứng từ đợt nào. Chưa đòi được ngay, nhưng căn nào cọc đã lâu mà chưa ra đối chiếu thì nên hỏi CĐT. Tuổi tính từ ngày cọc.
          </p>
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left p-2">CĐT / Đối tác</th>
                <th className="text-left p-2">Dự án</th>
                <th className="text-right p-2 w-16">Số căn</th>
                <th className="text-right p-2">Trong 3 tháng</th>
                <th className="text-right p-2">3-6 tháng</th>
                <th className="text-right p-2">6-12 tháng</th>
                <th className="text-right p-2">&gt;12 tháng</th>
                <th className="text-right p-2 border-l">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500">Mọi căn đã ra đối chiếu đủ.</td></tr>
              )}
              {pending.map(r => (
                <tr key={`${r.partner}|${r.project}`} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-medium">{r.partner}</td>
                  <td className="p-2 text-slate-600">{r.project}</td>
                  <td className="p-2 text-right text-xs text-slate-500">{r.count}</td>
                  <td className="p-2 text-right tabular-nums text-green-700">{r.b3 > 0 ? fmt(r.b3) : ""}</td>
                  <td className="p-2 text-right tabular-nums text-amber-700">{r.b6 > 0 ? fmt(r.b6) : ""}</td>
                  <td className="p-2 text-right tabular-nums text-orange-700">{r.b12 > 0 ? fmt(r.b12) : ""}</td>
                  <td className="p-2 text-right tabular-nums text-red-700 font-semibold">{r.b12plus > 0 ? fmt(r.b12plus) : ""}</td>
                  <td className="p-2 text-right tabular-nums font-bold border-l">{fmt(r.total)}</td>
                </tr>
              ))}
              {pending.length > 0 && (
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                  <td className="p-2" colSpan={2}>TỔNG</td>
                  <td className="p-2 text-right text-xs">{pTotals.count}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(pTotals.b3)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(pTotals.b6)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(pTotals.b12)}</td>
                  <td className="p-2 text-right tabular-nums text-red-700">{fmt(pTotals.b12plus)}</td>
                  <td className="p-2 text-right tabular-nums border-l">{fmt(pTotals.total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pendingUnits.length > 0 && (
          <details className="bg-card rounded-xl ring-1 ring-foreground/10 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Chi tiết {pendingUnits.length} căn còn đợt chưa đối chiếu
            </summary>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="text-left p-2">Dự án</th>
                    <th className="text-left p-2">Căn</th>
                    <th className="text-left p-2">Khách</th>
                    <th className="text-right p-2 w-24">Ngày cọc</th>
                    <th className="text-right p-2">Phí dự kiến</th>
                    <th className="text-right p-2">Đã đối chiếu</th>
                    <th className="text-right p-2">Đã thu</th>
                    <th className="text-right p-2 border-l">Chưa đối chiếu</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUnits.map(u => (
                    <tr key={u.id} className="border-t hover:bg-slate-50">
                      <td className="p-2 text-slate-600">{u.project}</td>
                      <td className="p-2 font-medium">
                        <Link href={`/products/${u.id}`} className="text-blue-600 hover:underline">{u.unitCode}</Link>
                      </td>
                      <td className="p-2 text-slate-600">{u.customer ?? ""}</td>
                      <td className="p-2 text-right text-xs text-slate-500 tabular-nums">{fmtD(u.depositDate)}</td>
                      <td className="p-2 text-right tabular-nums">{fmt(u.expected)}</td>
                      <td className="p-2 text-right tabular-nums text-slate-600">{fmt(u.reconciled)}</td>
                      <td className="p-2 text-right tabular-nums text-green-700">{fmt(u.paid)}</td>
                      <td className="p-2 text-right tabular-nums font-semibold border-l">{fmt(u.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <div className="text-xs text-slate-500 italic space-y-1">
        <p>Nhóm A: <b>revenue_reconciliations</b> trừ <b>payments_in</b>, chỉ hiện CĐT còn phải thu lớn hơn 0.</p>
        <p>Nhóm B: <b>products.total_revenue</b> trừ tổng đối chiếu của căn đó. Hai trường này cùng gồm VAT nên trừ thẳng được. Số dự kiến lấy theo bảng kê căn nên có thể đổi nếu CĐT điều chỉnh giá hoặc mức phí môi giới.</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  const cls: Record<string, string> = {
    orange: "bg-orange-50 border-orange-200 text-orange-800",
    green: "bg-green-50 border-green-200 text-green-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[color]}`}>
      <div className="text-[11px] uppercase tracking-wide font-semibold">{label}</div>
      <div className={`tabular-nums mt-1 ${bold ? "text-2xl font-bold" : "text-lg font-semibold"}`}>{fmt(value)}</div>
    </div>
  );
}
