"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import SearchableSelect from "@/components/SearchableSelect";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  VI_TRI,
  MAU_VI_TRI,
  VI_TRI_GOI_Y,
  LOAI_HOP_DONG,
  maKhoiGoc,
  xepCay,
  type ViTri,
} from "@/lib/to-chuc";

type Employee = {
  id: number;
  name: string;
  /** Mã NV-xxx / CTV-xxx theo file Danh Sách Nhân Viên bên nhân sự. */
  code: string | null;
  email: string | null;
  phone: string | null;
  position: string;
  /** hd_lao_dong hoặc hd_dich_vu. Cộng tác viên là loại hợp đồng, không phải vị trí. */
  contractType: string | null;
  departmentId: number | null;
  active: boolean | null;
  note: string | null;
  departmentName: string | null;
  aliasOfId: number | null;
};

type Department = { id: number; name: string; code: string; parentId: number | null };

type Nhom = "all" | "hd_lao_dong" | "hd_dich_vu";

/**
 * Khóa sắp xếp theo mã: nhân viên trước cộng tác viên, trong mỗi nhóm thì theo số.
 * So theo số chứ không so theo chữ, để sau này có NV-100 thì không rơi xuống dưới NV-99.
 * Ai chưa có mã thì xếp cuối.
 */
function khoaMa(code: string | null): [number, number] {
  const m = /^([A-Za-z]+)-?(\d+)/.exec(code ?? "");
  if (!m) return [2, Number.MAX_SAFE_INTEGER];
  return [m[1].toUpperCase() === "CTV" ? 1 : 0, Number(m[2])];
}

type Props = {
  employees: Employee[];
  departments: Department[];
  onCreate: (fd: FormData) => Promise<{ error: string } | void>;
  onUpdate: (id: number, fd: FormData) => Promise<{ error: string } | void>;
  onDelete: (id: number) => Promise<{ error: string } | void>;
};

