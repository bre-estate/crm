"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  previewImport,
  applyImport,
  clearAllTransactions,
  type ImportPreview,
} from "@/lib/actions/finance-import";

type SourceType = "thanh-toan" | "merged" | "tam-ung";

const SOURCE_META: Record<SourceType, { label: string; hint: string }> = {
  "thanh-toan": {
    label: "Sổ thanh toán (TK cty)",
    hint: 'Sheet "1.1-Đề nghị thanh toán", data từ row 12.',
  },
  merged: {
    label: "Chi phí cá nhân MERGED (Triết + Bách)",
    hint: 'Sheet "Triết" + "Bách", cột A=tháng.',
  },
  "tam-ung": {
    label: "Sổ tạm ứng (Nga + Tường Vi)",
    hint: 'Sheet "Nga_HR" + "Tường Vi_admin".',
  },
};

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default function ImportClient() {
  const router = useRouter();
  const [type, setType] = useState<SourceType>("thanh-toan");
  const [fileB64, setFileB64] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pending, start] = useTransition();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    setFileB64(b64);
    setPreview(null);
  };

  const doPreview = () => {
    if (!fileB64) {
      toast.error("Chọn file trước");
      return;
    }
    start(async () => {
      try {
        const p = await previewImport(type, fileB64);
        setPreview(p);
        toast.success(`Đọc ${p.total} rows, ${p.dupCount} trùng (sẽ skip)`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi preview");
      }
    });
  };

  const doApply = () => {
    if (!fileB64 || !preview) return;
    if (
      !confirm(
        `Nạp ${preview.total - preview.dupCount} dòng mới vào cơ sở dữ liệu?\n(${preview.dupCount} dòng trùng sẽ bị bỏ qua.)`,
      )
    )
      return;
    start(async () => {
      try {
        const r = await applyImport(type, fileB64);
        toast.success(`Đã nạp ${r.inserted}, bỏ qua ${r.skipped}`);
        setFileB64(null);
        setFileName("");
        setPreview(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi nạp");
      }
    });
  };

  const doClearAll = () => {
    if (
      !confirm(
        "XÓA TOÀN BỘ giao dịch tài chính trong cơ sở dữ liệu?\nHành động không hoàn tác được.\nDùng khi muốn nạp lại từ đầu.",
      )
    )
      return;
    start(async () => {
      try {
        const r = await clearAllTransactions();
        toast.success(`Đã xóa ${r.deleted} dòng`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi xóa");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Loại file</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as SourceType);
                setPreview(null);
              }}
              className="input min-w-64"
            >
              {(Object.keys(SOURCE_META) as SourceType[]).map((k) => (
                <option key={k} value={k}>
                  {SOURCE_META[k].label}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-slate-500 mt-1">{SOURCE_META[type].hint}</div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">File Excel</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={onFileChange}
              className="text-sm"
            />
            {fileName && <div className="text-xs text-slate-500 mt-1">{fileName}</div>}
          </div>
          <button
            type="button"
            onClick={doPreview}
            disabled={!fileB64 || pending}
            className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200 disabled:opacity-50"
          >
            {pending ? "Đang xử lý..." : "Xem thử"}
          </button>
        </div>
      </div>

      {preview && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-semibold">
                Xem thử — {preview.total} dòng, {preview.dupCount} trùng
              </h2>
              <div className="text-xs text-slate-500">
                Nguồn: {Object.entries(preview.bySource).map(([k, v]) => `${k}:${v}`).join(", ")}
              </div>
            </div>
            <button
              type="button"
              onClick={doApply}
              disabled={pending || preview.total === preview.dupCount}
              className="bg-orange-500 text-white rounded-lg px-6 py-2 text-sm hover:bg-orange-600 disabled:opacity-50"
            >
              {pending
                ? "Đang nạp..."
                : `Nạp ${preview.total - preview.dupCount} dòng mới`}
            </button>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Theo nhóm quản lý</div>
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 text-xs">
                <tr>
                  <th className="text-left p-2">Nhóm</th>
                  <th className="text-right p-2">Số dòng</th>
                  <th className="text-right p-2">Tổng (VND)</th>
                </tr>
              </thead>
              <tbody>
                {preview.byGroup.map((g) => (
                  <tr key={g.group} className="border-t border-slate-100">
                    <td className="p-2">{g.group}</td>
                    <td className="p-2 text-right tabular-nums">{g.count}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(g.sum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">
              20 dòng đầu (⚠ = trùng, sẽ bỏ qua)
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-2">Ngày</th>
                    <th className="text-left p-2">Chi tiết</th>
                    <th className="text-right p-2">VND</th>
                    <th className="text-left p-2">Nhóm</th>
                    <th className="text-left p-2">TK</th>
                    <th className="text-left p-2">Người</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r, i) => (
                    <tr
                      key={i}
                      className={`border-t border-slate-100 ${r.isDup ? "bg-amber-50" : ""}`}
                    >
                      <td className="p-2 font-mono">{r.transactionDate}</td>
                      <td className="p-2">
                        {r.isDup && <span title="Đã có trong cơ sở dữ liệu">⚠ </span>}
                        {r.description.slice(0, 60)}
                      </td>
                      <td className="p-2 text-right tabular-nums">{fmt(r.amount)}</td>
                      <td className="p-2">{r.managementGroup}</td>
                      <td className="p-2 font-mono">{r.categoryCode}</td>
                      <td className="p-2">{r.payer ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="text-xs font-semibold text-red-800 mb-1">Vùng nguy hiểm</div>
        <p className="text-xs text-red-700 mb-2">
          Xóa toàn bộ giao dịch tài chính đã nạp. Dùng khi muốn nạp lại từ đầu
          (VD file Excel có thay đổi cấu trúc).
        </p>
        <button
          type="button"
          onClick={doClearAll}
          disabled={pending}
          className="bg-red-600 text-white rounded-lg px-4 py-2 text-xs hover:bg-red-700 disabled:opacity-50"
        >
          Xóa toàn bộ giao dịch
        </button>
      </div>
    </div>
  );
}
