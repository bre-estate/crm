"use client";

import { useState } from "react";
import Link from "next/link";
import ExpandToggle from "@/components/ExpandToggle";
import {
  fmtMoney,
  fmtDate,
  fmtPct,
  fmtPctRaw,
  costTypeLabel,
  toTitleCase,
} from "@/lib/format";

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
  // Aggregate cho căn × loại (không phụ thuộc filter):
  //   target = mức chi tối đa (computeLuyKe(cfg, costType, 1))
  //   totalPayableForType = sum(amountPayable) của all recons cùng product+costType
  //   totalPaidForType    = sum(payments_out) của all recons cùng product+costType
  target: number;
  totalPayableForType: number;
  totalPaidForType: number;
};

export default function CostReconRow({
  row: r,
  paid,
  payments,
  editHref,
  target,
  totalPayableForType,
  totalPaidForType,
}: Props) {
  const [open, setOpen] = useState(false);
  const payable = Number(r.amountPayable ?? 0);
  const isPaidFull = Math.abs(payable - paid) < 1000 && payable !== 0;
  // % đã chi cho loại này trên căn (tổng đã chi / target, cap ở 999% cho weird cases)
  const pctChiForType =
    target > 0 ? Math.min(999, (totalPaidForType / target) * 100) : 0;
  const pctColor =
    target < 1
      ? "text-slate-400"
      : pctChiForType >= 99.5
        ? "text-green-700"
        : pctChiForType > 100
          ? "text-purple-700"
          : "text-amber-700";

  return (
    <>
      <tr
        data-bulk-row-id={r.id}
        className={`border-t border-slate-100 hover:bg-slate-50 ${open ? "bg-slate-50" : ""}`}
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
        {/* Số tiền đợt này + badge trạng thái chi (✓ đã trả đủ, ⏳ chưa trả) */}
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
                <span
                  title="Chưa trả"
                  className="text-slate-400 text-[10px]"
                >
                  ⏳
                </span>
              )
            )}
          </div>
        </td>
        {/* Target tổng loại cho căn */}
        <td
          className="p-2 text-right tabular-nums text-slate-600 text-xs"
          title={`Mức chi tối đa cho ${costTypeLabel(r.costType)} của căn này`}
        >
          {target > 0 ? fmtMoney(target) : "—"}
        </td>
        {/* % đã chi tổng loại / target */}
        <td
          className={`p-2 text-right tabular-nums font-semibold ${pctColor}`}
          title={
            target > 0
              ? `Tổng đã chi ${fmtMoney(totalPaidForType)} / target ${fmtMoney(target)}`
              : "Không có target (căn chưa config loại này)"
          }
        >
          {target > 0 ? `${pctChiForType.toFixed(0)}%` : "—"}
        </td>
        <td className="p-2 text-right">
          <Link href={editHref} className="text-blue-600 hover:underline text-xs">
            Sửa
          </Link>
        </td>
        <td className="p-2 text-right">
          <ExpandToggle isOpen={open} onClick={() => setOpen((v) => !v)} />
        </td>
      </tr>
      {open && (
        <tr key={`${r.id}-detail`} className="bg-slate-50/70 border-t border-slate-100">
          <td colSpan={11} className="p-4">
            <DetailDrawer
              row={r}
              paid={paid}
              payments={payments}
              target={target}
              totalPayableForType={totalPayableForType}
              totalPaidForType={totalPaidForType}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Drawer chi tiết — content phù hợp theo costType.
 * - sale_commission: tiến độ chi HH + N + PMG đợt
 * - customer_support: chỉ số + note
 * - kpi_*: rate + KPI đợt + target
 * - bonus_* / cdt_bonus_*: chỉ số flat + note
 */
function DetailDrawer({
  row: r,
  paid,
  payments,
  target,
  totalPayableForType,
  totalPaidForType,
}: {
  row: CostReconRowData;
  paid: number;
  payments: CostReconPayment[];
  target: number;
  totalPayableForType: number;
  totalPaidForType: number;
}) {
  const isSaleComm = r.costType === "sale_commission";
  const isKpi = r.costType.startsWith("kpi_");
  const isSupport = r.costType === "customer_support";
  const isBonus =
    r.costType === "bonus_sale" ||
    r.costType === "bonus_manager" ||
    r.costType === "cdt_bonus_sale" ||
    r.costType === "cdt_bonus_manager";

  // Tiến độ chi cho căn (progress bar cho HH sale)
  const beforePct = target > 0 ? Math.min(100, ((totalPaidForType - paid) / target) * 100) : 0;
  const thisPct =
    target > 0
      ? Math.min(100 - beforePct, (paid / target) * 100)
      : 0;
  const totalPct = beforePct + thisPct;

  return (
    <div className="space-y-3">
      {/* Progress bar tiến độ chi cho loại này của căn — chỉ với sale_commission + kpi */}
      {(isSaleComm || isKpi) && target > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-slate-700">
              Tiến độ chi <span className="text-orange-700">{costTypeLabel(r.costType)}</span> cho căn
            </span>
            <span className="text-slate-500">
              {fmtMoney(totalPaidForType)} / {fmtMoney(target)}{" "}
              <span
                className={`font-semibold ml-1 ${
                  totalPct >= 99.5 ? "text-green-700" : "text-amber-700"
                }`}
              >
                ({fmtPctRaw(totalPct, 0)})
              </span>
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex">
            <div
              className="bg-green-500 h-full"
              style={{ width: `${beforePct}%` }}
              title={`Các đợt khác: ${fmtMoney(totalPaidForType - paid)}`}
            />
            <div
              className="bg-blue-400 h-full"
              style={{ width: `${thisPct}%` }}
              title={`Đợt này: ${fmtMoney(paid)}`}
            />
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Xanh lá = các đợt khác · Xanh dương = đợt này · Còn thiếu{" "}
            {fmtMoney(Math.max(0, target - totalPaidForType))}
          </div>
        </div>
      )}

      {/* Info per costType */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {isSaleComm && (
          <>
            <DetailItem
              label="N (tiến độ khách trả CĐT)"
              value={r.paymentProgressPct ? fmtPct(r.paymentProgressPct) : "—"}
            />
            <DetailItem
              label="PMG đợt"
              value={r.pmgThis ? fmtMoney(r.pmgThis) : "—"}
            />
            <DetailItem
              label="Mức chi tối đa (target)"
              value={target > 0 ? fmtMoney(target) : "—"}
            />
            <DetailItem
              label="Còn thiếu / target"
              value={
                target > 0
                  ? fmtMoney(Math.max(0, target - totalPaidForType))
                  : "—"
              }
            />
          </>
        )}
        {isKpi && (
          <>
            <DetailItem
              label={`% ${costTypeLabel(r.costType)}`}
              value={r.kpiRate ? fmtPct(r.kpiRate) : "—"}
            />
            <DetailItem
              label="KPI đợt (tính bởi rate)"
              value={r.kpiAmount ? fmtMoney(r.kpiAmount) : "—"}
            />
            <DetailItem
              label="Mức chi tối đa (target)"
              value={target > 0 ? fmtMoney(target) : "—"}
            />
            <DetailItem
              label="Còn thiếu / target"
              value={
                target > 0
                  ? fmtMoney(Math.max(0, target - totalPaidForType))
                  : "—"
              }
            />
          </>
        )}
        {isSupport && (
          <>
            <DetailItem
              label="Số tiền hỗ trợ khách"
              value={r.customerSupport ? fmtMoney(r.customerSupport) : fmtMoney(r.amountPayable)}
            />
            <DetailItem
              label="Mức chi tối đa (target)"
              value={target > 0 ? fmtMoney(target) : "—"}
            />
          </>
        )}
        {isBonus && (
          <>
            <DetailItem
              label="Số tiền thưởng"
              value={fmtMoney(r.amountPayable)}
            />
            <DetailItem
              label="Mức chi tối đa (target)"
              value={target > 0 ? fmtMoney(target) : "—"}
            />
          </>
        )}
      </div>

      {/* Ghi chú */}
      {r.note && r.note.trim() && (
        <div className="pt-3 border-t border-slate-200">
          <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">
            Ghi chú
          </div>
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{r.note}</div>
        </div>
      )}

      {/* Chi tiết thanh toán */}
      <div className="pt-3 border-t border-slate-200">
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
    </div>
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
