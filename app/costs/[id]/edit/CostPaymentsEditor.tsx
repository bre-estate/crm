"use client";

import { useState, useTransition } from "react";
import MoneyInput from "@/components/MoneyInput";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

export default function CostPaymentsEditor({ payments, onUpdate, onDelete, onAdd }: Props) {
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  const safeRun = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
      } catch (e) {
        if (isRedirect(e)) throw e;
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });

  return (
    <Card className="[--card-spacing:1.25rem] px-5 space-y-3">
      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
        <div className="text-base font-semibold text-slate-800">
          💸 Đã chi tiền chưa?{payments.length > 0 ? ` · ✅ ${payments.length} lần` : ""}
        </div>
        {!showAdd && (
          <Button
            type="button"
            size="sm"
            onClick={() => setShowAdd(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            + Thêm chi
          </Button>
        )}
      </div>

      <div className="text-xs text-slate-500 -mt-1">
        Số tiền có thể âm (VD chi dư đợt trước, đợt sau thu lại → nhập -1.000.000).
      </div>

      {payments.length === 0 && !showAdd && (
        <div className="text-sm text-slate-500 italic py-2">
          Chưa có khoản chi nào. Bấm "+ Thêm chi" khi đã chi cho người này.
        </div>
      )}

      {payments.map((p) => (
        <form
          key={p.id}
          action={(fd) => safeRun(() => onUpdate(p.id, fd))}
          className="grid grid-cols-12 gap-2 items-end pb-2 border-b border-slate-100"
        >
          <div className="col-span-3">
            <label className="block text-xs text-slate-600 mb-1">Ngày chi</label>
            <input
              type="date"
              name="paymentDate"
              defaultValue={p.paymentDate ?? ""}
              className="input"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-xs text-slate-600 mb-1">Số tiền</label>
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
          <div className="col-span-2 flex gap-2 items-center h-[38px]">
            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Lưu
            </Button>
            <Button
              type="button"
              size="lg"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (confirm("Xóa khoản chi này?")) safeRun(() => onDelete(p.id));
              }}
            >
              Xóa
            </Button>
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
            <label className="block text-xs text-slate-600 mb-1">Ngày chi</label>
            <input type="date" name="paymentDate" className="input" />
          </div>
          <div className="col-span-3">
            <label className="block text-xs text-slate-600 mb-1">Số tiền</label>
            <MoneyInput name="amount" defaultValue={0} className="input" />
          </div>
          <div className="col-span-4">
            <label className="block text-xs text-slate-600 mb-1">Ghi chú</label>
            <input name="note" className="input" placeholder="tuỳ chọn" />
          </div>
          <div className="col-span-2 flex gap-2 items-center h-[38px]">
            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              + Thêm
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => setShowAdd(false)}
            >
              Huỷ
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
