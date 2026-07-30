"use client";

import { useState } from "react";
import Link from "next/link";
import ExpandToggle from "@/components/ExpandToggle";
import { fmtMoney, fmtDate, fmtPct, costTypeLabel, toTitleCase } from "@/lib/format";

export type CostReconPayment = {
  id: number;
  date: string | null;
  amount: number;
  note: string | null;
};

export type CostReconRowData = {
  id: number;
  productId: number;
  date: string | null;
  employee: string;
  costType: string;
  commissionRate: number | null;
  kpiRate: number | null;
  paymentProgressPct: number | null;
  pmgThis: number | null;
  kpiAmount: number | null;
  customerSupport: number | null;
  amountPayable: number | null;
  unitCode: string | null;
  projectName: string | null;
  note: string | null;
};

type Props = {
  row: CostReconRowData;
  paid: number;
  payments: CostReconPayment[];
  editHref: string;
};

export default function CostReconRow({ row: r, paid, payments, editHref }: Props) {
  const [open, setOpen] = useState(false);
  const payable = Number(r.amountPayable ?? 0);
  const remaining = payable - paid;
  return (
    <>
      <tr
        data-bulk-row-id={r.id}
        className={`border-t border-slate-100 hover:bg-slate-50 ${open ? "bg-slate-50" : ""}`}
      >
        <td className="p-2">
          <ExpandToggle isOpen={open} onClick={() => setOpen((v) => !v)} />
        </td>
        <td className="p-2 text-center">
          <input
            type="checkbox"
            className="js-bulk-check cursor-pointer"
            data-bulk-id={r.id}
          />
        </td>
        <td className="p-2 text-xs">{fmtDate(r.date)}</td>
        <td className="p-2 text-xs">{toTitleCase(r.employee)}</td>
        <td className="p-2">
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100">
            {costTypeLabel(r.costType)}
          </span>
        </td>
        <td className="p-2">
          <div className="text-xs">{r.projectName}</div>
          <Link
            href={`/products/${r.productId}`}
            className="font-mono text-xs text-blue-600 hover:underline"
          >
            {r.unitCode}
          </Link>
        </td>
        <td className="p-2 text-right tabular-nums text-xs">
          {r.kpiRate
            ? fmtPct(r.kpiRate)
            : r.commissionRate
              ? fmtPct(r.commissionRate)
              : "—"}
        </td>
        <td
          className={`p-2 text-right tabular-nums font-semibold ${
            payable < 0 ? "text-red-600" : ""
          }`}
          title={payable < 0 ? "Số âm = điều chỉnh / hoàn trả" : ""}
        >
          {fmtMoney(payable)}
        </td>
        <td className="p-2 text-right tabular-nums text-green-700">
          {paid !== 0 ? fmtMoney(paid) : <span className="text-slate-400">Chưa trả</span>}
        </td>
        <td
          className={`p-2 text-right tabular-nums ${
            Math.abs(remaining) < 1000
              ? "text-slate-400"
              : remaining > 0
                ? "text-red-600 font-semibold"
                : "text-purple-700"
          }`}
          title={
            Math.abs(remaining) < 1000
              ? "Đã trả đủ"
              : remaining > 0
                ? "BRE còn nợ NV"
                : "BRE đã trả dư"
          }
        >
          {fmtMoney(remaining)}
        </td>
        <td className="p-2 text-right">
          <Link href={editHref} className="text-blue-600 hover:underline text-xs">
            Sửa
          </Link>
        </td>
      </tr>
      {open && (
        <tr key={`${r.id}-detail`} className="bg-slate-50/70 border-t border-slate-100">
          <td colSpan={11} className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <DetailItem
                label="N (tiến độ khách trả CĐT)"
                value={
                  r.paymentProgressPct
                    ? fmtPct(r.paymentProgressPct)
                    : "—"
                }
              />
              <DetailItem
                label="PMG đợt"
                value={r.pmgThis ? fmtMoney(r.pmgThis) : "—"}
              />
              <DetailItem
                label="KPI đợt"
                value={r.kpiAmount ? fmtMoney(r.kpiAmount) : "—"}
              />
              <DetailItem
                label="Hỗ trợ khách"
                value={r.customerSupport ? fmtMoney(r.customerSupport) : "—"}
              />
            </div>
            {r.note && r.note.trim() && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">
                  Ghi chú
                </div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">{r.note}</div>
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">
                Chi tiết thanh toán ({payments.length})
              </div>
              {payments.length === 0 ? (
                <div className="text-xs text-slate-400 italic">Chưa có khoản chi nào.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="text-left py-1 pr-4">Ngày</th>
                        <th className="text-right py-1 pr-4">Số tiền</th>
                        <th className="text-left py-1">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-t border-slate-200">
                          <td className="py-1 pr-4 tabular-nums font-mono">
                            {fmtDate(p.date)}
                          </td>
                          <td
                            className={`py-1 pr-4 text-right tabular-nums ${
                              p.amount < 0 ? "text-red-600" : "text-slate-800"
                            }`}
                          >
                            {fmtMoney(p.amount)}
                          </td>
                          <td className="py-1 text-slate-500">{p.note ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="font-semibold tabular-nums mt-0.5 text-slate-800">{value}</div>
    </div>
  );
}
