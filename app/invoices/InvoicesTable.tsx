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
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    // Split thành nhiều từ khóa — mỗi từ phải match ở đâu đó (số HĐ hoặc ngày)
    const terms = s.split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const hay = `${r.number} ${r.date ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, q]);

  return (
    <>
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo số HĐ hoặc ngày (vd: 29, 2026-07, 30 07)"
          className="input max-w-sm"
        />
        <div className="text-xs text-slate-500">
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
                    : `Không tìm thấy hóa đơn khớp "${q}".`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
