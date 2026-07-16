"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Employee = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  position: string;
  departmentId: number | null;
  active: boolean | null;
  note: string | null;
  departmentName: string | null;
  aliasOfId: number | null;
};

type Department = { id: number; name: string; code: string };

type Props = {
  employees: Employee[];
  departments: Department[];
  onCreate: (fd: FormData) => Promise<void>;
  onUpdate: (id: number, fd: FormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

const POSITION_LABEL: Record<string, string> = {
  ceo: "CEO",
  tpkd: "TPKD",
  nvkd: "NVKD",
  admin: "Admin",
  ctv: "CTV",
};

const POSITION_COLOR: Record<string, string> = {
  ceo: "bg-red-100 text-red-700",
  tpkd: "bg-orange-100 text-orange-700",
  nvkd: "bg-blue-100 text-blue-700",
  admin: "bg-yellow-100 text-yellow-700",
  ctv: "bg-purple-100 text-purple-700",
};

export default function EmployeesManager({
  employees,
  departments,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return employees.filter((e) => {
      if (!showInactive && !e.active) return false;
      if (deptFilter === "__none__") {
        if (e.departmentId != null) return false;
      } else if (deptFilter) {
        if (String(e.departmentId ?? "") !== deptFilter) return false;
      }
      if (!s) return true;
      const hay =
        `${e.name} ${e.email ?? ""} ${e.phone ?? ""} ${POSITION_LABEL[e.position] ?? e.position}`.toLowerCase();
      return hay.includes(s);
    });
  }, [employees, q, deptFilter, showInactive]);

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
        toast.success(editing ? "Đã cập nhật" : "Đã thêm nhân viên");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi lưu");
      }
    });
  };

  const del = (e: Employee) => {
    if (!confirm(`Xóa nhân viên "${e.name}"?\n\nNếu đang được dùng ở căn/giá vốn → sẽ bị chặn, dùng inactive để ẩn.`))
      return;
    start(async () => {
      try {
        await onDelete(e.id);
        router.refresh();
        toast.success("Đã xóa");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lỗi xóa");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Nhân viên</h1>
          <p className="text-sm text-slate-500 mt-1">
            Danh sách NVKD, TPKD, CEO, Admin, CTV. Dùng cho dropdown ở form giao dịch và giá vốn.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"
        >
          + Thêm nhân viên
        </button>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Tìm</label>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tên / email / SĐT..."
            className="input w-64"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Phòng KD</label>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="input w-52"
          >
            <option value="">Tất cả phòng</option>
            {departments.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
            <option value="__none__">(chưa phân phòng)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Hiện cả nhân viên đã nghỉ
        </label>
        <div className="text-xs text-slate-500 ml-auto pb-2">
          {filtered.length}/{employees.length} người
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Tên</th>
              <th className="text-left p-3">Vị trí</th>
              <th className="text-left p-3">Phòng</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">SĐT</th>
              <th className="text-center p-3">Trạng thái</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const ownerOfAlias = e.aliasOfId
                ? employees.find((x) => x.id === e.aliasOfId)
                : null;
              return (
              <tr
                key={e.id}
                className={`border-t border-slate-100 hover:bg-slate-50 ${e.active ? "" : "opacity-50"}`}
              >
                <td className="p-3 font-medium">
                  {e.name}
                  {ownerOfAlias && (
                    <span
                      className="ml-2 text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                      title={`Doanh số quy về ${ownerOfAlias.name} trong báo cáo`}
                    >
                      → {ownerOfAlias.name}
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <span
                    className={`text-xs px-2 py-1 rounded-md ${POSITION_COLOR[e.position] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    {POSITION_LABEL[e.position] ?? e.position}
                  </span>
                </td>
                <td className="p-3 text-slate-600 text-xs">{e.departmentName ?? "—"}</td>
                <td className="p-3 text-xs">{e.email ?? "—"}</td>
                <td className="p-3 text-xs">{e.phone ?? "—"}</td>
                <td className="p-3 text-center">
                  {e.active ? (
                    <span className="text-xs px-2 py-1 rounded-md bg-green-100 text-green-700">
                      Đang làm việc
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-500">
                      Đã nghỉ việc
                    </span>
                  )}
                </td>
                <td className="p-3 text-right space-x-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setEditing(e)}
                    className="text-blue-600 hover:underline text-sm"
                    disabled={pending}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => del(e)}
                    className="text-red-600 hover:underline text-sm"
                    disabled={pending}
                  >
                    Xóa
                  </button>
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có nhân viên nào khớp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200">
              <div className="text-lg font-bold">
                {editing ? `Sửa — ${editing.name}` : "Thêm nhân viên mới"}
              </div>
            </div>
            <form action={submit} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tên đầy đủ" required>
                  <input
                    name="name"
                    defaultValue={editing?.name ?? ""}
                    className="input"
                    required
                    autoFocus={!editing}
                  />
                </Field>
                <Field label="Vị trí" required>
                  <select
                    name="position"
                    defaultValue={editing?.position ?? "nvkd"}
                    className="input"
                  >
                    <option value="nvkd">NVKD (Nhân viên kinh doanh)</option>
                    <option value="tpkd">TPKD (Trưởng phòng)</option>
                    <option value="ceo">CEO</option>
                    <option value="admin">Admin</option>
                    <option value="ctv">CTV / Freelance</option>
                  </select>
                </Field>
                <Field label="Phòng KD">
                  <select
                    name="departmentId"
                    defaultValue={editing?.departmentId ?? ""}
                    className="input"
                  >
                    <option value="">— chưa phân —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="SĐT">
                  <input
                    name="phone"
                    defaultValue={editing?.phone ?? ""}
                    className="input"
                    placeholder="09xx..."
                  />
                </Field>
                <Field label="Email" full>
                  <input
                    name="email"
                    type="email"
                    defaultValue={editing?.email ?? ""}
                    className="input"
                  />
                </Field>
                <Field label="Alias của" full>
                  <select
                    name="aliasOfId"
                    defaultValue={editing?.aliasOfId ?? ""}
                    className="input"
                  >
                    <option value="">— Không phải alias —</option>
                    {employees
                      .filter((x) => x.id !== editing?.id && !x.aliasOfId)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({POSITION_LABEL[x.position] ?? x.position})
                        </option>
                      ))}
                  </select>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Nếu NV này chỉ đứng tên trên chứng từ (VD người nhà) → chọn owner thật.
                    Report sẽ gộp doanh số về owner.
                  </div>
                </Field>
                <Field label="Trạng thái" required>
                  <select
                    name="active"
                    defaultValue={editing ? (editing.active ? "true" : "false") : "true"}
                    className="input"
                  >
                    <option value="true">Đang làm việc</option>
                    <option value="false">Đã nghỉ việc</option>
                  </select>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Đã nghỉ việc → ẩn khỏi dropdown ở form giao dịch/giá vốn.
                  </div>
                </Field>
                <Field label="Ghi chú" full>
                  <textarea
                    name="note"
                    defaultValue={editing?.note ?? ""}
                    className="input"
                    rows={2}
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
                  Hủy
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
