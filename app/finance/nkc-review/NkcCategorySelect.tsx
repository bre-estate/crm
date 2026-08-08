"use client";
import { useTransition } from "react";
import { CATEGORIES, type CategoryKey } from "@/lib/transaction-classifier";
import { updateNkcCategory } from "./actions";

const OPTIONS = Object.values(CATEGORIES).map(c => ({
  key: c.key, label: `${c.kimBc ? c.kimBc + " " : ""}${c.label}`, group: c.group,
}));
const GROUP_LABEL: Record<string, string> = {
  inflow: "Dòng tiền vào",
  cogs: "Giá vốn (Kim 2.x)",
  opex: "OPEX (Kim 4.x)",
  non_pnl: "Không tính P&L",
  unknown: "Chưa xác định",
};

export function NkcCategorySelect({ id, value, source }: { id: number; value: string | null; source: string | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      className="text-xs border rounded px-1 py-0.5 max-w-[220px] bg-white"
      value={value ?? "chua_phan_loai"}
      disabled={pending}
      onChange={(e) => {
        const cat = e.target.value as CategoryKey;
        startTransition(() => { updateNkcCategory(id, cat); });
      }}
      title={source === "manual" ? "Đã chỉnh tay" : `Auto (${source ?? "?"})`}
    >
      {(["inflow","cogs","opex","non_pnl","unknown"] as const).map(g => (
        <optgroup key={g} label={GROUP_LABEL[g]}>
          {OPTIONS.filter(o => o.group === g).map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
