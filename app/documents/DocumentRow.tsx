"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { baoLoi } from "@/lib/bao-loi";
import { cauLoi } from "@/lib/actions/ket-qua";
import { linkTaiVe, xoaTaiLieu } from "@/lib/actions/documents";
import { DOC_TYPES, fmtDungLuong, tyLeNen, type DocType } from "@/lib/documents-core";

export type DocRow = {
  id: number;
  docType: string;
  title: string;
  note: string | null;
  period: string | null;
  sizeBytes: number;
  originalSizeBytes: number | null;
  compressed: boolean;
  driveUrl: string | null;
  uploadedBy: string;
  createdAt: string;
};

export default function DocumentRow({ doc, xoaDuoc }: { doc: DocRow; xoaDuoc: boolean }) {
  const router = useRouter();
  const [dangChay, start] = useTransition();

  const taiVe = () =>
    start(async () => {
      try {
        const kq = await linkTaiVe(doc.id);
        if ("error" in kq) {
          toast.error(kq.error, { duration: 10000 });
          return;
        }
        window.location.href = kq.data;
      } catch (e) {
        toast.error(cauLoi(e), { duration: 10000 });
      }
    });

  const xoa = () => {
    if (!window.confirm(`Xóa "${doc.title}" khỏi kho tài liệu?`)) return;
    start(async () => {
      if (baoLoi(await xoaTaiLieu(doc.id))) return;
      toast.success("Đã xóa khỏi kho");
      router.refresh();
    });
  };

  const ty = doc.originalSizeBytes ? tyLeNen(doc.originalSizeBytes, doc.sizeBytes) : null;

  return (
    <tr className="border-t hover:bg-slate-50">
      <td className="p-2">
        <div className="font-medium">{doc.title}</div>
        {doc.note && <div className="text-xs text-slate-500">{doc.note}</div>}
      </td>
      <td className="p-2 text-slate-600">{DOC_TYPES[doc.docType as DocType] ?? doc.docType}</td>
      <td className="p-2 text-slate-600">{doc.period ?? ""}</td>
      <td className="p-2 text-right tabular-nums whitespace-nowrap">
        {fmtDungLuong(doc.sizeBytes)}
        {ty && <div className="text-[11px] text-green-700">đã nén, nhỏ đi {ty.toFixed(1)} lần</div>}
      </td>
      <td className="p-2 text-xs text-slate-500 whitespace-nowrap">
        {doc.createdAt}
        <div>{doc.uploadedBy}</div>
      </td>
      <td className="p-2 text-xs text-slate-500">
        {doc.driveUrl ? (
          <a href={doc.driveUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            Có trên Drive
          </a>
        ) : (
          "Chỉ trong app"
        )}
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <Button variant="outline" size="sm" onClick={taiVe} disabled={dangChay}>
          Tải về
        </Button>
        {xoaDuoc && (
          <Button
            variant="outline"
            size="sm"
            onClick={xoa}
            disabled={dangChay}
            className="ml-2 text-red-600 border-red-300"
          >
            Xóa
          </Button>
        )}
      </td>
    </tr>
  );
}
