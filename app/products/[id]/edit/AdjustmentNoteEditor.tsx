"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  adjId: number;
  initialNote: string;
  onSave: (note: string) => Promise<void>;
};

export default function AdjustmentNoteEditor({ adjId: _adjId, initialNote, onSave }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialNote);

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 text-sm text-slate-500">{initialNote || "—"}</div>
        <button
          type="button"
          onClick={() => {
            setValue(initialNote);
            setEditing(true);
          }}
          className="text-xs text-blue-600 hover:underline whitespace-nowrap"
          title="Sửa ghi chú (chỉ được sửa ghi chú, không sửa được data)"
        >
          ✏ Sửa
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input text-sm flex-1"
        placeholder="Nhập ghi chú..."
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          start(async () => {
            try {
              await onSave(value);
              setEditing(false);
              router.refresh();
            } catch (e) {
              alert(e instanceof Error ? e.message : "Lỗi lưu");
            }
          });
        }}
        className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? "..." : "Lưu"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-slate-500 hover:text-slate-700 whitespace-nowrap"
      >
        Hủy
      </button>
    </div>
  );
}
