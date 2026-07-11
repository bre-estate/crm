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
      <div className="flex items-start gap-2">
        <div className="flex-1 text-slate-500">{initialNote || "—"}</div>
        <button
          type="button"
          onClick={() => {
            setValue(initialNote);
            setEditing(true);
          }}
          className="text-[10px] text-blue-600 hover:underline whitespace-nowrap"
          title="Sửa ghi chú (chỉ được sửa ghi chú, không sửa được data)"
        >
          ✏ Sửa
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input text-xs py-1 flex-1"
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
        className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "..." : "Lưu"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-[10px] text-slate-500 hover:text-slate-700"
      >
        Hủy
      </button>
    </div>
  );
}
