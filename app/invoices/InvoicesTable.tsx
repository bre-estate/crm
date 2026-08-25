"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SearchableSelect from "@/components/SearchableSelect";
import { cn } from "@/lib/utils";

export type InvoiceRow = {
  id: number;
  number: string;
  date: string | null;
  partnerName: string | null;
  total: number;
  paid: number;
  remaining: number;
  reconCount: number;
};

// Trạng thái thanh toán của HĐ, compute từ total/paid.
type PayStatus = "empty" | "paid" | "partial" | "unpaid";
function computeStatus(r: InvoiceRow): PayStatus {
  if (r.total === 0) return "empty";
  if (r.remaining <= 0) return "paid";
  if (r.paid > 0) return "partial";
  return "unpaid";
}

const PAY_STATUS_OPTIONS: { key: PayStatus | "all"; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "paid", label: "Đã thu đủ" },
  { key: "partial", label: "Thu 1 phần" },
  { key: "unpaid", label: "Chưa thu" },
];

// State draft (đang gõ) vs applied (đã bấm Lọc).
type Filters = {
  number: string;
  date: string;
  partner: string;
  status: PayStatus | "all";
};

const EMPTY: Filters = { number: "", date: "", partner: "", status: "all" };

export default function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  // draft: state input hiện tại. applied: state đã Lọc — dùng để filter rows.
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);

  // Danh sách CĐT unique cho autocomplete.
  const partnerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) {
      if (r.partnerName) names.add(r.partnerName);
    }
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((name) => ({ value: name, label: name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const n = applied.number.trim().toLowerCase();
    const d = applied.date.trim();
    const p = applied.partner.trim().toLowerCase();
    const s = applied.status;
    if (!n && !d && !p && s === "all") return rows;
    return rows.filter((r) => {
      if (n && !r.number.toLowerCase().includes(n)) return false;
      if (d && r.date !== d) return false;
      if (p && (r.partnerName ?? "").toLowerCase() !== p) return false;
      if (s !== "all" && computeStatus(r) !== s) return false;
      return true;
    });
  }, [rows, applied]);

  const applyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied(draft);
  };

  const clearAll = () => {
    setDraft(EMPTY);
    setApplied(EMPTY);
  };

  const hasApplied =
    !!applied.number || !!applied.date || !!applied.partner || applied.status !== "all";

  return (
    <>
      <Card className="[--card-spacing:0.75rem] px-4 py-3 gap-3">
        <form onSubmit={applyFilter} className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Số HĐ</label>
            <input
              type="search"
              value={draft.number}
              onChange={(e) => setDraft({ ...draft, number: e.target.value })}
              placeholder="vd: 29"
              className="input w-40"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Ngày HĐ</label>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              className="input w-44"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">CĐT</label>
            <SearchableSelect
              value={draft.partner}
              onChange={(v) => setDraft({ ...draft, partner: v })}
              options={partnerOptions}
              emptyOption="— Tất cả —"
              placeholder="Gõ tên CĐT..."
              className="w-64"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Trạng thái thu</label>
            <select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as PayStatus | "all" })}
              className="input w-40"
            >
              {PAY_STATUS_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            Lọc
          </Button>
          {hasApplied && (
            <Button type="button" variant="outline" onClick={clearAll}>
              Reset
            </Button>
          )}
          <div className="text-xs text-slate-500 ml-auto">
            {filtered.length}/{rows.length} hóa đơn
          </div>
        </form>
      </Card>

      <Card className="p-0 gap-0 overflow-hidden mt-3">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Số HĐ</th>
              <th className="text-left p-3">Ngày HĐ</th>
              <th className="text-left p-3">CĐT</th>
              <th className="text-right p-3">Số căn ĐC</th>
              <th className="text-right p-3">Giá trị HĐ</th>
              <th className="text-right p-3">Đã thu</th>
              <th className="text-right p-3">Còn nợ</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const status = computeStatus(r);
              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs font-medium">{r.number}</td>
                  <td className="p-3 text-slate-500">
                    {r.date || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-3 text-slate-700">
                    {r.partnerName || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {r.reconCount > 0 ? (
                      r.reconCount
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums font-medium">
                    {fmtMoney(r.total)}
                  </td>
                  <td className="p-3 text-right tabular-nums text-green-700">
                    {r.paid > 0 ? fmtMoney(r.paid) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    <span
                      className={cn(
                        status === "paid" && "text-slate-400",
                        status === "partial" && "text-orange-600 font-medium",
                        status === "unpaid" && "text-red-600 font-medium",
                        status === "empty" && "text-slate-300",
                      )}
                    >
                      {status === "empty"
                        ? "—"
                        : status === "paid"
                          ? "Đã thu đủ"
                          : fmtMoney(r.remaining)}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      href={`/invoices/${r.id}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Xem
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500 text-sm">
                  {rows.length === 0
                    ? "Chưa có hóa đơn nào. HĐ tự sinh khi tạo ĐC doanh thu có số HĐ."
                    : "Không tìm thấy hóa đơn khớp bộ lọc."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
