"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  HR_CHECK_LABELS,
  HR_CHECK_DESCRIPTIONS,
  PERCENT_FIELDS,
  FIELD_TO_COST_TYPE,
  filterByField,
  type HrCheckField,
  type HrCheckRow,
} from "@/lib/hrChecks";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtPct = (n: number) => (n * 100).toFixed(2) + "%";
const fmtM = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (abs >= 1000) return (n / 1000).toFixed(0) + "K";
  return fmt(n);
};

const FIELDS: HrCheckField[] = [
  "W", "X", "Y", "Z", "AA",
  "AB", "AC", "AD", "AE", "AF",
  "AG", "AH", "AI",
];

type Props = {
  rows: HrCheckRow[];
  activeField: HrCheckField;
  countByField: Record<HrCheckField, number>;
  sumByField: Record<HrCheckField, number>;
};

export default function HrChecksClient({ rows, activeField, countByField, sumByField }: Props) {
  const filtered = useMemo(() => {
    const list = filterByField(rows, activeField);
    // Sort desc theo |value|
    return list.sort(
      (a, b) => Math.abs(b.values[activeField]) - Math.abs(a.values[activeField]),
    );
  }, [rows, activeField]);

  const isPct = PERCENT_FIELDS.has(activeField);
  const totalSum = sumByField[activeField];
  const totalCount = countByField[activeField];
  const relatedCostType = FIELD_TO_COST_TYPE[activeField];

  return (
    <div className="space-y-4">
      {/* Tabs 13 loại */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-max border-b border-slate-200">
          {FIELDS.map((f) => {
            const active = f === activeField;
            const cnt = countByField[f];
            return (
              <Link
                key={f}
                href={`/reports/hr-checks?field=${f}`}
                className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? "border-orange-500 text-orange-700 font-semibold bg-orange-50"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <span className="font-mono text-[10px] text-slate-400">{f}.</span>{" "}
                {HR_CHECK_LABELS[f]}
                {cnt > 0 && (
                  <span
                    className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold rounded-full ${
                      active ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {cnt}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Header info */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-slate-800">
          {activeField}. {HR_CHECK_LABELS[activeField]}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {HR_CHECK_DESCRIPTIONS[activeField]}
        </div>
        <div className="flex gap-6 mt-3 text-sm">
          <div>
            <span className="text-slate-500">Số căn cần xử lý: </span>
            <span className="font-semibold text-slate-900">{totalCount}</span>
          </div>
          {!isPct && (
            <div>
              <span className="text-slate-500">Tổng tiền: </span>
              <span
                className={`font-semibold tabular-nums ${
                  totalSum >= 0 ? "text-orange-700" : "text-blue-700"
                }`}
              >
                {fmt(totalSum)} VND
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 text-sm">
          ✅ Không có căn nào cần xử lý cho mục này.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2 w-10">#</th>
                <th className="text-left p-2">Căn</th>
                <th className="text-left p-2">Dự án</th>
                <th className="text-left p-2">CĐT</th>
                <th className="text-left p-2">Sale</th>
                <th className="text-left p-2">TPKD</th>
                <th className="text-right p-2">Giá trị</th>
                <th className="text-right p-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const v = r.values[activeField];
                const displayVal = isPct ? fmtPct(v) : fmt(v);
                const linkTarget = relatedCostType
                  ? `/costs/new?productId=${r.productId}&costType=${relatedCostType}`
                  : `/products/${r.productId}`;
                const linkLabel = relatedCostType ? "+ Tạo ĐC" : "Xem căn";
                return (
                  <tr
                    key={r.productId}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="p-2 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="p-2 font-mono text-xs">
                      <Link
                        href={`/products/${r.productId}`}
                        className="text-blue-600 hover:underline"
                      >
                        {r.unitCode}
                      </Link>
                    </td>
                    <td className="p-2 text-slate-700">{r.projectName ?? "—"}</td>
                    <td className="p-2 text-slate-500 text-xs">{r.partnerName ?? "—"}</td>
                    <td className="p-2 text-slate-700 text-xs">{r.salesPerson ?? "—"}</td>
                    <td className="p-2 text-slate-500 text-xs">{r.deptLeaderName ?? "—"}</td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${
                        v >= 0 ? "text-orange-700" : "text-blue-700"
                      }`}
                    >
                      {displayVal}
                    </td>
                    <td className="p-2 text-right">
                      <Link
                        href={linkTarget}
                        className="text-blue-600 hover:underline text-xs whitespace-nowrap"
                      >
                        {linkLabel}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
