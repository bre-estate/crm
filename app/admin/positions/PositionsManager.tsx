"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { baoLoi } from "@/lib/bao-loi";
import { cauLoi } from "@/lib/actions/ket-qua";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RESOURCE_GROUPS, actionsFor, type Action } from "@/lib/permissions";
import { luuViTri, taoViTri, xoaViTri } from "./actions";

type ViTri = {
  code: string;
  label: string;
  khoi: string | null;
  builtin: boolean;
  permissions: Record<string, Action[]>;
  soNhanSu: number;
  soTaiKhoan: number;
};

const HANH_DONG: Action[] = ["view", "edit", "delete"];
const NHAN_HANH_DONG: Record<Action, string> = { view: "Xem", edit: "Sửa", delete: "Xóa" };

export default function PositionsManager({
  viTri,
  resources,
  khoi,
}: {
  viTri: ViTri[];
  resources: Record<string, string>;
  khoi: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dangChon, setDangChon] = useState(viTri[0]?.code ?? "");
  const [moTao, setMoTao] = useState(false);

  const goc = viTri.find((v) => v.code === dangChon) ?? null;

  // Bản nháp đang sửa. Chuyển sang vị trí khác thì dựng lại từ bản gốc.
  const [nhap, setNhap] = useState(() => ({
    code: goc?.code ?? "",
    label: goc?.label ?? "",
    khoi: goc?.khoi ?? "",
    perms: goc?.permissions ?? {},
  }));
  if (goc && nhap.code !== goc.code) {
    setNhap({
      code: goc.code,
      label: goc.label,
      khoi: goc.khoi ?? "",
      perms: goc.permissions,
    });
  }

  const doiRoi = useMemo(() => {
    if (!goc) return false;
    return (
      nhap.label !== goc.label ||
      nhap.khoi !== (goc.khoi ?? "") ||
      JSON.stringify(nhap.perms) !== JSON.stringify(goc.permissions)
    );
  }, [goc, nhap]);

  const soQuyen = (p: Record<string, Action[]>) => Object.keys(p).length;

  const bat = (res: string, act: Action) => {
    setNhap((truoc) => {
      const dang = truoc.perms[res] ?? [];
      const co = dang.includes(act);
      let sau = co ? dang.filter((a) => a !== act) : [...dang, act];
      // Sửa hay xóa thì phải xem được, không thì cấp quyền chết.
      if (!co && act !== "view" && !sau.includes("view")) sau = [...sau, "view"];
      // Bỏ quyền xem thì bỏ luôn sửa và xóa.
      if (co && act === "view") sau = [];
      const perms = { ...truoc.perms };
      if (sau.length) perms[res] = sau;
      else delete perms[res];
      return { ...truoc, perms };
    });
  };

  const batCaNhom = (keys: string[], tatCaCo: boolean) => {
    setNhap((truoc) => {
      const perms = { ...truoc.perms };
      for (const k of keys) {
        if (!resources[k]) continue;
        if (tatCaCo) delete perms[k];
        else perms[k] = ["view"];
      }
      return { ...truoc, perms };
    });
  };

  const luu = () => {
    if (!goc) return;
    start(async () => {
      try {
        if (baoLoi(await luuViTri(goc.code, nhap.label, nhap.khoi || null, nhap.perms))) return;
        router.refresh();
        toast.success(`Đã lưu ${nhap.label}`);
      } catch (e) {
        toast.error(cauLoi(e));
      }
    });
  };

  const xoa = () => {
    if (!goc) return;
    if (!confirm(`Xóa vị trí "${goc.label}"?`)) return;
    start(async () => {
      try {
        if (baoLoi(await xoaViTri(goc.code))) return;
        setDangChon(viTri.find((v) => v.code !== goc.code)?.code ?? "");
        router.refresh();
        toast.success("Đã xóa vị trí");
      } catch (e) {
        toast.error(cauLoi(e));
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vị trí và quyền</h1>
          <p className="text-sm text-slate-500 mt-1">
            Một danh sách dùng cho cả hồ sơ nhân sự lẫn quyền truy cập. Sửa quyền ở đây là áp
            cho mọi tài khoản đang ở vị trí đó. Muốn cho riêng một người thêm hoặc bớt quyền
            thì sửa trong trang Người dùng.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setMoTao(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          + Thêm vị trí
        </Button>
      </div>

      <Tabs value={dangChon} onValueChange={setDangChon}>
        <TabsList className="flex-wrap h-auto">
          {viTri.map((v) => (
            <TabsTrigger key={v.code} value={v.code}>
              {v.label}
              {v.code === dangChon && doiRoi && (
                <span className="ml-1.5 text-[10px] text-orange-600">chưa lưu</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!goc ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          Chưa có vị trí nào. Bấm Thêm vị trí để tạo.
        </Card>
      ) : (
        <>
          <Card className="[--card-spacing:1rem] px-4 py-3 gap-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-48">
                <label className="block text-xs text-slate-600 mb-1">Tên vị trí</label>
                <input
                  value={nhap.label}
                  onChange={(e) => setNhap((t) => ({ ...t, label: e.target.value }))}
                  className="input w-full"
                />
              </div>
              <div className="min-w-44">
                <label className="block text-xs text-slate-600 mb-1">Thuộc phòng ban</label>
                <select
                  value={nhap.khoi}
                  onChange={(e) => setNhap((t) => ({ ...t, khoi: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">Không gắn phòng nào</option>
                  {Object.entries(khoi).map(([ma, ten]) => (
                    <option key={ma} value={ma}>
                      {ten}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Mã</label>
                <div className="input bg-slate-50 text-slate-500 font-mono text-xs py-2">
                  {goc.code}
                </div>
              </div>
              <Button type="button" onClick={luu} disabled={pending || !doiRoi}>
                Lưu thay đổi
              </Button>
              {!goc.builtin && (
                <button
                  type="button"
                  onClick={xoa}
                  disabled={pending}
                  className="text-red-600 hover:underline text-sm pb-2 disabled:opacity-50"
                >
                  Xóa vị trí
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {goc.soNhanSu} người đang ở vị trí này, {goc.soTaiKhoan} trong số đó có tài khoản
              đăng nhập. Đang cấp {soQuyen(nhap.perms)} mục quyền.
              {goc.builtin && " Vị trí dựng sẵn: sửa được nhưng không xóa được."}
            </p>
          </Card>

          <div className="space-y-3">
            {RESOURCE_GROUPS.map((group) => {
              const keys = group.keys.filter((k) => resources[k]);
              if (keys.length === 0) return null;
              const tatCaCo = keys.every((k) => (nhap.perms[k]?.length ?? 0) > 0);
              return (
                <div key={group.label} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      {group.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => batCaNhom(keys, tatCaCo)}
                      disabled={pending}
                      className="text-[11px] text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {tatCaCo ? "Bỏ hết nhóm này" : "Cho xem hết nhóm này"}
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 bg-card">
                    {keys.map((key) => {
                      const dang = nhap.perms[key] ?? [];
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 p-2">
                          <div className="text-sm">
                            {resources[key]}{" "}
                            <span className="text-[10px] text-slate-400 font-mono">{key}</span>
                          </div>
                          <div className="flex gap-3">
                            {HANH_DONG.map((a) => {
                              const hoTro = actionsFor(key).includes(a);
                              return (
                                <label
                                  key={a}
                                  className={cn(
                                    "flex items-center gap-1 text-xs",
                                    !hoTro && "cursor-not-allowed text-slate-300",
                                  )}
                                  title={hoTro ? undefined : "Trang này không có hành động đó"}
                                >
                                  <input
                                    type="checkbox"
                                    checked={hoTro && dang.includes(a)}
                                    disabled={!hoTro || pending}
                                    onChange={() => hoTro && bat(key, a)}
                                  />
                                  {NHAN_HANH_DONG[a]}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {moTao && (
        <HopThoaiTao
          viTri={viTri}
          khoi={khoi}
          pending={pending}
          onClose={() => setMoTao(false)}
          onSubmit={(ma, label, kh, chepTu) =>
            start(async () => {
              try {
                if (baoLoi(await taoViTri(ma, label, kh, chepTu))) return;
                setMoTao(false);
                setDangChon(ma.trim().toLowerCase());
                router.refresh();
                toast.success("Đã thêm vị trí");
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

function HopThoaiTao({
  viTri,
  khoi,
  pending,
  onClose,
  onSubmit,
}: {
  viTri: ViTri[];
  khoi: Record<string, string>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (ma: string, label: string, khoi: string | null, chepTu: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [ma, setMa] = useState("");
  const [kh, setKh] = useState("");
  const [chepTu, setChepTu] = useState("");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm vị trí</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Tên vị trí</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input w-full"
              placeholder="vd: Kế toán trưởng"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Mã</label>
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
            <label className="block text-xs text-slate-600 mb-1">Thuộc phòng ban</label>
            <select value={kh} onChange={(e) => setKh(e.target.value)} className="input w-full">
              <option value="">Không gắn phòng nào</option>
              {Object.entries(khoi).map(([m, t]) => (
                <option key={m} value={m}>
                  {t}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-slate-500 mt-1">
              Dùng để form nhân sự gợi ý vị trí theo phòng đang chọn.
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Chép quyền từ</label>
            <select
              value={chepTu}
              onChange={(e) => setChepTu(e.target.value)}
              className="input w-full"
            >
              <option value="">Bắt đầu từ trắng</option>
              {viTri.map((v) => (
                <option key={v.code} value={v.code}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => onSubmit(ma, label, kh || null, chepTu || null)}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Thêm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
