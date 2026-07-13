"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MoneyInput from "@/components/MoneyInput";
import { toast } from "sonner";

type Props = {
  onSave: (fd: FormData) => Promise<void>;
};

export default function ExpenseForm({ onSave }: Props) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"
      >
        + Thêm chi phí
      </button>
    );
  }

  return (
    <form
      autoComplete="off"
      action={(fd) =>
        start(async () => {
          try {
            await onSave(fd);
            setOpen(false);
            toast.success("Đã thêm chi phí");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Lỗi");
          }
        })
      }
      className="border border-orange-200 bg-orange-50/40 rounded-lg p-4 space-y-3"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Tháng *</label>
          <input
            type="month"
            name="expenseMonth"
            defaultValue={currentMonth}
            required
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Loại *</label>
          <select name="category" required className="input" defaultValue="salary">
            <option value="salary">Lương</option>
            <option value="rent">Thuê VP</option>
            <option value="marketing">Marketing</option>
            <option value="utilities">Điện/Nước/Net</option>
            <option value="outsource">Thuê ngoài</option>
            <option value="other">Khác</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Số tiền *</label>
          <MoneyInput name="amount" className="input" required />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Mô tả</label>
        <input
          type="text"
          name="description"
          className="input"
          placeholder="VD: Lương team T7, thuê VP T7..."
        />
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Ghi chú</label>
        <input type="text" name="note" className="input" placeholder="(tùy chọn)" />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
          disabled={pending}
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </form>
  );
}
