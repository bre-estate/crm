"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import SearchableSelect from "@/components/SearchableSelect";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

// 5 preset dùng cho logic (isCtv, dept detection). Custom positions
// (Marketing, Content...) chỉ để phân loại NV, không có logic đặc biệt.
const POSITION_PRESET_LABEL: Record<string, string> = {
  ceo: "CEO",
  tpkd: "TPKD",
  nvkd: "NVKD",
  admin: "Admin",
  ctv: "CTV",
};

const POSITION_PRESET_COLOR: Record<string, string> = {
  ceo: "bg-red-100 text-red-700",
  tpkd: "bg-orange-100 text-orange-700",
  nvkd: "bg-blue-100 text-blue-700",
  admin: "bg-yellow-100 text-yellow-700",
  ctv: "bg-purple-100 text-purple-700",
};

// Preset options hiện ở dropdown datalist. Custom positions từ DB được
// merge dynamic để user re-select mà không cần gõ lại.
const POSITION_PRESET_OPTIONS = [
  { value: "nvkd", label: "NVKD" },
  { value: "tpkd", label: "TPKD" },
  { value: "ceo", label: "CEO" },
  { value: "admin", label: "Admin" },
  { value: "ctv", label: "CTV" },
];

const positionLabel = (p: string): string =>
  POSITION_PRESET_LABEL[p.toLowerCase()] ?? p;

const positionColor = (p: string): string =>
  POSITION_PRESET_COLOR[p.toLowerCase()] ?? "bg-slate-100 text-slate-700";

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

  // Distinct positions từ DB không thuộc 5 preset — gợi ý trong datalist
  // để user re-select mà không cần gõ lại.
  const customPositions = useMemo(() => {
    const preset = new Set(POSITION_PRESET_OPTIONS.map((o) => o.value));
    const set = new Set<string>();
    for (const e of employees) {
      if (e.position && !preset.has(e.position.toLowerCase())) {
        set.add(e.position);
      }
    }
    return Array.from(set).sort();
  }, [employees]);

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
        `${e.name} ${e.email ?? ""} ${e.phone ?? ""} ${positionLabel(e.position)}`.toLowerCase();
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
        <Button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          + Thêm nhân viên
        </Button>
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

      <Card className="p-0 gap-0 overflow-hidden">
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
                      title={`Đứng tên cho ${ownerOfAlias.name} — doanh số quy về người này trong báo cáo`}
                    >
                      Đứng tên cho {ownerOfAlias.name}
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <span
                    className={`text-xs px-2 py-1 rounded-md ${positionColor(e.position)}`}
                  >
                    {positionLabel(e.position)}
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
      </Card>

      <Dialog open={isOpen} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editing ? `Sửa — ${editing.name}` : "Thêm nhân viên mới"}
            </DialogTitle>
          </DialogHeader>
          <form action={submit} className="space-y-3">
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
                  <input
                    name="position"
                    list="position-options"
                    defaultValue={editing ? positionLabel(editing.position) : "NVKD"}
                    className="input"
                    required
                    autoComplete="off"
                    placeholder="NVKD, TPKD, CEO, Admin, CTV hoặc gõ mới..."
                  />
                  <datalist id="position-options">
                    {POSITION_PRESET_OPTIONS.map((o) => (
                      <option key={o.value} value={o.label} />
                    ))}
                    {customPositions.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Chọn preset hoặc gõ vị trí mới (VD: Marketing, Content Writer).
                  </div>
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
                <Field label="Đứng tên cho" full>
                  <SearchableSelect
                    name="aliasOfId"
                    defaultValue={editing?.aliasOfId ?? ""}
                    emptyOption="— Không đứng tên cho ai —"
                    placeholder="Gõ tên người bán thật..."
                    options={employees
                      .filter((x) => x.id !== editing?.id && !x.aliasOfId)
                      .map((x) => ({
                        value: x.id,
                        label: x.name,
                        sublabel: `${positionLabel(x.position)}${x.departmentName ? " · " + x.departmentName : ""}`,
                      }))}
                  />
                  <div className="text-[10px] text-slate-500 mt-1">
                    Nếu NV này chỉ đứng tên trên chứng từ (VD người nhà) → chọn người bán thật.
                    Báo cáo sẽ gộp doanh số về người bán thật.
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
                <Button
                  type="button"
                  variant="secondary"
                  onClick={close}
                  disabled={pending}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={pending}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {pending ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo"}
                </Button>
              </div>
            </form>
        </DialogContent>
      </Dialog>
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
