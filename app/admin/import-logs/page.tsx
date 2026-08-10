/**
 * /admin/import-logs — audit history mọi import script chạy.
 * Yêu cầu Chủ tịch: trace ai/khi nào/tạo bao nhiêu record để không lặp lại bug orphan invoice.
 */
import { db } from "@/lib/db";
import { importLogs } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";
const fmt = (n: number | null | undefined) => n == null ? "0" : Math.round(n).toLocaleString("vi-VN");
const fmtTime = (t: Date | null) => t ? new Date(t).toLocaleString("vi-VN", { hour12: false }) : "—";

export default async function ImportLogsPage() {
  await requirePermission("admin.activity");

  const rows = await db.select().from(importLogs).orderBy(desc(importLogs.startedAt)).limit(200);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Nhật ký import</h1>
        <p className="text-sm text-slate-500 mt-1">
          Trace mọi lần chạy script import Excel/CSV vào DB. Chỉ hiển thị 200 lần gần nhất.
        </p>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white text-xs">
            <tr>
              <th className="text-left p-2">Bắt đầu</th>
              <th className="text-left p-2">Kết thúc</th>
              <th className="text-left p-2">Script</th>
              <th className="text-left p-2">File nguồn</th>
              <th className="text-left p-2">Table đích</th>
              <th className="text-center p-2">Trạng thái</th>
              <th className="text-right p-2">Tạo</th>
              <th className="text-right p-2">Update</th>
              <th className="text-right p-2">Skip</th>
              <th className="text-right p-2">Lỗi</th>
              <th className="text-left p-2">Người chạy</th>
              <th className="text-left p-2">Ghi chú lỗi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={12} className="p-8 text-center text-slate-500">Chưa có import log nào — script import chưa được retrofit hoặc chưa chạy.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className={`border-t ${r.status === "failed" ? "bg-red-50" : r.status === "running" ? "bg-amber-50" : ""}`}>
                <td className="p-2 text-xs whitespace-nowrap">{fmtTime(r.startedAt)}</td>
                <td className="p-2 text-xs whitespace-nowrap text-slate-500">{fmtTime(r.finishedAt)}</td>
                <td className="p-2 font-mono text-xs">{r.scriptName}</td>
                <td className="p-2 text-xs">{r.sourceFile ?? "—"}</td>
                <td className="p-2 text-xs text-slate-500">{r.targetTable ?? "—"}</td>
                <td className="p-2 text-center">
                  {r.status === "success" && <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs">✓ OK</span>}
                  {r.status === "running" && <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs">▶ đang chạy</span>}
                  {r.status === "failed" && <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs">✗ lỗi</span>}
                </td>
                <td className="p-2 text-right tabular-nums text-green-700 font-semibold">{fmt(r.recordsCreated)}</td>
                <td className="p-2 text-right tabular-nums text-blue-700">{fmt(r.recordsUpdated)}</td>
                <td className="p-2 text-right tabular-nums text-slate-500">{fmt(r.recordsSkipped)}</td>
                <td className="p-2 text-right tabular-nums text-red-700">{fmt(r.recordsError)}</td>
                <td className="p-2 text-xs">{r.runBy ?? "—"}</td>
                <td className="p-2 text-xs text-red-700 max-w-xs truncate" title={r.errorMessage ?? ""}>{r.errorMessage ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 italic space-y-1">
        <p>💡 Log tự động ghi khi script import chạy (retrofit với <code>runWithImportLog()</code> trong <code>lib/import-log.ts</code>).</p>
        <p>💡 Trạng thái: <b>OK</b> = thành công, <b>đang chạy</b> = chưa kết thúc (có thể crash), <b>lỗi</b> = throw exception.</p>
      </div>
    </div>
  );
}
