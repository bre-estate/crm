"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Bulk delete bar cho các list page (revenues, costs).
 * Cách dùng:
 *   1. Server render checkbox trong mỗi row: <input type="checkbox" data-bulk-id="123" class="js-bulk-check" />
 *   2. Mount <BulkDeleteBar entityLabel="ĐC doanh thu" onDelete={action} /> ở top của list
 *   3. Bar tự attach listeners, quản lý selected state, hiện confirm + toast
 *
 * Đơn giản hơn extract client table wrapper. Chấp nhận DOM manipulation nhẹ.
 */
export default function BulkDeleteBar({
  entityLabel,
  onDelete,
}: {
  entityLabel: string;
  onDelete: (ids: number[]) => Promise<{
    ok: number;
    deletedIds: number[];
    errors: { id: number; message: string }[];
  }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    const checkboxes = Array.from(
      document.querySelectorAll<HTMLInputElement>("input.js-bulk-check"),
    );
    const handlers = checkboxes.map((cb) => {
      const id = Number(cb.dataset.bulkId);
      const handler = () => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (cb.checked) next.add(id);
          else next.delete(id);
          return next;
        });
      };
      cb.addEventListener("change", handler);
      return { cb, handler };
    });
    return () => {
      handlers.forEach(({ cb, handler }) => cb.removeEventListener("change", handler));
    };
  }, []);

  // Sync class 'row-selected' vào <tr> khi selected đổi
  useEffect(() => {
    document
      .querySelectorAll<HTMLTableRowElement>("tr[data-bulk-row-id]")
      .forEach((tr) => {
        const id = Number(tr.dataset.bulkRowId);
        if (selected.has(id)) tr.classList.add("bg-orange-50");
        else tr.classList.remove("bg-orange-50");
      });
  }, [selected]);

  const clearSelection = () => {
    document
      .querySelectorAll<HTMLInputElement>("input.js-bulk-check")
      .forEach((cb) => {
        cb.checked = false;
      });
    setSelected(new Set());
  };

  const handleDelete = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const ok = confirm(`Xóa ${ids.length} ${entityLabel}?\n\nHành động không hoàn tác được.`);
    if (!ok) return;
    start(async () => {
      try {
        const res = await onDelete(ids);
        if (res.errors.length > 0) {
          toast.error(`Đã xóa ${res.ok}, ${res.errors.length} lỗi`, {
            description: res.errors
              .slice(0, 5)
              .map((e) => `#${e.id}: ${e.message}`)
              .join(" · "),
          });
        } else {
          toast.success(`Đã xóa ${res.ok} ${entityLabel}`);
        }
        clearSelection();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  };

  if (selected.size === 0) return null;

  return (
    <div className="sticky top-0 z-10 bg-white border border-orange-300 rounded-lg p-3 flex justify-between items-center shadow-sm">
      <div className="text-sm">
        Đã chọn <b>{selected.size}</b> {entityLabel}.{" "}
        <button
          type="button"
          onClick={clearSelection}
          className="text-blue-600 hover:underline text-xs ml-2"
        >
          Bỏ chọn hết
        </button>
      </div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
      >
        {pending ? "Đang xóa..." : `🗑 Xóa ${selected.size} ${entityLabel}`}
      </button>
    </div>
  );
}
