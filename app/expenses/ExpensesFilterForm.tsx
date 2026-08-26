"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useState } from "react";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";

type Props = {
  statusParam?: string;
  categoryParam?: string;
  requesterParam?: string;
  fromParam?: string;
  toParam?: string;
  hasFilter: boolean;
};

/**
 * Filter form /expenses — Loại / Người tạo / Từ ngày / Đến ngày.
 * Status filter dùng pill riêng bên trên.
 * onSubmit build URL sạch, preserve status.
 */
export default function ExpensesFilterForm(props: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(props.fromParam ?? "");
  const [to, setTo] = useState(props.toParam ?? "");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const qs = new URLSearchParams();
    if (props.statusParam) qs.set("status", props.statusParam);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    for (const [key, value] of fd.entries()) {
      if (key === "from" || key === "to") continue;
      const v = typeof value === "string" ? value.trim() : "";
      if (v) qs.set(key, v);
    }
    router.push(`/expenses${qs.toString() ? "?" + qs.toString() : ""}`);
  };

  const resetUrl = props.statusParam ? `/expenses?status=${props.statusParam}` : "/expenses";

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end flex-wrap">
      <div>
        <label className="block text-xs text-slate-600 mb-1">Loại</label>
        <select name="category" defaultValue={props.categoryParam ?? ""} className="input min-w-44">
          <option value="">— Tất cả —</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Người tạo</label>
        <input
          type="text"
          name="requester"
          defaultValue={props.requesterParam ?? ""}
          className="input min-w-56"
          placeholder="email@..."
        />
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Từ ngày</label>
        <DatePicker value={from} onChange={setFrom} className="w-40" />
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Đến ngày</label>
        <DatePicker value={to} onChange={setTo} className="w-40" />
      </div>
      <Button
        type="submit"
        className="h-[36px] px-4 bg-slate-100 text-slate-900 border border-slate-300 hover:bg-slate-200 self-end"
      >
        Lọc
      </Button>
      {props.hasFilter && (
        <Button variant="outline" className="h-[36px] px-4 self-end" render={<Link href={resetUrl} />}>
          Reset
        </Button>
      )}
    </form>
  );
}
