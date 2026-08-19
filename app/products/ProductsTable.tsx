"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  fmtMoney,
  fmtDate,
  fmtPctTight,
  fmtPctRaw,
  displayPartnerName,
} from "@/lib/format";
import { toast } from "sonner";

// Row shape đã pre-compute stats từ server
export type ProductRow = {
  id: number;
  unitCode: string;
  projectName: string | null;
  partnerName: string | null;
  departmentName: string | null;
  deptName: string | null;
  salesPerson: string | null;
  isCtv?: boolean;
  depositDate: string | null;
  pmgBasePrice: number | null;
  pmgRate: number | null;
  totalRevenue: number | null;
  note: string | null;
  // Stats pre-computed
  expectedHH: number;
  receivedHH: number;
  phaseCount: number;
  invoiceCount: number;
  // Chi dư thưởng nóng (BRE trả NV nhưng CĐT hoàn/không đủ) — NV nợ cty.
  // 0 = không có; > 0 = tổng nợ ở căn.
  overpaid?: number;
  overpaidEmployees?: string[];
};

const DEPT_COLORS: Record<string, string> = {};
function deptColor(name: string | null | undefined): string {
  if (!name) return "bg-slate-100 text-slate-600";
  if (DEPT_COLORS[name]) return DEPT_COLORS[name];
  const palette = [
    "bg-blue-100 text-blue-700",
    "bg-orange-100 text-orange-700",
    "bg-purple-100 text-purple-700",
    "bg-teal-100 text-teal-700",
    "bg-rose-100 text-rose-700",
    "bg-amber-100 text-amber-700",
    "bg-cyan-100 text-cyan-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff;
  const cls = palette[hash % palette.length];
  DEPT_COLORS[name] = cls;
  return cls;
}

type Props = {
  rows: ProductRow[];
  detailQs: string;
  justCreatedIds: Set<number>;
  onBulkDelete: (ids: number[]) => Promise<{
    ok: number;
    deletedIds: number[];
    errors: { id: number; unitCode: string; message: string }[];
  }>;
};

export default function ProductsTable({
  rows,
  detailQs,
  justCreatedIds,
  onBulkDelete,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const confirmed = confirm(
      `Xóa ${ids.length} căn?\n\nHành động không hoàn tác. Căn có đối chiếu doanh thu / giá vốn sẽ bị chặn.`,
    );
    if (!confirmed) return;
    start(async () => {
      try {
        const res = await onBulkDelete(ids);
        if (res.errors.length > 0) {
          toast.error(`Đã xóa ${res.ok}, ${res.errors.length} lỗi`, {
            description: res.errors
              .slice(0, 5)
              .map((e) => `${e.unitCode}: ${e.message}`)
              .join(" · "),
          });
        } else {
          toast.success(`Đã xóa ${res.ok} căn`);
        }
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  };

  return (
    <>
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-white border border-orange-300 rounded-lg p-3 flex justify-between items-center shadow-sm mb-3">
          <div className="text-sm">
            Đã chọn <b>{selected.size}</b> căn.{" "}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-blue-600 hover:underline text-xs ml-2"
            >
              Bỏ chọn hết
            </button>
          </div>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={pending}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Đang xóa..." : `🗑 Xóa ${selected.size} căn`}
          </button>
        </div>
      )}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="p-2 w-8" />
              {/* Bỏ master checkbox — chặn thao tác 'chọn toàn bộ' vô ý.
                  Muốn xóa nhiều căn thì tick từng cái. */}
              <th className="text-left p-2 whitespace-nowrap">Mã căn</th>
              <th className="text-left p-2">Dự án / Đối tác</th>
              <th className="text-left p-2 whitespace-nowrap">Phòng</th>
              <th className="text-left p-2 whitespace-nowrap">NVKD</th>
              <th className="text-left p-2 whitespace-nowrap">Ngày cọc</th>
              <th className="text-right p-2 whitespace-nowrap">Giá PMG</th>
              <th className="text-right p-2 whitespace-nowrap">%PMG</th>
              <th className="text-right p-2 whitespace-nowrap">Tổng DT</th>
              <th className="text-center p-2 whitespace-nowrap">% thu</th>
              <th className="text-center p-2 whitespace-nowrap">Lần</th>
              <th className="text-center p-2 whitespace-nowrap">HĐ</th>
              <th className="text-center p-2 whitespace-nowrap" title="NV nợ cty do chi dư thưởng nóng">Chi dư</th>
              <th className="text-right p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pctPaid = r.expectedHH > 0 ? (r.receivedHH / r.expectedHH) * 100 : 0;
              const fullyPaid = pctPaid >= 99.5 && pctPaid <= 100.5;
              const overPaid = pctPaid > 100.5;
              const noData = r.expectedHH === 0 && r.phaseCount === 0;
              const isJustCreated = justCreatedIds.has(r.id);
              const isSelected = selected.has(r.id);
              const bg = isSelected
                ? "bg-orange-50"
                : isJustCreated
                  ? "highlight-fade"
                  : "";
              return (
                <tr
                  key={r.id}
                  data-just-created={isJustCreated ? "1" : undefined}
                  className={`border-t border-slate-100 hover:bg-slate-50 ${bg}`}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(r.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="p-2 font-mono text-xs">
                    <Link
                      href={`/products/${r.id}${detailQs}`}
                      className="text-blue-600 hover:underline"
                    >
                      {r.unitCode}
                    </Link>
                    {r.note && r.note.trim() && (
                      <span className="ml-1 text-slate-400 cursor-help" title={r.note}>
                        📝
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="font-medium text-xs">{r.projectName}</div>
                    <div className="text-xs text-slate-500">
                      {displayPartnerName(r.partnerName)}
                    </div>
                  </td>
                  <td className="p-2">
                    {r.departmentName ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${deptColor(
                          r.deptName ?? r.departmentName,
                        )}`}
                      >
                        {r.departmentName}
                      </span>
                    ) : r.isCtv ? (
                      <span
                        className="text-xs px-2 py-0.5 rounded whitespace-nowrap bg-amber-100 text-amber-800 border border-amber-200"
                        title="CTV chưa phân phòng — cộng tác viên/freelance ngoài công ty"
                      >
                        CTV
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-2 text-xs">
                    {r.salesPerson ?? "—"}
                    {r.isCtv && r.salesPerson && (
                      <span
                        className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-semibold"
                        title="Cộng tác viên / Freelance"
                      >
                        CTV
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-xs">{fmtDate(r.depositDate)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(r.pmgBasePrice)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtPctTight(r.pmgRate)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(r.totalRevenue)}</td>
                  <td className="p-2 text-center">
                    {noData ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <span
                        className={`text-xs font-semibold ${
                          overPaid
                            ? "text-purple-700"
                            : fullyPaid
                              ? "text-green-700"
                              : pctPaid > 0
                                ? "text-amber-700"
                                : "text-red-600"
                        }`}
                        title={
                          overPaid
                            ? `Thu quá target (${fmtPctRaw(pctPaid, 1)}) — kiểm tra lại data`
                            : fullyPaid
                              ? "Đã thu đủ"
                              : pctPaid > 0
                                ? `Còn thiếu ${fmtPctRaw(100 - pctPaid, 1)}`
                                : "Chưa thu"
                        }
                      >
                        {pctPaid.toFixed(0)}%
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-center text-xs">
                    {r.phaseCount > 0 ? (
                      <span className="font-medium">{r.phaseCount}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-2 text-center text-xs">
                    {r.invoiceCount > 0 ? (
                      <span
                        className="px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium"
                        title={`${r.invoiceCount} hóa đơn`}
                      >
                        ✓ {r.invoiceCount}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                        —
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-center text-xs">
                    {r.overpaid && r.overpaid > 0 ? (
                      <span
                        className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold tabular-nums"
                        title={`NV nợ cty: ${(r.overpaidEmployees ?? []).join(", ")}`}
                      >
                        {fmtMoney(r.overpaid)}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Link
                      href={`/products/${r.id}${detailQs}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Chi tiết
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="p-6 text-center text-slate-500 text-sm">
                  Không có giao dịch nào theo bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
