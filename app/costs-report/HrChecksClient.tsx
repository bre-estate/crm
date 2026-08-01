"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ExpandToggle from "@/components/ExpandToggle";
import SearchableSelect from "@/components/SearchableSelect";
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

const ALL_FIELDS: HrCheckField[] = [
  "W", "X", "Y", "Z", "AA",
  "AB", "AC", "AD", "AE", "AF",
  "AG", "AH", "AI",
];

export default function HrChecksClient({ rows, activeField, countByField, sumByField }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [qUnit, setQUnit] = useState("");
  const [qProject, setQProject] = useState("");
  const [qSale, setQSale] = useState("");

  // Match text-search: case-insensitive, bỏ dấu tiếng Việt.
  const norm = (s: string | null | undefined) =>
    (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const filtered = useMemo(() => {
    const byField = filterByField(rows, activeField);
    const u = norm(qUnit).trim();
    const pj = norm(qProject).trim();
    const sl = norm(qSale).trim();
    const list = byField.filter((r) => {
      if (u && !norm(r.unitCode).includes(u)) return false;
      if (pj && !norm(r.projectName).includes(pj)) return false;
      if (sl && !norm(r.salesPerson).includes(sl)) return false;
      return true;
    });
    return list.sort(
      (a, b) => Math.abs(b.values[activeField]) - Math.abs(a.values[activeField]),
    );
  }, [rows, activeField, qUnit, qProject, qSale]);

  const isPct = PERCENT_FIELDS.has(activeField);
  const totalSum = sumByField[activeField];
  const totalCount = countByField[activeField];
  const relatedCostType = FIELD_TO_COST_TYPE[activeField];

  // Autocomplete datalists (dedup + sort). Chỉ include các căn khớp active field
  // để dropdown gợi ý có nghĩa (không lôi cả trăm căn khác không thuộc mục hiện tại).
  const suggestions = useMemo(() => {
    const inField = filterByField(rows, activeField);
    const uniq = (arr: (string | null | undefined)[]) =>
      [...new Set(arr.filter((x): x is string => !!x && x.trim() !== ""))].sort();
    return {
      unit: uniq(inField.map((r) => r.unitCode)),
      project: uniq(inField.map((r) => r.projectName)),
      sale: uniq(inField.map((r) => r.salesPerson)),
    };
  }, [rows, activeField]);

  const filterActive = qUnit || qProject || qSale;

  return (
    <div className="space-y-4">
      {/* Tabs 13 loại — wrap xuống dòng, không scroll */}
      <div className="flex flex-wrap gap-1.5">
        {FIELDS.map((f) => {
          const active = f === activeField;
          const cnt = countByField[f];
          return (
            <Link
              key={f}
              href={`/costs-report?field=${f}`}
              className={`px-3 py-1.5 text-xs whitespace-nowrap rounded-lg border transition-colors ${
                active
                  ? "border-orange-500 text-orange-700 font-semibold bg-orange-50"
                  : "border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 bg-white"
              }`}
            >
              <span className="font-mono text-[10px] text-slate-400">{f}.</span>{" "}
              {HR_CHECK_LABELS[f]}
              {cnt > 0 && (
                <span
                  className={`ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-semibold rounded-full ${
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

      {/* Header info */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-slate-800">
          {activeField}. {HR_CHECK_LABELS[activeField]}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {HR_CHECK_DESCRIPTIONS[activeField]}
        </div>
        <div className="flex gap-6 mt-3 text-sm flex-wrap">
          <div>
            <span className="text-slate-500">Tổng cần xử lý: </span>
            <span className="font-semibold text-slate-900">{totalCount}</span>
          </div>
          {filterActive && (
            <div>
              <span className="text-slate-500">Sau lọc: </span>
              <span className="font-semibold text-slate-900">{filtered.length}</span>
            </div>
          )}
          {!isPct && (
            <div>
              <span className="text-slate-500">Tổng tiền (chưa lọc): </span>
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

      {/* Filters: Mã căn / Dự án / NVKD — cùng element type với /costs (SearchableSelect) */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Mã căn</label>
          <input
            type="text"
            value={qUnit}
            onChange={(e) => setQUnit(e.target.value)}
            placeholder="vd: A.25.26"
            className="input min-w-32"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Dự án</label>
          <SearchableSelect
            value={qProject}
            onChange={setQProject}
            emptyOption="— Tất cả —"
            placeholder="Gõ tên dự án..."
            className="min-w-72"
            options={suggestions.project.map((s) => ({ value: s, label: s }))}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">NVKD</label>
          <SearchableSelect
            value={qSale}
            onChange={setQSale}
            emptyOption="— Tất cả —"
            placeholder="Gõ tên NVKD..."
            className="min-w-56"
            options={suggestions.sale.map((s) => ({ value: s, label: s }))}
          />
        </div>
        {filterActive && (
          <button
            type="button"
            onClick={() => {
              setQUnit("");
              setQProject("");
              setQSale("");
            }}
            className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200"
          >
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-12 text-center text-slate-500 text-sm">
          ✅ Không có căn nào cần xử lý cho mục này.
        </div>
      ) : (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
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
                <th className="p-2 w-10"></th>
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
                const isOpen = expanded === r.productId;
                return (
                  <>
                    <tr
                      key={r.productId}
                      className={`border-t border-slate-100 hover:bg-slate-50 ${
                        isOpen ? "bg-slate-50" : ""
                      }`}
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
                      <td className="p-2 text-right">
                        <ExpandToggle
                          isOpen={isOpen}
                          onClick={() => setExpanded(isOpen ? null : r.productId)}
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.productId}-detail`} className="bg-slate-50/70 border-t border-slate-100">
                        <td colSpan={9} className="p-4">
                          <DetailPanel row={r} activeField={activeField} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ row, activeField }: { row: HrCheckRow; activeField: HrCheckField }) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 font-medium">
        Chi tiết 13 chỉ số cho <span className="font-mono">{row.unitCode}</span> —{" "}
        {row.projectName}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {ALL_FIELDS.map((f) => {
          const v = row.values[f];
          const isPct = PERCENT_FIELDS.has(f);
          const isActive = f === activeField;
          const isZero = Math.abs(v) < (isPct ? 0.001 : 1000);
          return (
            <div
              key={f}
              className={`rounded border p-2 ${
                isActive
                  ? "border-orange-400 bg-orange-50"
                  : isZero
                    ? "border-slate-200 bg-white text-slate-400"
                    : v >= 0
                      ? "border-slate-200 bg-white"
                      : "border-blue-200 bg-blue-50"
              }`}
            >
              <div className="text-[10px] text-slate-500 font-mono">{f}</div>
              <div className="text-[11px] text-slate-700 leading-tight mt-0.5">
                {HR_CHECK_LABELS[f]}
              </div>
              <div
                className={`text-sm font-semibold tabular-nums mt-1 ${
                  isZero
                    ? "text-slate-400"
                    : v >= 0
                      ? "text-orange-700"
                      : "text-blue-700"
                }`}
              >
                {isPct ? fmtPct(v) : fmtM(v)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 pt-1 text-xs">
        <Link
          href={`/products/${row.productId}`}
          className="text-blue-600 hover:underline"
        >
          → Xem trang căn
        </Link>
        <Link
          href={`/costs/new?productId=${row.productId}`}
          className="text-blue-600 hover:underline"
        >
          → Tạo ĐC giá vốn (chọn loại)
        </Link>
      </div>
    </div>
  );
}
