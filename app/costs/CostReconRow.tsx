"use client";

import Link from "next/link";
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
  // payments kept for future re-add of expand drawer if needed
  payments?: CostReconPayment[];
  editHref: string;
  // Aggregate cho căn × loại (không phụ thuộc filter):
  //   target             = mức chi tối đa (computeLuyKe(cfg, costType, 1))
  //   totalPaidForType   = sum(payments_out) của all recons cùng product+costType
  target: number;
  totalPayableForType: number;
  totalPaidForType: number;
};

export default function CostReconRow({
  row: r,
  paid,
  editHref,
  target,
  totalPaidForType,
}: Props) {
  const payable = Number(r.amountPayable ?? 0);
  const isPaidFull = Math.abs(payable - paid) < 1000 && payable !== 0;
  // % đã chi cho loại này trên căn (tổng đã chi / target)
  const pctChiForType =
    target > 0 ? Math.min(999, (totalPaidForType / target) * 100) : 0;
  const pctColor =
    target < 1
      ? "text-slate-400"
      : pctChiForType >= 99.5 && pctChiForType <= 100.5
        ? "text-green-700"
        : pctChiForType > 100.5
          ? "text-purple-700"
          : "text-amber-700";

  return (
    <tr
      data-bulk-row-id={r.id}
      className="border-t border-slate-100 hover:bg-slate-50"
    >
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
        <span
          className="text-xs px-2 py-0.5 rounded bg-slate-100"
          title={r.note ?? undefined}
        >
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
      {/* Số tiền đợt này + badge trạng thái chi */}
      <td
        className={`p-2 text-right tabular-nums font-semibold ${
          payable < 0 ? "text-red-600" : ""
        }`}
        title={payable < 0 ? "Số âm = điều chỉnh / hoàn trả" : ""}
      >
        <div className="inline-flex items-center gap-1 justify-end">
          <span>{fmtMoney(payable)}</span>
          {payable !== 0 && (
            isPaidFull ? (
              <span
                title={`Đã trả đủ ${fmtMoney(paid)}`}
                className="text-green-600"
              >
                ✓
              </span>
            ) : paid > 0 ? (
              <span
                title={`Đã trả 1 phần ${fmtMoney(paid)} / ${fmtMoney(payable)}`}
                className="text-amber-600"
              >
                ⏳
              </span>
            ) : (
              <span title="Chưa trả" className="text-slate-400 text-[10px]">
                ⏳
              </span>
            )
          )}
        </div>
      </td>
      {/* Tổng số tiền = target loại đó cho căn */}
      <td
        className="p-2 text-right tabular-nums text-slate-600 text-xs"
        title={`Mức chi tối đa cho ${costTypeLabel(r.costType)} của căn này`}
      >
        {target > 0 ? fmtMoney(target) : "—"}
      </td>
      {/* % đã chi tổng loại / tổng số tiền */}
      <td
        className={`p-2 text-right tabular-nums font-semibold ${pctColor}`}
        title={
          target > 0
            ? `Tổng đã chi ${fmtMoney(totalPaidForType)} / tổng số tiền ${fmtMoney(target)}`
            : "Căn chưa config loại này"
        }
      >
        {target > 0 ? `${pctChiForType.toFixed(0)}%` : "—"}
      </td>
      <td className="p-2 text-right">
        <Link href={editHref} className="text-blue-600 hover:underline text-xs">
          Sửa
        </Link>
      </td>
    </tr>
  );
}
