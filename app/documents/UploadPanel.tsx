"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { baoLoi } from "@/lib/bao-loi";
import { cauLoi } from "@/lib/actions/ket-qua";
import { ghiNhanTaiLieu } from "@/lib/actions/documents";
import { nenAnhNeuCan } from "@/lib/nen-anh";
import {
  ACCEPT_BY_TYPE,
  DOC_TYPES,
  MAX_UPLOAD_BYTES,
  NGUONG_NEN_BYTES,
  duongDanKho,
  fmtDungLuong,
  tyLeNen,
  type DocType,
} from "@/lib/documents-core";

const BUCKET = "tai-lieu";

export default function UploadPanel({ driveDangBat }: { driveDangBat: boolean }) {
  const router = useRouter();
  const [dangChay, start] = useTransition();
  const [docType, setDocType] = useState<DocType>("sao_ke");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("");
  const [note, setNote] = useState("");
  const [tienTrinh, setTienTrinh] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chonFile = (f: File | null) => {
    setFile(f);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const nang = file && file.size >= NGUONG_NEN_BYTES;
  const laPdf = file?.type === "application/pdf";
  const quaLon = file && file.size > MAX_UPLOAD_BYTES;

  const dongLai = () => {
    setFile(null);
    setTitle("");
    setPeriod("");
    setNote("");
    setTienTrinh(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const taiLen = () => {
    if (!file) return;
    if (quaLon) {
      toast.error(
        `File nặng ${fmtDungLuong(file.size)}, vượt mức cho phép ${fmtDungLuong(MAX_UPLOAD_BYTES)}. Scan lại ở độ phân giải thấp hơn rồi thử lại.`,
        { duration: 10000 },
      );
      return;
    }
    start(async () => {
      try {
        setTienTrinh("Đang chuẩn bị file");
        const { file: fileGui, daNen, dungLuongGoc } = await nenAnhNeuCan(file, NGUONG_NEN_BYTES);
        if (daNen) {
          const ty = tyLeNen(dungLuongGoc, fileGui.size);
          toast.success(
            `Đã nén ${fmtDungLuong(dungLuongGoc)} còn ${fmtDungLuong(fileGui.size)}` +
              (ty ? `, nhỏ đi ${ty.toFixed(1)} lần` : ""),
          );
        }

        setTienTrinh("Đang tải lên kho");
        const storagePath = duongDanKho(docType, fileGui.name);
        const supabase = createClient();
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, fileGui, { contentType: fileGui.type || "application/octet-stream" });
        if (error) throw new Error(`Không tải lên được kho: ${error.message}`);

        setTienTrinh("Đang ghi vào danh sách");
        const kq = await ghiNhanTaiLieu({
          storagePath,
          docType,
          title,
          note,
          period,
          mimeType: fileGui.type || "application/octet-stream",
          sizeBytes: fileGui.size,
          originalSizeBytes: daNen ? dungLuongGoc : null,
          compressed: daNen,
        });
        if (baoLoi(kq)) return;

        toast.success(`Đã lưu "${title}" vào kho tài liệu`);
        dongLai();
        router.refresh();
      } catch (e) {
        toast.error(cauLoi(e), { duration: 10000 });
      } finally {
        setTienTrinh(null);
      }
    });
  };

  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold">Tải tài liệu lên</h2>
        <span className="text-xs text-slate-500">
          {driveDangBat
            ? "Bản chính lưu trong app, bản sao đẩy lên Google Drive"
            : "Bản chính lưu trong app. Google Drive chưa bật, xem phần Cài đặt ▸ Tích hợp"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="text-sm space-y-1">
          <span className="text-xs text-slate-500">Loại tài liệu</span>
          <select
            className="input w-full"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
          >
            {Object.entries(DOC_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm space-y-1 md:col-span-2">
          <span className="text-xs text-slate-500">Tên tài liệu</span>
          <input
            className="input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="vd: Sao kê Techcombank quý 3 năm 2026"
          />
        </label>

        <label className="text-sm space-y-1">
          <span className="text-xs text-slate-500">Kỳ (không bắt buộc)</span>
          <input
            className="input w-full"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026-Q3"
          />
        </label>
      </div>

      <label className="text-sm space-y-1 block">
        <span className="text-xs text-slate-500">Ghi chú (không bắt buộc)</span>
        <input
          className="input w-full"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="vd: bản Admin xuất lại ngày 20/09, đã gồm phần đầu tháng 9"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_BY_TYPE[docType] || undefined}
          onChange={(e) => chonFile(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm hover:file:bg-slate-200"
        />
        {file && <span className="text-xs text-slate-500">{fmtDungLuong(file.size)}</span>}
      </div>

      {quaLon && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          File nặng {fmtDungLuong(file.size)}, vượt mức cho phép {fmtDungLuong(MAX_UPLOAD_BYTES)}. Scan
          lại ở độ phân giải thấp hơn rồi thử lại.
        </p>
      )}

      {!quaLon && nang && laPdf && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          File PDF này nặng {fmtDungLuong(file.size)}. Nếu là bản scan thì thường do máy scan lưu ảnh
          không nén. Scan lại ở mức 150 DPI đen trắng sẽ nhỏ đi khoảng 10 lần mà chữ vẫn đọc rõ. Bản này
          chưa tự nén được PDF nên tải lên sẽ giữ nguyên dung lượng.
        </p>
      )}

      {!quaLon && nang && !laPdf && file?.type.startsWith("image/") && (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
          Ảnh này nặng {fmtDungLuong(file.size)}, sẽ được nén lại trước khi tải lên.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={taiLen} disabled={!file || !title.trim() || dangChay || !!quaLon}>
          {dangChay ? (tienTrinh ?? "Đang xử lý") : "Tải lên"}
        </Button>
        {file && !dangChay && (
          <Button variant="outline" onClick={dongLai}>
            Bỏ chọn
          </Button>
        )}
      </div>
    </div>
  );
}