// Nhãn, màu và danh sách vị trí nằm ở lib/to-chuc.ts, dùng chung với form và kiểm tra dữ liệu.
const POSITION_LABEL: Record<string, string> = VI_TRI;
const POSITION_COLOR: Record<string, string> = MAU_VI_TRI;

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
  const [nhom, setNhom] = useState<Nhom>("all");

  // Lọc mọi thứ trừ tab, để số trên tab vẫn đúng theo phòng ban và ô tìm đang chọn.
  const truocNhom = useMemo(() => {
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
        `${e.code ?? ""} ${e.name} ${e.email ?? ""} ${e.phone ?? ""} ${POSITION_LABEL[e.position] ?? e.position}`.toLowerCase();
      return hay.includes(s);
    });
  }, [employees, q, deptFilter, showInactive]);

  // Tab theo loại hợp đồng, không theo tiền tố mã. Chỉ 4 người mang mã CTV-xxx
  // nhưng 33 người ký hợp đồng dịch vụ, nên đếm theo mã là sai.
  const soNv = truocNhom.filter((e) => e.contractType === "hd_lao_dong").length;
  const soCtv = truocNhom.filter((e) => e.contractType === "hd_dich_vu").length;
  const soChuaRo = truocNhom.length - soNv - soCtv;

  const filtered = useMemo(() => {
    const ds = nhom === "all" ? truocNhom : truocNhom.filter((e) => e.contractType === nhom);
    return [...ds].sort((a, b) => {
      const [na, sa] = khoaMa(a.code);
      const [nb, sb] = khoaMa(b.code);
      return na - nb || sa - sb || a.name.localeCompare(b.name, "vi");
    });
  }, [truocNhom, nhom]);

  const isOpen = editing !== null || creating;
  const close = () => {
    setEditing(null);
    setCreating(false);
  };

  const submit = (fd: FormData) => {
    start(async () => {
      try {
        if (editing) { if (baoLoi(await onUpdate(editing.id, fd))) return; }
        else if (baoLoi(await onCreate(fd))) return;
        close();
        router.refresh();
        toast.success(editing ? "Đã cập nhật" : "Đã thêm nhân viên");
      } catch (e) {
        toast.error(cauLoi(e));
      }
    });
  };

  const del = (e: Employee) => {
    if (!confirm(`Xóa nhân viên "${e.name}"?\n\nNếu đang được dùng ở căn/giá vốn → sẽ bị chặn, dùng inactive để ẩn.`))
      return;
    start(async () => {
      try {
        if (baoLoi(await onDelete(e.id))) return;
        router.refresh();
        toast.success("Đã xóa");
      } catch (err) {
        toast.error(cauLoi(err));
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Nhân viên</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý danh sách Nhân viên và Cộng tác viên của công ty.
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

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={nhom} onValueChange={(v) => setNhom(v as Nhom)}>
          <TabsList>
            <TabsTrigger value="all">Tất cả ({truocNhom.length})</TabsTrigger>
            <TabsTrigger value="hd_lao_dong">Nhân viên ({soNv})</TabsTrigger>
            <TabsTrigger value="hd_dich_vu">Cộng tác viên ({soCtv})</TabsTrigger>
          </TabsList>
        </Tabs>
        {soChuaRo > 0 && nhom === "all" && (
          <span className="text-xs text-slate-500">
            {soChuaRo} người chưa ghi loại hợp đồng, chỉ hiện ở tab Tất cả.
          </span>
        )}
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Tìm</label>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mã NV / tên / email / SĐT..."
            className="input w-64"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Phòng ban</label>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="input w-52"
          >
            <option value="">Tất cả phòng ban</option>
            {xepCay(departments).map(({ node, sau }) => (
              <option key={node.id} value={String(node.id)}>
                {"  ".repeat(sau)}
                {sau > 0 ? "└ " : ""}
                {node.name}
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
              <th className="text-left p-3 w-24">Mã NV</th>
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
                <td className="p-3 text-xs tabular-nums text-slate-600 whitespace-nowrap">
                  {e.code ?? "—"}
                </td>
                <td className="p-3">
                  <div className="font-medium">{e.name}</div>
                  {ownerOfAlias && (
                    <div
                      className="text-[11px] text-indigo-700 mt-0.5"
                      title="Doanh số quy về người này trong báo cáo"
                    >
                      Đứng tên cho {ownerOfAlias.name}
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <span
                    className={`text-xs px-2 py-1 rounded-md whitespace-nowrap ${POSITION_COLOR[e.position] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    {POSITION_LABEL[e.position] ?? e.position}
                  </span>
                  {e.contractType === "hd_dich_vu" && (
                    <div className="text-[11px] text-slate-500 mt-1">Cộng tác viên</div>
                  )}
                </td>
                <td className="p-3 text-slate-600 text-xs">{e.departmentName ?? "—"}</td>
                <td className="p-3 text-xs break-all">{e.email ?? "—"}</td>
                <td className="p-3 text-xs tabular-nums whitespace-nowrap">{e.phone ?? "—"}</td>
                <td className="p-3 text-center whitespace-nowrap">
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
                <td colSpan={8} className="p-6 text-center text-slate-500 text-sm">
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
              {editing ? `Sửa: ${editing.name}` : "Thêm nhân viên mới"}
            </DialogTitle>
          </DialogHeader>
          <form action={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
                <Field label="Họ tên" required>
                  <input
                    name="name"
                    defaultValue={editing?.name ?? ""}
                    className="input"
                    required
                    autoFocus={!editing}
                  />
                </Field>
                <PhongVaViTri
                  key={editing?.id ?? "moi"}
                  departments={departments}
                  phongBanDau={editing?.departmentId ?? null}
                  viTriBanDau={(editing?.position as ViTri) ?? "nvkd"}
                />
                <Field label="Loại hợp đồng">
                  <select
                    name="contractType"
                    defaultValue={editing?.contractType ?? ""}
                    className="input"
                  >
                    <option value="">Chưa ghi</option>
                    {Object.entries(LOAI_HOP_DONG).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
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
                    emptyOption="Không đứng tên cho ai"
                    placeholder="Gõ tên người bán thật..."
                    options={employees
                      .filter((x) => x.id !== editing?.id && !x.aliasOfId)
                      .map((x) => ({
                        value: x.id,
                        label: x.name,
                        sublabel: `${POSITION_LABEL[x.position] ?? x.position}${x.departmentName ? " · " + x.departmentName : ""}`,
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

/**
 * Hai ô Phòng ban và Vị trí đi cùng nhau: chọn phòng nào thì vị trí của phòng đó
 * hiện lên trước, phần còn lại gom xuống nhóm "Vị trí khác".
 *
 * Gợi ý chứ không chặn, vì dữ liệu thật có trường hợp hợp lệ nằm ngoài bảng gợi ý:
 * hai NVKD đứng tên dùm cho CEO đang thuộc Ban lãnh đạo. Chặn cứng thì không sửa
 * được hồ sơ của họ.
 *
 * Đặt key theo người đang sửa để mở hồ sơ khác là trạng thái tự đặt lại.
 */
function PhongVaViTri({
  departments,
  phongBanDau,
  viTriBanDau,
}: {
  departments: Department[];
  phongBanDau: number | null;
  viTriBanDau: ViTri;
}) {
  const [phong, setPhong] = useState<string>(phongBanDau ? String(phongBanDau) : "");
  const khoi = maKhoiGoc(phong ? Number(phong) : null, departments);
  const goiY: ViTri[] = khoi ? (VI_TRI_GOI_Y[khoi] ?? []) : [];
  const conLai = (Object.keys(VI_TRI) as ViTri[]).filter((v) => !goiY.includes(v));

  return (
    <>
      <Field label="Phòng ban">
        <select
          name="departmentId"
          value={phong}
          onChange={(e) => setPhong(e.target.value)}
          className="input"
        >
          <option value="">Chưa phân phòng ban</option>
          {xepCay(departments).map(({ node, sau }) => (
            <option key={node.id} value={String(node.id)}>
              {"  ".repeat(sau)}
              {sau > 0 ? "└ " : ""}
              {node.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Vị trí" required>
        <select name="position" defaultValue={viTriBanDau} className="input" required>
          {goiY.length > 0 ? (
            <>
              <optgroup label="Vị trí của phòng này">
                {goiY.map((v) => (
                  <option key={v} value={v}>
                    {VI_TRI[v]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Vị trí khác">
                {conLai.map((v) => (
                  <option key={v} value={v}>
                    {VI_TRI[v]}
                  </option>
                ))}
              </optgroup>
            </>
          ) : (
            (Object.keys(VI_TRI) as ViTri[]).map((v) => (
              <option key={v} value={v}>
                {VI_TRI[v]}
              </option>
            ))
          )}
        </select>
      </Field>
    </>
  );
}
