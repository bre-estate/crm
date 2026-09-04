"use client";

import { useState, useTransition } from "react";
import MoneyInput from "@/components/MoneyInput";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/format";

type Payment = {
  id: number;
  paymentDate: string | null;
  amount: number | string | null;
  note: string | null;
};

type Props = {
  payments: Payment[];
  payableAmount: number;
  onUpdate: (id: number, fd: FormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAdd: (fd: FormData) => Promise<void>;
};

const isRedirect = (e: unknown): boolean =>
  !!e &&
  typeof e === "object" &&
  "digest" in e &&
  String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");

export default function CostPaymentsEditor({ payments, payableAmount, onUpdate, onDelete, onAdd }: Props) {
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const owed = payableAmount - totalPaid;
  const isFullyPaid = Math.abs(owed) < 1000;
  const isOverpaid = owed <= -1000;

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
    <Card className="[--card-spacing:0.75rem] px-5">
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

      {/* Summary: ĐC / Đã chi / Còn nợ */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-slate-500">Đợt này ĐC:</span>{" "}
          <span className="font-semibold tabular-nums text-slate-900">
            {fmtMoney(payableAmount)}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Đã chi:</span>{" "}
          <span className="font-semibold tabular-nums text-slate-900">{fmtMoney(totalPaid)}</span>
        </div>
        <div>
          <span className="text-slate-500">
            {isOverpaid ? "Chi dư:" : "Còn nợ:"}
          </span>{" "}
          <span
            className={`font-semibold tabular-nums ${
              isFullyPaid
                ? "text-green-700"
                : isOverpaid
                  ? "text-purple-700"
                  : "text-red-600"
            }`}
          >
            {isFullyPaid ? "✓ đủ" : fmtMoney(Math.abs(owed))}
          </span>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        Số tiền có thể âm (VD chi dư đợt trước, đợt sau thu lại → nhập -1.000.000).
      </div>

      {payments.length === 0 && !showAdd && (
        <div className="text-sm text-slate-500 italic">
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
