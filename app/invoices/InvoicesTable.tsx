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
  { key: "empty", label: "Trống (chưa có ĐC)" },
];

export default function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const [qNumber, setQNumber] = useState("");
  const [qDate, setQDate] = useState("");
  const [qPartner, setQPartner] = useState("");
  const [qStatus, setQStatus] = useState<PayStatus | "all">("all");

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
    const n = qNumber.trim().toLowerCase();
    const d = qDate.trim();
    const p = qPartner.trim().toLowerCase();
    if (!n && !d && !p && qStatus === "all") return rows;
    return rows.filter((r) => {
      if (n && !r.number.toLowerCase().includes(n)) return false;
      // qDate từ type="date" là yyyy-mm-dd chuẩn → so sánh exact với r.date
      if (d && r.date !== d) return false;
      if (p && (r.partnerName ?? "").toLowerCase() !== p) return false;
      if (qStatus !== "all" && computeStatus(r) !== qStatus) return false;
      return true;
    });
  }, [rows, qNumber, qDate, qPartner, qStatus]);

  const clearAll = () => {
    setQNumber("");
    setQDate("");
    setQPartner("");
    setQStatus("all");
  };
  const hasFilter = qNumber || qDate || qPartner || qStatus !== "all";

  return (
    <>
      <Card className="[--card-spacing:0.75rem] px-4 gap-3 flex-row flex-wrap items-end">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Số HĐ</label>
          <input
            type="search"
            value={qNumber}
            onChange={(e) => setQNumber(e.target.value)}
            placeholder="vd: 29"
            className="input w-40"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Ngày HĐ</label>
          <input
            type="date"
            value={qDate}
            onChange={(e) => setQDate(e.target.value)}
            className="input w-44"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">CĐT</label>
          <SearchableSelect
            value={qPartner}
            onChange={(v) => setQPartner(v)}
            options={partnerOptions}
            emptyOption="— Tất cả —"
            placeholder="Gõ tên CĐT..."
            className="w-64"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Trạng thái thu</label>
          <select
            value={qStatus}
            onChange={(e) => setQStatus(e.target.value as PayStatus | "all")}
            className="input w-44"
          >
            {PAY_STATUS_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Xóa lọc
          </Button>
        )}
        <div className="text-xs text-slate-500 ml-auto">
          {filtered.length}/{rows.length} hóa đơn
        </div>
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
