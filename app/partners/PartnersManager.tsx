"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { partnerTypeLabel } from "@/lib/format";

type Partner = {
  id: number;
  code: string;
  name: string;
  type: "cdt" | "f1" | "f2" | string;
  legalName: string | null;
  taxCode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  contactPerson: string | null;
  note: string | null;
};

type Props = {
  partners: Partner[];
  onCreate: (fd: FormData) => Promise<void>;
  onUpdate: (id: number, fd: FormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

export default function PartnersManager({ partners, onCreate, onUpdate, onDelete }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Partner | null>(null); // Partner để edit
  const [creating, setCreating] = useState(false); // Đang tạo mới?

  const isOpen = editing !== null || creating;

  const closeDialog = () => {
    setEditing(null);
    setCreating(false);
  };

  const submit = (fd: FormData) => {
    start(async () => {
      try {
        if (editing) await onUpdate(editing.id, fd);
        else await onCreate(fd);
        closeDialog();
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Lỗi lưu");
      }
    });
  };

  const del = (p: Partner) => {
    if (!confirm(`Xóa đối tác "${p.name}" (${p.code})?\n\nHành động này không hoàn tác được.`)) return;
    start(async () => {
      try {
        await onDelete(p.id);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Lỗi xóa");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Đối tác</h1>
          <p className="text-sm text-slate-500 mt-1">
            Chủ đầu tư, sàn F1 (sàn trên), sàn F2 (sàn/CTV dưới).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"
        >
          + Thêm đối tác
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Mã</th>
              <th className="text-left p-3">Tên</th>
              <th className="text-left p-3">Loại</th>
              <th className="text-left p-3">Pháp nhân</th>
              <th className="text-left p-3">MST</th>
              <th className="text-left p-3">Email</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-mono text-xs">{p.code}</td>
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">
                  <span
                    className={`text-xs px-2 py-1 rounded-md ${
                      p.type === "cdt"
                        ? "bg-blue-100 text-blue-700"
                        : p.type === "f1"
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {partnerTypeLabel(p.type)}
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-600">{p.legalName ?? "—"}</td>
                <td className="p-3 font-mono text-xs">{p.taxCode ?? "—"}</td>
                <td className="p-3 text-xs">{p.email ?? "—"}</td>
                <td className="p-3 text-right space-x-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="text-blue-600 hover:underline text-sm"
                    disabled={pending}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => del(p)}
                    className="text-red-600 hover:underline text-sm"
                    disabled={pending}
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
            {partners.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có đối tác nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200">
              <div className="text-lg font-bold">
                {editing ? `Sửa đối tác — ${editing.name}` : "Thêm đối tác mới"}
              </div>
            </div>
            <form action={submit} className="p-5 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Mã đối tác (4 ký tự)" required>
                  <input
                    name="code"
                    defaultValue={editing?.code ?? ""}
                    maxLength={8}
                    className="input"
                    required
                    autoFocus={!editing}
                  />
                </Field>
                <Field label="Loại đối tác" required>
                  <select name="type" defaultValue={editing?.type ?? "cdt"} className="input">
                    <option value="cdt">Chủ đầu tư</option>
                    <option value="f1">Sàn F1</option>
                    <option value="f2">Sàn F2</option>
                  </select>
                </Field>
                <Field label="Tên đối tác (ngắn)" required>
                  <input
                    name="name"
                    defaultValue={editing?.name ?? ""}
                    className="input"
                    required
                  />
                </Field>
                <Field label="Tên pháp nhân đầy đủ">
                  <input name="legalName" defaultValue={editing?.legalName ?? ""} className="input" />
                </Field>
                <Field label="MST">
                  <input name="taxCode" defaultValue={editing?.taxCode ?? ""} className="input" />
                </Field>
                <Field label="Email">
                  <input name="email" defaultValue={editing?.email ?? ""} className="input" />
                </Field>
                <Field label="Địa chỉ" full>
                  <input name="address" defaultValue={editing?.address ?? ""} className="input" />
                </Field>
                <Field label="SĐT">
                  <input name="phone" defaultValue={editing?.phone ?? ""} className="input" />
                </Field>
                <Field label="Người liên hệ">
                  <input
                    name="contactPerson"
                    defaultValue={editing?.contactPerson ?? ""}
                    className="input"
                  />
                </Field>
                <Field label="Ghi chú" full>
                  <textarea
                    name="note"
                    defaultValue={editing?.note ?? ""}
                    className="input"
                    rows={3}
                  />
                </Field>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 mt-3">
                <button
                  type="button"
                  onClick={closeDialog}
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
