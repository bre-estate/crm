"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtMoney } from "@/lib/format";

export type InvoiceRow = {
  id: number;
  number: string;
  date: string | null;
  total: number;
  paid: number;
  remaining: number;
  reconCount: number;
};

export default function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const [qNumber, setQNumber] = useState("");
  const [qDate, setQDate] = useState("");

  const filtered = useMemo(() => {
    const n = qNumber.trim().toLowerCase();
    const d = qDate.trim().toLowerCase();
    if (!n && !d) return rows;
    return rows.filter((r) => {
      if (n && !r.number.toLowerCase().includes(n)) return false;
      if (d && !(r.date ?? "").toLowerCase().includes(d)) return false;
      return true;
    });
  }, [rows, qNumber, qDate]);

  const clearAll = () => {
    setQNumber("");
    setQDate("");
  };
  const hasFilter = qNumber || qDate;

  return (
    <>
      <div className="flex items-end gap-3 flex-wrap">
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
        {hasFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="px-3 py-2 text-xs text-blue-600 hover:underline"
          >
            Xoá lọc
          </button>
        )}
        <div className="text-xs text-slate-500 ml-auto">
          {filtered.length}/{rows.length} hóa đơn
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mt-3">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Số HĐ</th>
              <th className="text-left p-3">Ngày HĐ</th>
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
                      className={
                        status === "paid"
                          ? "text-slate-400"
                          : status === "partial"
                            ? "text-orange-600 font-medium"
                            : status === "unpaid"
                              ? "text-red-600 font-medium"
                              : "text-slate-300"
                      }
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
                <td colSpan={7} className="p-6 text-center text-slate-500 text-sm">
                  {rows.length === 0
                    ? "Chưa có hóa đơn nào. HĐ tự sinh khi tạo ĐC doanh thu có số HĐ."
                    : "Không tìm thấy hóa đơn khớp bộ lọc."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
