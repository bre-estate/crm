"use client";

import { useState } from "react";
import Link from "next/link";
import MoneyInput from "@/components/MoneyInput";
import SearchableSelect from "@/components/SearchableSelect";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/expenses";

type Props = {
  mode: "create" | "edit";
  defaults?: {
    title?: string | null;
    category?: string | null;
    amount?: number | null;
    expenseDate?: string | null;
    paymentMethod?: string | null;
    approverEmail?: string | null;
    accountCode?: string | null;
    note?: string | null;
  };
  approverOptions: { value: string; label: string; sublabel?: string }[];
  onSave: (fd: FormData) => Promise<void>;
  cancelHref: string;
};

export default function ExpenseForm({ mode, defaults, approverOptions, onSave, cancelHref }: Props) {
  const [expenseDate, setExpenseDate] = useState(
    defaults?.expenseDate ?? new Date().toISOString().slice(0, 10),
  );
  const [approverEmail, setApproverEmail] = useState(defaults?.approverEmail ?? "");

  return (
    <form action={onSave} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Tiêu đề" required>
          <input
            type="text"
            name="title"
            defaultValue={defaults?.title ?? ""}
            className="input"
            required
            placeholder="VD: Mua văn phòng phẩm tháng 8"
          />
        </Field>
        <Field label="Loại chi phí" required>
          <select
            name="category"
            defaultValue={defaults?.category ?? "office"}
            className="input"
            required
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Số tiền (VND)" required>
          <MoneyInput
            name="amount"
            defaultValue={defaults?.amount ?? 0}
            className="input"
            required
          />
        </Field>
        <Field label="Ngày phát sinh" required>
          <DatePicker value={expenseDate} onChange={setExpenseDate} className="w-full" />
          <input type="hidden" name="expenseDate" value={expenseDate} />
        </Field>
        <Field label="Phương thức chi">
          <select
            name="paymentMethod"
            defaultValue={defaults?.paymentMethod ?? ""}
            className="input"
          >
            <option value="">— Chọn —</option>
            {PAYMENT_METHODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Người duyệt">
          <SearchableSelect
            value={approverEmail}
            onChange={setApproverEmail}
            options={approverOptions}
            emptyOption="— Chưa chọn (chọn khi submit) —"
            placeholder="Chọn người duyệt..."
            className="w-full"
          />
          <input type="hidden" name="approverEmail" value={approverEmail} />
        </Field>
      </div>

      <div>
        <Field label="Ghi chú">
          <textarea
            name="note"
            defaultValue={defaults?.note ?? ""}
            className="input min-h-24"
            placeholder="Chi tiết, số hóa đơn, đầu mối liên hệ..."
          />
        </Field>
      </div>

      <div>
        <Field label="Mã tài khoản kế toán (nếu có)">
          <input
            type="text"
            name="accountCode"
            defaultValue={defaults?.accountCode ?? ""}
            className="input w-40"
            placeholder="VD: 6428"
          />
          <p className="text-xs text-slate-500 mt-1">
            Optional — kế toán fill khi cần lên BCTC. Không bắt buộc.
          </p>
        </Field>
      </div>

      <div className="flex gap-2 pt-3 border-t border-slate-100">
        <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white">
          {mode === "create" ? "Tạo yêu cầu (Nháp)" : "Lưu thay đổi"}
        </Button>
        <Button variant="outline" render={<Link href={cancelHref} />}>
          Hủy
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-600 mb-1">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
    </div>
  );
}
