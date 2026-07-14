import { db } from "@/lib/db";
import { projects, partners } from "@/lib/schema";
import { contractStatusLabel, fmtMoney, fmtPct, displayPartnerName, isSecondaryPartner } from "@/lib/format";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const rows = await db
    .select({
      id: projects.id,
      code: projects.code,
      fullCode: projects.fullCode,
      name: projects.name,
      partnerName: partners.name,
      breRole: projects.breRole,
      contractStatus: projects.contractStatus,
      brokerageRate: projects.brokerageRate,
      brokerageRateSale: projects.brokerageRateSale,
      adminFee: projects.adminFee,
    })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name))
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Dự án / Hợp đồng</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý HĐ ký với CĐT/F1, cấu hình %PMG và biểu PMG theo mốc.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"
        >
          + Thêm dự án
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Mã DA</th>
              <th className="text-left p-3">Tên dự án</th>
              <th className="text-left p-3">Đối tác</th>
              <th className="text-left p-3">Vai trò BRE</th>
              <th className="text-right p-3">%PMG_LK</th>
              <th className="text-right p-3">%PMG_sale</th>
              <th className="text-right p-3">Phí admin</th>
              <th className="text-left p-3">Tình trạng</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-mono text-xs">{p.fullCode}</td>
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-slate-500">
                  {displayPartnerName(p.partnerName) || <span className="text-slate-300">—</span>}
                </td>
                <td className="p-3">
                  {isSecondaryPartner(p.partnerName) ? (
                    <span className="text-xs px-2 py-1 rounded-md bg-orange-100 text-orange-700">
                      Thứ cấp
                    </span>
                  ) : (
                    <span
                      className={`text-xs px-2 py-1 rounded-md ${
                        p.breRole === "f1"
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {p.breRole === "f1" ? "BRE = F1" : "BRE = F2"}
                    </span>
                  )}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {Number(p.brokerageRate ?? 0) > 0 ? fmtPct(p.brokerageRate) : <span className="text-slate-300">—</span>}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {Number(p.brokerageRateSale ?? 0) > 0 ? fmtPct(p.brokerageRateSale) : <span className="text-slate-300">—</span>}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {Number(p.adminFee ?? 0) > 0 ? fmtMoney(p.adminFee) : <span className="text-slate-300">—</span>}
                </td>
                <td className="p-3 text-xs">{contractStatusLabel(p.contractStatus ?? "")}</td>
                <td className="p-3 text-right">
                  <Link href={`/projects/${p.id}`} className="text-blue-600 hover:underline text-sm">
                    Sửa
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có dự án nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
