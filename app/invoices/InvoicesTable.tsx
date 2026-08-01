"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export default function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const [qNumber, setQNumber] = useState("");
  const [qDate, setQDate] = useState("");
  const [qPartner, setQPartner] = useState("");

  const filtered = useMemo(() => {
    const n = qNumber.trim().toLowerCase();
    const d = qDate.trim().toLowerCase();
    const p = qPartner.trim().toLowerCase();
    if (!n && !d && !p) return rows;
    return rows.filter((r) => {
      if (n && !r.number.toLowerCase().includes(n)) return false;
      if (d && !(r.date ?? "").toLowerCase().includes(d)) return false;
      if (p && !(r.partnerName ?? "").toLowerCase().includes(p)) return false;
      return true;
    });
  }, [rows, qNumber, qDate, qPartner]);

  const clearAll = () => {
    setQNumber("");
    setQDate("");
    setQPartner("");
  };
  const hasFilter = qNumber || qDate || qPartner;

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
            type="search"
            value={qDate}
            onChange={(e) => setQDate(e.target.value)}
            placeholder="vd: 2026-07 hoặc 2026-07-15"
            className="input w-64"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">CĐT</label>
          <input
            type="search"
            value={qPartner}
            onChange={(e) => setQPartner(e.target.value)}
            placeholder="vd: Dataloca"
            className="input w-56"
          />
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
              const status =
                r.total === 0
                  ? "empty"
                  : r.remaining <= 0
                    ? "paid"
                    : r.paid > 0
                      ? "partial"
                      : "unpaid";
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
