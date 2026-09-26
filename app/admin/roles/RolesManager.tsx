"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { luuVaiTro, taoVaiTro, xoaVaiTro } from "./actions";

type VaiTro = {
  role: string;
  label: string;
  builtin: boolean;
  permissions: Record<string, Action[]>;
  soNguoi: number;
};

const HANH_DONG: Action[] = ["view", "edit", "delete"];
const NHAN_HANH_DONG: Record<Action, string> = { view: "Xem", edit: "Sửa", delete: "Xóa" };

export default function RolesManager({
  roles,
  resources,
}: {
  roles: VaiTro[];
  resources: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dangChon, setDangChon] = useState(roles[0]?.role ?? "");
  const [moTao, setMoTao] = useState(false);

  const goc = roles.find((r) => r.role === dangChon) ?? null;

  // Bản nháp đang sửa. Đổi vai trò khác thì dựng lại từ bản gốc.
  const [nhap, setNhap] = useState<{ role: string; label: string; perms: Record<string, Action[]> }>(
    () => ({ role: goc?.role ?? "", label: goc?.label ?? "", perms: goc?.permissions ?? {} }),
  );
  if (goc && nhap.role !== goc.role) {
    setNhap({ role: goc.role, label: goc.label, perms: goc.permissions });
  }

  const doiRoi = useMemo(() => {
    if (!goc) return false;
    return (
      nhap.label !== goc.label ||
      JSON.stringify(nhap.perms) !== JSON.stringify(goc.permissions)
    );
  }, [goc, nhap]);

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

  const luu = () => {
    if (!goc) return;
    start(async () => {
      try {
        if (baoLoi(await luuVaiTro(goc.role, nhap.label, nhap.perms))) return;
        router.refresh();
        toast.success(`Đã lưu quyền của ${nhap.label}`);
      } catch (e) {
        toast.error(cauLoi(e));
      }
    });
  };

  const xoa = () => {
    if (!goc) return;
    if (!confirm(`Xóa vai trò "${goc.label}"?`)) return;
    start(async () => {
      try {
        if (baoLoi(await xoaVaiTro(goc.role))) return;
        setDangChon(roles.find((r) => r.role !== goc.role)?.role ?? "");
        router.refresh();
        toast.success("Đã xóa vai trò");
      } catch (e) {
        toast.error(cauLoi(e));
      }
    });
  };

  const demQuyen = (p: Record<string, Action[]>) => Object.keys(p).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vai trò và quyền</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sửa ở đây là áp cho mọi tài khoản mang vai trò đó. Muốn cho riêng một người thêm
            hoặc bớt quyền thì sửa trong trang Quản lý user.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setMoTao(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          + Tạo vai trò
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_1fr] items-start">
        {/* Cột trái: danh sách vai trò */}
        <Card className="p-0 gap-0 overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wide border-b border-slate-200">
            Vai trò
          </div>
          <div className="divide-y divide-slate-100">
            <div className="px-3 py-2.5 text-sm">
              <div className="font-medium text-slate-500">Owner</div>
              <div className="text-[11px] text-slate-400">Luôn toàn quyền, không sửa được</div>
            </div>
            {roles.map((r) => (
              <button
                key={r.role}
                type="button"
                onClick={() => setDangChon(r.role)}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50",
                  r.role === dangChon && "bg-orange-50 hover:bg-orange-50",
                )}
              >
                <div className="font-medium flex items-center gap-2">
                  {r.label}
                  {r.role === dangChon && doiRoi && (
                    <span className="text-[10px] text-orange-600">chưa lưu</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400">
                  {r.soNguoi} tài khoản · {demQuyen(r.permissions)} mục được cấp
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Cột phải: quyền của vai trò đang chọn */}
        {goc ? (
          <div className="space-y-3">
            <Card className="[--card-spacing:1rem] px-4 py-3 gap-3">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-52">
                  <label className="block text-xs text-slate-600 mb-1">Tên vai trò</label>
                  <input
                    value={nhap.label}
                    onChange={(e) => setNhap((t) => ({ ...t, label: e.target.value }))}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Mã</label>
                  <div className="input bg-slate-50 text-slate-500 font-mono text-xs py-2">
                    {goc.role}
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
                    Xóa vai trò
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Đang áp cho {goc.soNguoi} tài khoản.
                {goc.builtin && " Vai trò dựng sẵn: sửa được quyền nhưng không xóa được."}
              </p>
            </Card>

            <div className="space-y-3">
              {RESOURCE_GROUPS.map((group) => (
                <div key={group.label} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    {group.label}
                  </div>
                  <div className="divide-y divide-slate-100 bg-card">
                    {group.keys.map((key) => {
                      const nhan = resources[key];
                      if (!nhan) return null;
                      const dang = nhap.perms[key] ?? [];
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 p-2">
                          <div className="text-sm">
                            {nhan}{" "}
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
              ))}
            </div>
          </div>
        ) : (
          <Card className="p-10 text-center text-sm text-slate-500">
            Chưa có vai trò nào. Bấm Tạo vai trò để thêm.
          </Card>
        )}
      </div>

      {moTao && (
        <HopThoaiTao
          roles={roles}
          pending={pending}
          onClose={() => setMoTao(false)}
          onSubmit={(ma, label, chepTu) =>
            start(async () => {
              try {
                if (baoLoi(await taoVaiTro(ma, label, chepTu))) return;
                setMoTao(false);
                setDangChon(ma.trim().toLowerCase());
                router.refresh();
                toast.success("Đã tạo vai trò");
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
  roles,
  pending,
  onClose,
  onSubmit,
}: {
  roles: VaiTro[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (ma: string, label: string, chepTu: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [ma, setMa] = useState("");
  const [chepTu, setChepTu] = useState("");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo vai trò</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Tên vai trò</label>
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
            <label className="block text-xs text-slate-600 mb-1">Chép quyền từ</label>
            <select
              value={chepTu}
              onChange={(e) => setChepTu(e.target.value)}
              className="input w-full"
            >
              <option value="">Bắt đầu từ trắng</option>
              {roles.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-slate-500 mt-1">
              Chép rồi tick thêm hoặc bỏ bớt, đỡ phải làm lại từ đầu.
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => onSubmit(ma, label, chepTu || null)}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Tạo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
