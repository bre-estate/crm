"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { baoLoi } from "@/lib/bao-loi";
import { batDauNoiDrive, ngatDrive, datTrangThaiTichHop } from "@/lib/actions/documents";

export default function DriveActions({
  daNoi,
  dangBat,
  khaiBaoDu,
}: {
  daNoi: boolean;
  dangBat: boolean;
  khaiBaoDu: boolean;
}) {
  const router = useRouter();
  const [dangChay, start] = useTransition();

  const noi = () =>
    start(async () => {
      const kq = await batDauNoiDrive();
      if ("error" in kq) {
        toast.error(kq.error, { duration: 12000 });
        return;
      }
      // Sang Google trong cùng tab, xong Google gọi ngược về trang này.
      window.location.href = kq.data;
    });

  const ngat = () => {
    if (!window.confirm("Ngắt kết nối Google Drive? Tài liệu đã đẩy lên vẫn nằm nguyên trên Drive.")) return;
    start(async () => {
      if (baoLoi(await ngatDrive())) return;
      toast.success("Đã ngắt kết nối Google Drive");
      router.refresh();
    });
  };

  const batTat = (bat: boolean) =>
    start(async () => {
      if (baoLoi(await datTrangThaiTichHop("google_drive", bat))) return;
      toast.success(bat ? "Đã bật đẩy bản sao lên Drive" : "Đã tắt, tài liệu mới chỉ nằm trong app");
      router.refresh();
    });

  if (!daNoi) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button onClick={noi} disabled={dangChay || !khaiBaoDu}>
          {dangChay ? "Đang mở Google" : "Kết nối"}
        </Button>
        {!khaiBaoDu && (
          <span className="text-[11px] text-amber-700">Chưa khai báo mã ứng dụng Google</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => batTat(!dangBat)} disabled={dangChay}>
        {dangBat ? "Tạm tắt" : "Bật lại"}
      </Button>
      <Button variant="outline" onClick={ngat} disabled={dangChay} className="text-red-600 border-red-300">
        Ngắt kết nối
      </Button>
    </div>
  );
}
