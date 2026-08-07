import { db } from "@/lib/db";
import { secondarySales } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default async function SecondarySalesPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  const rows = await db.select().from(secondarySales).orderBy(desc(secondarySales.depositDate));

  const totalFee = rows.reduce((s, r) => s + Number(r.totalFee ?? 0), 0);
  const totalCompany = rows.reduce((s, r) => s + Number(r.companyAmount ?? 0), 0);
  const totalCommission = rows.reduce((s, r) => s + Number(r.commissionAmount ?? 0), 0);
  const pending = rows.filter((r) => r.settlementStatus === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bán thứ cấp</h1>
          <p className="text-sm text-slate-500 mt-1">
            Giao dịch F2 resale — khách CK phí HH cho NV, NV trích % về cty.
          </p>
        </div>
        <Link
          href="/secondary-sales/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
        >
          + Thêm giao dịch
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={`Tổng giao dịch`} value={String(rows.length)} sub={`${pending} chưa settle`} />
        <StatCard label="Tổng phí HH" value={fmt(totalFee)} sub="Khách CK cho NV" />
        <StatCard label="Lợi nhuận" value={fmt(totalCompany)} sub="Phần cty" color="green" />
        <StatCard label="HH Sale" value={fmt(totalCommission)} sub="Phần NVKD" color="blue" />
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Ngày cọc</th>
              <th className="text-left p-2">Mã căn</th>
              <th className="text-left p-2">Dự án</th>
              <th className="text-left p-2">NVKD</th>
              <th className="text-right p-2">Giá bán</th>
              <th className="text-right p-2">Tổng phí</th>
              <th className="text-right p-2">%HH Sale</th>
              <th className="text-right p-2">HH Sale</th>
              <th className="text-right p-2">Lợi nhuận</th>
              <th className="text-center p-2">Settle</th>
              <th className="text-center p-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-2 font-mono">{r.depositDate ?? "—"}</td>
                <td className="p-2 font-semibold">{r.unitCode}</td>
                <td className="p-2 text-slate-600">{r.projectName ?? "—"}</td>
                <td className="p-2">{r.salesPerson}</td>
                <td className="p-2 text-right tabular-nums">{fmt(Number(r.sellPrice))}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{fmt(Number(r.totalFee))}</td>
                <td className="p-2 text-right tabular-nums">{(Number(r.commissionRate) * 100).toFixed(0)}%</td>
                <td className="p-2 text-right tabular-nums text-blue-700">{fmt(Number(r.commissionAmount))}</td>
                <td className="p-2 text-right tabular-nums text-green-700">{fmt(Number(r.companyAmount))}</td>
                <td className="p-2 text-center">
                  {r.settlementStatus === "settled" ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700">✓ Xong</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">Chờ</span>
                  )}
                </td>
                <td className="p-2 text-center">
                  <Link href={`/secondary-sales/${r.id}/edit`} className="text-xs text-blue-600 hover:underline">
                    Sửa
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-slate-500">Chưa có giao dịch. Bấm "+ Thêm giao dịch".</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: "green" | "blue" }) {
  const cls = color === "green" ? "border-green-200 text-green-700" : color === "blue" ? "border-blue-200 text-blue-700" : "border-slate-200";
  return (
    <div className={`bg-white border rounded-xl p-3 ${cls}`}>
      <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
