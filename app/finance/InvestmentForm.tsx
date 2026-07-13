"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MoneyInput from "@/components/MoneyInput";
import { toast } from "sonner";

type Props = {
  onSave: (fd: FormData) => Promise<void>;
};

export default function InvestmentForm({ onSave }: Props) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"
      >
        + Thêm khoản đầu tư
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
            toast.success("Đã thêm khoản đầu tư");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Lỗi");
          }
        })
      }
      className="border border-orange-200 bg-orange-50/40 rounded-lg p-4 space-y-3"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Ngày đầu tư *</label>
          <input type="date" name="investedAt" required className="input" />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Loại *</label>
          <select name="category" required className="input" defaultValue="equipment">
            <option value="office">Văn phòng</option>
            <option value="equipment">Thiết bị</option>
            <option value="software">Phần mềm / License</option>
            <option value="vehicle">Phương tiện</option>
            <option value="other">Khác</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Số tiền *</label>
          <MoneyInput name="amount" className="input" required />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">
            Khấu hao (tháng)
          </label>
          <input
            type="number"
            name="amortizationMonths"
            className="input"
            placeholder="Trống = 1 lần"
            min="1"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Mô tả *</label>
        <input
          type="text"
          name="description"
          required
          className="input"
          placeholder="VD: Máy tính CEO, License Adobe..."
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
