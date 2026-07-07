"use client";

import { useState, useTransition } from "react";
import MoneyInput from "@/components/MoneyInput";

type Payment = {
  id: number;
  paymentDate: string | null;
  amount: number | string | null;
  note: string | null;
};

type Props = {
  payments: Payment[];
  onUpdate: (id: number, fd: FormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAdd: (fd: FormData) => Promise<void>;
};

const isRedirect = (e: unknown): boolean =>
  !!e &&
  typeof e === "object" &&
  "digest" in e &&
  String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");

export default function PaymentsEditor({ payments, onUpdate, onDelete, onAdd }: Props) {
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  const safeRun = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
      } catch (e) {
        if (isRedirect(e)) throw e;
        alert(e instanceof Error ? e.message : "Lỗi");
      }
    });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
        <div className="text-base font-semibold text-slate-800">
          💰 Ghi nhận thu tiền ({payments.length})
        </div>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
          >
            + Thêm thanh toán
          </button>
        )}
      </div>

      {payments.length === 0 && !showAdd && (
        <div className="text-sm text-slate-500 italic py-2">
          Chưa có thanh toán nào. Bấm "+ Thêm thanh toán" khi CĐT đã chuyển tiền.
        </div>
      )}

      {payments.map((p) => (
        <form
          key={p.id}
          action={(fd) => safeRun(() => onUpdate(p.id, fd))}
          className="grid grid-cols-12 gap-2 items-end pb-2 border-b border-slate-100"
        >
          <div className="col-span-3">
            <label className="block text-xs text-slate-600 mb-1">Ngày nhận</label>
            <input
              type="date"
              name="paymentDate"
              defaultValue={p.paymentDate ?? ""}
              className="input"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-xs text-slate-600 mb-1">Số tiền (VND)</label>
            <MoneyInput
              name="amount"
              defaultValue={Number(p.amount ?? 0)}
              className="input"
            />
          </div>
          <div className="col-span-4">
            <label className="block text-xs text-slate-600 mb-1">Ghi chú</label>
            <input
              name="note"
              defaultValue={p.note ?? ""}
              className="input"
              placeholder="tuỳ chọn"
            />
          </div>
          <div className="col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 bg-blue-600 text-white text-xs px-2 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Lưu
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Xoá thanh toán này?")) safeRun(() => onDelete(p.id));
              }}
              className="text-red-600 text-xs px-2 py-2 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
            >
              Xoá
            </button>
          </div>
        </form>
      ))}

      {showAdd && (
        <form
          action={(fd) =>
            safeRun(async () => {
              await onAdd(fd);
              setShowAdd(false);
            })
          }
          className="grid grid-cols-12 gap-2 items-end pt-2 bg-blue-50/50 -mx-2 px-2 py-3 rounded"
        >
          <div className="col-span-3">
            <label className="block text-xs text-slate-600 mb-1">Ngày nhận</label>
            <input type="date" name="paymentDate" className="input" />
          </div>
          <div className="col-span-3">
            <label className="block text-xs text-slate-600 mb-1">Số tiền (VND)</label>
            <MoneyInput name="amount" defaultValue={0} className="input" />
          </div>
          <div className="col-span-4">
            <label className="block text-xs text-slate-600 mb-1">Ghi chú</label>
            <input name="note" className="input" placeholder="tuỳ chọn" />
          </div>
          <div className="col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 bg-green-600 text-white text-xs px-2 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              + Thêm
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="text-slate-600 text-xs px-2 py-2 border border-slate-300 rounded hover:bg-slate-50"
            >
              Huỷ
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
