"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { baoLoi } from "@/lib/bao-loi";
import { cauLoi } from "@/lib/actions/ket-qua";
import { boThuMuc, datThuMucDrive } from "@/lib/actions/documents";
import { moCuaSoChonThuMuc } from "@/lib/mo-cua-so-chon";

/** Gán thư mục Drive cho một loại tài liệu, hoặc cho ô mặc định khi không truyền docType. */
export default function ChonThuMuc({
  tenHienTai,
  docType,
  nhan,
  coTheBo,
}: {
  tenHienTai: string | null;
  docType?: string;
  nhan?: string;
  coTheBo?: boolean;
}) {
  const router = useRouter();
  const [dangChay, start] = useTransition();

  const mo = () =>
    start(async () => {
      try {
        const f = await moCuaSoChonThuMuc();
        if (!f) return;
        if (baoLoi(await datThuMucDrive(f.id, f.name, docType ?? null))) return;
        toast.success(
          docType
            ? `${nhan ?? "Loại này"} sẽ lưu vào thư mục "${f.name}"`
            : `Tài liệu chưa chỉ định thư mục riêng sẽ lưu vào "${f.name}"`,
        );
        router.refresh();
      } catch (e) {
        toast.error(cauLoi(e), { duration: 12000 });
      }
    });

  const bo = () =>
    start(async () => {
      if (baoLoi(await boThuMuc(docType ?? null))) return;
      toast.success(
        docType
          ? "Đã bỏ, loại này quay về dùng thư mục mặc định"
          : "Đã bỏ thư mục mặc định. Loại nào chưa gán riêng sẽ không đẩy lên Drive.",
      );
      router.refresh();
    });

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="outline" size={docType ? "sm" : undefined} onClick={mo} disabled={dangChay}>
        {dangChay ? "Đang mở" : tenHienTai ? "Đổi thư mục" : "Chọn thư mục"}
      </Button>
      {coTheBo && tenHienTai && (
        <Button variant="ghost" size="sm" onClick={bo} disabled={dangChay} className="text-slate-500">
          Bỏ
        </Button>
      )}
    </span>
  );
}
