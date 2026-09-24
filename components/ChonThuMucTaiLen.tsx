"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cauLoi } from "@/lib/actions/ket-qua";
import { moCuaSoChonThuMuc } from "@/lib/mo-cua-so-chon";

export type ThuMuc = { id: string; name: string };

/**
 * Chọn thư mục Drive cho riêng lần tải này.
 *
 * Mở sẵn bên trong thư mục đã gán cho loại tài liệu ở trang Tích hợp, nên chỉ việc
 * bấm thư mục con theo kỳ. Không đụng tới cấu hình chung.
 */
export default function ChonThuMucTaiLen({
  giaTri,
  goc,
  onChon,
  disabled,
}: {
  giaTri: ThuMuc | null;
  /** Thư mục đã gán cho loại này ở trang Tích hợp. Cửa sổ chọn mở sẵn bên trong nó. */
  goc: ThuMuc | null;
  onChon: (t: ThuMuc | null) => void;
  disabled?: boolean;
}) {
  const [dangMo, start] = useTransition();

  const mo = () =>
    start(async () => {
      try {
        const f = await moCuaSoChonThuMuc({
          moTrong: goc?.id ?? null,
          tieuDe: goc ? `Chọn thư mục con trong "${goc.name}"` : "Chọn thư mục trên Drive",
        });
        if (f) onChon(f);
      } catch (e) {
        toast.error(cauLoi(e), { duration: 12000 });
      }
    });

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Thư mục trên Drive:</span>
        <span className="font-medium">
          {giaTri ? (
            giaTri.name
          ) : (
            <span className="text-amber-700">chưa chọn, file sẽ không lên Drive</span>
          )}
        </span>
        <Button variant="outline" size="sm" onClick={mo} disabled={disabled || dangMo}>
          {dangMo ? "Đang mở" : giaTri ? "Đổi" : "Chọn"}
        </Button>
        {giaTri && goc && giaTri.id !== goc.id && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChon(goc)}
            disabled={disabled || dangMo}
            className="text-slate-500"
          >
            Về {goc.name}
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Chọn thư mục đúng kỳ của file, ví dụ 2026 hoặc Q3-2026. Bấm một lần vào thư mục để chọn, hai
        lần để đi vào trong.
      </p>
    </div>
  );
}
