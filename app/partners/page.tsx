import { db } from "@/lib/db";
import { partners } from "@/lib/schema";
import { partnerTypeLabel } from "@/lib/format";
import Link from "next/link";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const rows = await db.select().from(partners).orderBy(asc(partners.type), asc(partners.name));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Đối tác</h1>
          <p className="text-sm text-slate-500 mt-1">
            Chủ đầu tư, sàn F1 (sàn trên), sàn F2 (sàn/CTV dưới).
          </p>
        </div>
        <Link
          href="/partners/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          + Thêm đối tác
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Mã</th>
              <th className="text-left p-3">Tên</th>
              <th className="text-left p-3">Loại</th>
              <th className="text-left p-3">Pháp nhân</th>
              <th className="text-left p-3">MST</th>
              <th className="text-left p-3">Email</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-mono text-xs">{p.code}</td>
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">
                  <span
                    className={`text-xs px-2 py-1 rounded-md ${
                      p.type === "cdt"
                        ? "bg-blue-100 text-blue-700"
                        : p.type === "f1"
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {partnerTypeLabel(p.type)}
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-600">{p.legalName ?? "—"}</td>
                <td className="p-3 font-mono text-xs">{p.taxCode ?? "—"}</td>
                <td className="p-3 text-xs">{p.email ?? "—"}</td>
                <td className="p-3 text-right">
                  <Link
                    href={`/partners/${p.id}`}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Sửa
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có đối tác nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
