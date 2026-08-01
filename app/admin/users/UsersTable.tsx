"use client";

import { useState, useTransition } from "react";
import { createUser, updateUser, toggleActive, deleteUser } from "./actions";
import { RESOURCE_GROUPS, type Action, type Role } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type User = {
  email: string;
  fullName: string | null;
  role: Role;
  permissions: Record<string, Action[]>;
  active: boolean;
  invitedAt: string;
  lastLogin: string | null;
};

type Props = {
  users: User[];
  resources: Record<string, string>;
  roleLabels: Record<Role, string>;
};

const ACTIONS: Action[] = ["view", "edit", "delete"];
const ACTION_LABELS: Record<Action, string> = {
  view: "Xem",
  edit: "Sửa",
  delete: "Xóa",
};

export default function UsersTable({ users, resources, roleLabels }: Props) {
  const [editing, setEditing] = useState<string | null>(null); // email of user being edited (or "new")
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => setEditing("new")}
          className="bg-orange-600 hover:bg-orange-700 text-white"
        >
          + Mời user mới
        </Button>
      </div>

      <Card className="p-0 gap-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Tên</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Trạng thái</th>
              <th className="text-left p-3">Login gần nhất</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-mono text-xs">{u.email}</td>
                <td className="p-3">{u.fullName ?? "—"}</td>
                <td className="p-3">
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                    {u.role}
                  </span>
                  {u.role === "custom" && (
                    <div className="text-[10px] text-slate-500 mt-1">
                      {Object.keys(u.permissions).length} resource
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <span
                    className={
                      u.active
                        ? "text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded"
                        : "text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded"
                    }
                  >
                    {u.active ? "Hoạt động" : "Đã tắt"}
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-500">
                  {u.lastLogin ? new Date(u.lastLogin).toLocaleString("vi-VN") : "—"}
                </td>
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setEditing(u.email)}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`${u.active ? "Tắt" : "Bật"} user ${u.email}?`)) return;
                      startTransition(async () => {
                        await toggleActive(u.email);
                      });
                    }}
                    className="text-slate-600 hover:underline text-xs disabled:opacity-50"
                  >
                    {u.active ? "Tắt" : "Bật"}
                  </button>
                  {u.role !== "owner" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`XÓA user ${u.email}? Hành động không hoàn tác.`)) return;
                        startTransition(async () => {
                          await deleteUser(u.email);
                        });
                      }}
                      className="text-red-600 hover:underline text-xs disabled:opacity-50"
                    >
                      Xóa
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editing && (
        <UserFormModal
          user={editing === "new" ? null : users.find((u) => u.email === editing) ?? null}
          resources={resources}
          roleLabels={roleLabels}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function UserFormModal({
  user,
  resources,
  roleLabels,
  onClose,
}: {
  user: User | null;
  resources: Record<string, string>;
  roleLabels: Record<Role, string>;
  onClose: () => void;
}) {
  const [role, setRole] = useState<Role>(user?.role ?? "viewer");
  const [perms, setPerms] = useState<Record<string, Action[]>>(user?.permissions ?? {});
  const [pending, startTransition] = useTransition();
  const isNew = user === null;

  const togglePerm = (resource: string, action: Action) => {
    setPerms((prev) => {
      const current = prev[resource] ?? [];
      const has = current.includes(action);
      const updated = has ? current.filter((a) => a !== action) : [...current, action];
      // Edit/delete implies view
      if (!has && action !== "view" && !updated.includes("view")) updated.push("view");
      if (updated.length === 0) {
        const copy = { ...prev };
        delete copy[resource];
        return copy;
      }
      return { ...prev, [resource]: updated };
    });
  };

  const handleSubmit = async (fd: FormData) => {
    if (role === "custom") {
      fd.set("permissions_json", JSON.stringify(perms));
    }
    fd.set("role", role);
    startTransition(async () => {
      if (isNew) {
        await createUser(fd);
      } else if (user) {
        await updateUser(user.email, fd);
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form action={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {isNew ? "Mời user mới" : `Sửa ${user?.email}`}
            </h2>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>

          <div>
            <label className="block text-xs text-slate-600 mb-1">Email</label>
            <input
              name="email"
              type="email"
              required
              defaultValue={user?.email ?? ""}
              disabled={!isNew}
              className="input w-full disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 mb-1">Tên (optional)</label>
            <input
              name="full_name"
              type="text"
              defaultValue={user?.fullName ?? ""}
              className="input w-full"
              placeholder="Nga (HR)"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="input w-full"
            >
              {Object.entries(roleLabels).map(([r, label]) => (
                <option key={r} value={r}>{label}</option>
              ))}
            </select>
          </div>

          {role === "custom" && (
            <div>
              <label className="block text-xs text-slate-600 mb-2">
                Quyền tùy chỉnh — tick theo từng nhóm
              </label>
              <div className="space-y-3">
                {RESOURCE_GROUPS.map((group) => (
                  <div
                    key={group.label}
                    className="border border-slate-200 rounded-lg overflow-hidden"
                  >
                    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      {group.label}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.keys.map((key) => {
                        const label = resources[key];
                        if (!label) return null;
                        const current = perms[key] ?? [];
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between p-2"
                          >
                            <div className="text-sm">
                              {label}{" "}
                              <span className="text-[10px] text-slate-400 font-mono">
                                {key}
                              </span>
                            </div>
                            <div className="flex gap-3">
                              {ACTIONS.map((a) => (
                                <label
                                  key={a}
                                  className="flex items-center gap-1 text-xs"
                                >
                                  <input
                                    type="checkbox"
                                    checked={current.includes(a)}
                                    onChange={() => togglePerm(key, a)}
                                  />
                                  {ACTION_LABELS[a]}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {pending ? "Đang lưu..." : isNew ? "Mời" : "Lưu"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
