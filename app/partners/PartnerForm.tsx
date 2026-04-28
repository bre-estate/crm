"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Partner } from "@/lib/schema";

type Props = {
  partner?: Partner;
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export default function PartnerForm({ partner, onSave, onDelete }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      action={(fd) => start(async () => await onSave(fd))}
      className="space-y-4 bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Mã đối tác (4 ký tự)" required>
          <input
            name="code"
            defaultValue={partner?.code ?? ""}
            maxLength={8}
            className="input"
            required
          />
        </Field>
        <Field label="Loại đối tác" required>
          <select name="type" defaultValue={partner?.type ?? "cdt"} className="input">
            <option value="cdt">Chủ đầu tư</option>
            <option value="f1">Sàn F1</option>
            <option value="f2">Sàn F2</option>
          </select>
        </Field>
        <Field label="Tên đối tác (ngắn)" required>
          <input name="name" defaultValue={partner?.name ?? ""} className="input" required />
        </Field>
        <Field label="Tên pháp nhân đầy đủ">
          <input name="legalName" defaultValue={partner?.legalName ?? ""} className="input" />
        </Field>
        <Field label="MST">
          <input name="taxCode" defaultValue={partner?.taxCode ?? ""} className="input" />
        </Field>
        <Field label="Email">
          <input name="email" defaultValue={partner?.email ?? ""} className="input" />
        </Field>
        <Field label="Địa chỉ" full>
          <input name="address" defaultValue={partner?.address ?? ""} className="input" />
        </Field>
        <Field label="SĐT">
          <input name="phone" defaultValue={partner?.phone ?? ""} className="input" />
        </Field>
        <Field label="Người liên hệ">
          <input
            name="contactPerson"
            defaultValue={partner?.contactPerson ?? ""}
            className="input"
          />
        </Field>
        <Field label="Ghi chú" full>
          <textarea name="note" defaultValue={partner?.note ?? ""} className="input" rows={3} />
        </Field>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Xóa đối tác "${partner?.name}"?`)) {
                start(async () => {
                  try {
                    await onDelete();
                  } catch (e) {
                    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
                    alert(e instanceof Error ? e.message : "Không xóa được");
                  }
                });
              }
            }}
            className="px-4 py-2 text-red-600 border border-red-300 rounded-lg text-sm hover:bg-red-50"
            disabled={pending}
          >
            Xóa
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </form>
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
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
