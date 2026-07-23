"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import SearchableSelect from "@/components/SearchableSelect";

type Department = {
  id: number;
  code: string;
  name: string;
  leaderName: string | null;
  note: string | null;
  prodCount: number;
  empCount: number;
};

type TpkdCandidate = { id: number; name: string; position: string };

type Props = {
  departments: Department[];
  tpkdCandidates: TpkdCandidate[];
  onCreate: (fd: FormData) => Promise<void>;
  onUpdate: (id: number, fd: FormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

export default function DepartmentsManager({
  departments,
  tpkdCandidates,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState(false);

  const isOpen = editing !== null || creating;
  const close = () => {
    setEditing(null);
    setCreating(false);
  };

  const submit = (fd: FormData) => {
    start(async () => {
      try {
        if (editing) await onUpdate(editing.id, fd);
        else await onCreate(fd);
        close();
        router.refresh();
        toast.success(editing ? "Đã cập nhật" : "Đã thêm phòng KD");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi lưu");
      }
    });
  };

  const del = (d: Department) => {
    if (!confirm(`Xoá phòng "${d.name}"? Hành động không hoàn tác được.`)) return;
    start(async () => {
      try {
        await onDelete(d.id);
        router.refresh();
        toast.success("Đã xoá");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lỗi xoá");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Phòng ban</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý phòng kinh doanh + trưởng phòng (TPKD). NV được gán vào phòng qua trang{" "}
            <a href="/employees" className="text-blue-600 hover:underline">
              Nhân viên
            </a>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"
        >
          + Thêm phòng
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Mã</th>
              <th className="text-left p-3">Tên phòng</th>
              <th className="text-left p-3">TPKD (leader)</th>
              <th className="text-center p-3">NV</th>
              <th className="text-center p-3">Căn đã bán</th>
              <th className="text-left p-3">Ghi chú</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-mono text-xs">{d.code}</td>
                <td className="p-3 font-medium">{d.name}</td>
                <td className="p-3 text-sm">{d.leaderName ?? <span className="text-slate-300">—</span>}</td>
                <td className="p-3 text-center tabular-nums">{d.empCount}</td>
                <td className="p-3 text-center tabular-nums">{d.prodCount}</td>
                <td className="p-3 text-xs text-slate-500 max-w-xs truncate" title={d.note ?? undefined}>
                  {d.note ?? ""}
                </td>
                <td className="p-3 text-right space-x-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setEditing(d)}
                    className="text-blue-600 hover:underline text-sm"
                    disabled={pending}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => del(d)}
                    className="text-red-600 hover:underline text-sm"
                    disabled={pending || d.prodCount > 0 || d.empCount > 0}
                    title={
                      d.prodCount > 0 || d.empCount > 0
                        ? `Không xoá được — có ${d.prodCount} căn + ${d.empCount} NV`
                        : "Xoá phòng"
                    }
                  >
                    Xoá
                  </button>
                </td>
              </tr>
            ))}
            {departments.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có phòng nào. Bấm "+ Thêm phòng" để tạo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200">
              <div className="text-lg font-bold">
                {editing ? `Sửa phòng — ${editing.name}` : "Thêm phòng KD mới"}
              </div>
            </div>
            <form action={submit} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Mã phòng" required>
                  <input
                    name="code"
                    defaultValue={editing?.code ?? ""}
                    className="input"
                    maxLength={16}
                    required
                    autoFocus={!editing}
                    placeholder="vd: HGIA, 1TY"
                  />
                </Field>
                <Field label="Tên phòng" required>
                  <input
                    name="name"
                    defaultValue={editing?.name ?? ""}
                    className="input"
                    required
                    placeholder="vd: Hồ Gia, 1 Tỷ"
                  />
                </Field>
                <Field label="TPKD (trưởng phòng)" full>
                  <SearchableSelect
                    name="leaderName"
                    defaultValue={editing?.leaderName ?? ""}
                    emptyOption="— Chưa có TPKD —"
                    placeholder="Gõ tên..."
                    options={tpkdCandidates.map((t) => ({
                      value: t.name,
                      label: t.name,
                      sublabel: t.position.toUpperCase(),
                    }))}
                  />
                  <div className="text-[10px] text-slate-500 mt-1">
                    Có thể chọn bất kỳ NV, không nhất thiết position=TPKD (VD giao CTV cho CEO tạm quản).
                  </div>
                </Field>
                <Field label="Ghi chú" full>
                  <textarea
                    name="note"
                    defaultValue={editing?.note ?? ""}
                    className="input"
                    rows={2}
                    placeholder="Note nội bộ về phòng này..."
                  />
                </Field>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 mt-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="px-4 py-2 text-sm rounded-lg bg-slate-100 hover:bg-slate-200"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-6 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {pending ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  required,
  full,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-full" : ""}>
      <label className="block text-xs text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
