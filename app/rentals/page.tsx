import { db } from "@/lib/db";
import { rentals } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default async function RentalsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  const rows = await db.select().from(rentals).orderBy(desc(rentals.contractDate));

  const active = rows.filter((r) => r.status === "active").length;
  const totalFee = rows.reduce((s, r) => s + Number(r.totalFee ?? 0), 0);
  const totalCompany = rows.reduce((s, r) => s + Number(r.companyAmount ?? 0), 0);
  const totalCommission = rows.reduce((s, r) => s + Number(r.commissionAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cho thuê</h1>
          <p className="text-sm text-slate-500 mt-1">
            Môi giới cho thuê căn hộ — phễu lấy khách hàng để bán sơ cấp.
          </p>
        </div>
        <Link href="/rentals/new" className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium">
          + Thêm HĐ thuê
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="HĐ thuê" value={String(rows.length)} sub={`${active} đang hoạt động`} />
        <StatCard label="Tổng phí HH" value={fmt(totalFee)} />
        <StatCard label="Cty ăn" value={fmt(totalCompany)} color="green" />
        <StatCard label="NV giữ" value={fmt(totalCommission)} color="blue" />
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Ngày HĐ</th>
              <th className="text-left p-2">Mã căn / Dự án</th>
              <th className="text-left p-2">Chủ nhà</th>
              <th className="text-left p-2">Khách thuê</th>
              <th className="text-right p-2">Giá/tháng</th>
              <th className="text-right p-2">Kỳ hạn</th>
              <th className="text-right p-2">Tổng phí</th>
              <th className="text-right p-2">NV giữ</th>
              <th className="text-right p-2">Cty ăn</th>
              <th className="text-center p-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-2 font-mono">{r.contractDate}</td>
                <td className="p-2">
                  <div className="font-semibold">{r.unitCode}</div>
                  <div className="text-slate-500 text-[10px]">{r.projectName ?? ""}</div>
                </td>
                <td className="p-2">{r.landlordName ?? "—"}</td>
                <td className="p-2">{r.tenantName}</td>
                <td className="p-2 text-right tabular-nums">{fmt(Number(r.monthlyRent))}</td>
                <td className="p-2 text-right">{r.leaseTermMonths}T</td>
                <td className="p-2 text-right tabular-nums font-semibold">{fmt(Number(r.totalFee))}</td>
                <td className="p-2 text-right tabular-nums text-blue-700">{fmt(Number(r.commissionAmount))}</td>
                <td className="p-2 text-right tabular-nums text-green-700">{fmt(Number(r.companyAmount))}</td>
                <td className="p-2 text-center">
                  <StatusBadge status={r.status ?? "active"} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-500">Chưa có HĐ. Bấm "+ Thêm HĐ thuê".</td>
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

function StatusBadge({ status }: { status: string }) {
  const cls = status === "active" ? "bg-green-100 text-green-700" : status === "ended" ? "bg-slate-100 text-slate-600" : "bg-red-100 text-red-700";
  const label = status === "active" ? "Đang thuê" : status === "ended" ? "Đã kết thúc" : "Hủy";
  return <span className={`text-[10px] px-2 py-0.5 rounded ${cls}`}>{label}</span>;
}
