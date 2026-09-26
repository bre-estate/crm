"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { baoLoi } from "@/lib/bao-loi";
import { cauLoi } from "@/lib/actions/ket-qua";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { luuThongTinViTri, taoViTri, xoaViTri } from "@/lib/actions/vi-tri";

type ViTri = {
  code: string;
  label: string;
  khoi: string | null;
  builtin: boolean;
  soQuyen: number;
  soNhanSu: number;
  soTaiKhoan: number;
};

/**
 * Danh mục vị trí công việc. Chỉ quản tên, mã và phòng ban.
 *
 * Phần cấp quyền nằm ở trang Phân quyền riêng, vì hai việc khác nhau: thêm một
 * chức danh là việc nhân sự, còn mở quyền cho chức danh đó là việc quản trị.
 */
export default function PositionsManager({
  viTri,
  khoi,
  xemDuocPhanQuyen,
}: {
  viTri: ViTri[];
  khoi: Record<string, string>;
  xemDuocPhanQuyen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sua, setSua] = useState<ViTri | null>(null);
  const [tao, setTao] = useState(false);

  // Gom theo phòng ban để nhìn ra ngay phòng nào có những chức danh nào.
  const nhom = Object.entries(khoi).map(([ma, ten]) => ({
    ma,
    ten,
    ds: viTri.filter((v) => v.khoi === ma),
  }));
  const chuaGan = viTri.filter((v) => !v.khoi || !(v.khoi in khoi));

  const xoa = (v: ViTri) => {
    if (!confirm(`Xóa vị trí "${v.label}"?`)) return;
    start(async () => {
      try {
        if (baoLoi(await xoaViTri(v.code))) return;
        router.refresh();
        toast.success("Đã xóa vị trí");
      } catch (e) {
        toast.error(cauLoi(e));
      }
    });
  };

  const bang = (ds: ViTri[], tenNhom: string) => (
    <Card key={tenNhom} className="p-0 gap-0 overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wide">
        {tenNhom}
      </div>
      {ds.length === 0 ? (
        <div className="px-3 py-4 text-sm text-slate-400">Chưa có vị trí nào trong phòng này.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {ds.map((v) => (
            <div key={v.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-slate-50">
              <div className="flex-1 min-w-44">
                <span className="font-medium">{v.label}</span>{" "}
                <span className="text-[10px] font-mono text-slate-400">{v.code}</span>
              </div>
              <div className="w-28 text-sm text-slate-600 tabular-nums">
                {v.soNhanSu} người
              </div>
              <div className="w-32 text-sm text-slate-600 tabular-nums">
                {v.soTaiKhoan > 0 ? `${v.soTaiKhoan} tài khoản` : ""}
              </div>
              <div className="w-36 text-sm">
                {xemDuocPhanQuyen ? (
                  <Link
                    href={`/admin/permissions?viTri=${v.code}`}
                    className={v.soQuyen > 0 ? "text-blue-600 hover:underline" : "text-slate-400 hover:underline"}
                  >
                    {v.soQuyen > 0 ? `${v.soQuyen} mục quyền` : "Chưa cấp quyền"}
                  </Link>
                ) : (
                  <span className="text-slate-500">
                    {v.soQuyen > 0 ? `${v.soQuyen} mục quyền` : "Chưa cấp quyền"}
                  </span>
                )}
              </div>
              <div className="flex gap-3 text-sm whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => setSua(v)}
                  disabled={pending}
                  className="text-blue-600 hover:underline disabled:opacity-50"
                >
                  Sửa
                </button>
                {!v.builtin && (
                  <button
                    type="button"
                    onClick={() => xoa(v)}
                    disabled={pending}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vị trí</h1>
          <p className="text-sm text-slate-500 mt-1">
            Danh sách chức danh, xếp theo phòng ban. Dùng cho hồ sơ nhân sự và làm căn cứ
            cấp quyền.{" "}
            {xemDuocPhanQuyen && (
              <>
                Cấp quyền cho từng vị trí ở trang{" "}
                <Link href="/admin/permissions" className="text-blue-600 hover:underline">
                  Phân quyền
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setTao(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          + Thêm vị trí
        </Button>
      </div>

      <div className="space-y-3">
        {nhom.map((n) => bang(n.ds, n.ten))}
        {chuaGan.length > 0 && bang(chuaGan, "Chưa gắn phòng ban")}
      </div>

      {(sua || tao) && (
        <HopThoai
          sua={sua}
          viTri={viTri}
          khoi={khoi}
          pending={pending}
          onClose={() => {
            setSua(null);
            setTao(false);
          }}
          onSubmit={(label, ma, kh, chepTu) =>
            start(async () => {
              try {
                const kq = sua
                  ? await luuThongTinViTri(sua.code, label, kh)
                  : await taoViTri(ma, label, kh, chepTu);
                if (baoLoi(kq)) return;
                setSua(null);
                setTao(false);
                router.refresh();
                toast.success(sua ? "Đã cập nhật" : "Đã thêm vị trí");
              } catch (e) {
                toast.error(cauLoi(e));
              }
            })
          }
        />
      )}
    </div>
  );
}

function HopThoai({
  sua,
  viTri,
  khoi,
  pending,
  onClose,
  onSubmit,
}: {
  sua: ViTri | null;
  viTri: ViTri[];
  khoi: Record<string, string>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (label: string, ma: string, khoi: string | null, chepTu: string | null) => void;
}) {
  const [label, setLabel] = useState(sua?.label ?? "");
  const [ma, setMa] = useState(sua?.code ?? "");
  const [kh, setKh] = useState(sua?.khoi ?? "");
  const [chepTu, setChepTu] = useState("");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{sua ? `Sửa ${sua.label}` : "Thêm vị trí"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-600 mb-1">
              Tên vị trí <span className="text-red-500">*</span>
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input w-full"
              placeholder="vd: Kế toán trưởng"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">
              Thuộc phòng ban <span className="text-red-500">*</span>
            </label>
            <select value={kh} onChange={(e) => setKh(e.target.value)} className="input w-full">
              <option value="">Chưa gắn phòng ban</option>
              {Object.entries(khoi).map(([m, t]) => (
                <option key={m} value={m}>
                  {t}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-slate-500 mt-1">
              Chọn phòng nào thì lúc thêm người vào phòng đó, vị trí này hiện lên đầu danh sách.
            </div>
          </div>

          {sua ? (
            <div>
              <label className="block text-xs text-slate-600 mb-1">Mã</label>
              <div className="input bg-slate-50 text-slate-500 font-mono text-sm py-2">
                {sua.code}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Mã không đổi được vì hồ sơ nhân sự và bảng lương đang tra theo nó.
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  Mã <span className="text-red-500">*</span>
                </label>
                <input
                  value={ma}
                  onChange={(e) => setMa(e.target.value)}
                  className="input w-full font-mono text-sm"
                  placeholder="vd: ke_toan_truong"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Chữ thường, số và dấu gạch dưới. Đặt xong không đổi được nên chọn kỹ.
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Chép quyền từ</label>
                <select
                  value={chepTu}
                  onChange={(e) => setChepTu(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Chưa cấp quyền gì</option>
                  {viTri
                    .filter((v) => v.soQuyen > 0)
                    .map((v) => (
                      <option key={v.code} value={v.code}>
                        {v.label} ({v.soQuyen} mục)
                      </option>
                    ))}
                </select>
                <div className="text-[11px] text-slate-500 mt-1">
                  Để trống cũng được, cấp quyền sau ở trang Phân quyền.
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => onSubmit(label, ma, kh || null, chepTu || null)}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {pending ? "Đang lưu..." : sua ? "Cập nhật" : "Thêm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
