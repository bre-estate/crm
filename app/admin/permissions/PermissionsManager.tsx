"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { baoLoi } from "@/lib/bao-loi";
import { cauLoi } from "@/lib/actions/ket-qua";
import { cn } from "@/lib/utils";
import { RESOURCE_GROUPS, actionsFor, type Action } from "@/lib/permissions";
import { luuQuyenViTri } from "@/lib/actions/vi-tri";

type ViTri = {
  code: string;
  label: string;
  khoi: string | null;
  permissions: Record<string, Action[]>;
  soNhanSu: number;
  soTaiKhoan: number;
};

const HANH_DONG: Action[] = ["view", "edit", "delete"];
const NHAN_HANH_DONG: Record<Action, string> = { view: "Xem", edit: "Sửa", delete: "Xóa" };

/**
 * Cấp quyền cho một vị trí: chọn vị trí ở ô trên cùng, tick quyền ở dưới.
 *
 * Không thêm vị trí ở đây. Thêm chức danh là việc của trang Vị trí, trộn vào
 * trang này thì mỗi lần cấp quyền lại phải lách qua đống nút không liên quan.
 */
export default function PermissionsManager({
  viTri,
  resources,
  khoi,
  chonSan,
}: {
  viTri: ViTri[];
  resources: Record<string, string>;
  khoi: Record<string, string>;
  chonSan: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dangChon, setDangChon] = useState(
    chonSan && viTri.some((v) => v.code === chonSan) ? chonSan : (viTri[0]?.code ?? ""),
  );

  const goc = viTri.find((v) => v.code === dangChon) ?? null;

  const [perms, setPerms] = useState<Record<string, Action[]>>(goc?.permissions ?? {});
  const [danhDau, setDanhDau] = useState(goc?.code ?? "");
  if (goc && danhDau !== goc.code) {
    setDanhDau(goc.code);
    setPerms(goc.permissions);
  }

  const doiRoi = useMemo(
    () => !!goc && JSON.stringify(perms) !== JSON.stringify(goc.permissions),
    [goc, perms],
  );

  const bat = (res: string, act: Action) => {
    setPerms((truoc) => {
      const dang = truoc[res] ?? [];
      const co = dang.includes(act);
      let sau = co ? dang.filter((a) => a !== act) : [...dang, act];
      // Sửa hay xóa thì phải xem được, không thì cấp quyền chết.
      if (!co && act !== "view" && !sau.includes("view")) sau = [...sau, "view"];
      // Bỏ quyền xem thì bỏ luôn sửa và xóa.
      if (co && act === "view") sau = [];
      const ra = { ...truoc };
      if (sau.length) ra[res] = sau;
      else delete ra[res];
      return ra;
    });
  };

  const batCaNhom = (keys: string[], tatCaCo: boolean) => {
    setPerms((truoc) => {
      const ra = { ...truoc };
      for (const k of keys) {
        if (tatCaCo) delete ra[k];
        else ra[k] = ["view"];
      }
      return ra;
    });
  };

  const luu = () => {
    if (!goc) return;
    start(async () => {
      try {
        if (baoLoi(await luuQuyenViTri(goc.code, perms))) return;
        router.refresh();
        toast.success(`Đã lưu quyền của ${goc.label}`);
      } catch (e) {
        toast.error(cauLoi(e));
      }
    });
  };

  if (viTri.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-slate-500">
        Chưa có vị trí nào. Tạo ở trang{" "}
        <Link href="/admin/positions" className="text-blue-600 hover:underline">
          Vị trí
        </Link>{" "}
        trước đã.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Phân quyền</h1>
        <p className="text-sm text-slate-500 mt-1">
          Chọn một vị trí rồi tick những trang vị trí đó được vào. Lưu xong là áp cho mọi tài
          khoản đang ở vị trí đó. Muốn cho riêng một người khác đi thì sửa trong trang{" "}
          <Link href="/admin/users" className="text-blue-600 hover:underline">
            Người dùng
          </Link>
          .
        </p>
      </div>

      <Card className="[--card-spacing:1rem] px-4 py-3 gap-2 sticky top-2 z-10">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-64">
            <label className="block text-xs text-slate-600 mb-1">Vị trí</label>
            <select
              value={dangChon}
              onChange={(e) => setDangChon(e.target.value)}
              className="input w-full"
            >
              {viTri.map((v) => (
                <option key={v.code} value={v.code}>
                  {v.label}
                  {v.khoi && khoi[v.khoi] ? ` · ${khoi[v.khoi]}` : ""}
                  {` · ${Object.keys(v.permissions).length} mục quyền`}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={luu} disabled={pending || !doiRoi}>
            {pending ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
          {doiRoi && (
            <button
              type="button"
              onClick={() => goc && setPerms(goc.permissions)}
              disabled={pending}
              className="text-sm text-slate-600 hover:underline pb-2 disabled:opacity-50"
            >
              Hoàn tác
            </button>
          )}
        </div>
        {goc && (
          <p className="text-xs text-slate-500">
            {goc.soNhanSu} người đang ở vị trí này, {goc.soTaiKhoan} trong số đó có tài khoản
            đăng nhập. Đang cấp {Object.keys(perms).length} mục.
            {doiRoi && <span className="text-orange-600"> Có thay đổi chưa lưu.</span>}
          </p>
        )}
      </Card>

      <div className="space-y-3">
        {RESOURCE_GROUPS.map((group) => {
          const keys = group.keys.filter((k) => resources[k]);
          if (keys.length === 0) return null;
          const tatCaCo = keys.every((k) => (perms[k]?.length ?? 0) > 0);
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
                  const dang = perms[key] ?? [];
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
    </div>
  );
}
