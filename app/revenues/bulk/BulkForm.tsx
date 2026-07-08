"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BulkRevenueRow } from "@/lib/actions/revenues";
import SearchableSelect from "@/components/SearchableSelect";

type ProductOpt = {
  id: number;
  productCode: string;
  unitCode: string;
  projectName: string | null;
  partnerName: string | null;
  saleType: string | null;
};

type Row = {
  productId: number | "";
  reconciliationDate: string;
  reconType: string;
  amount: number;
  pmgCumulativePct: string; // display %
  invoiceNumber: string;
  invoiceDate: string;
  note: string;
};

const emptyRow = (): Row => ({
  productId: "",
  reconciliationDate: "",
  reconType: "phase:1",
  amount: 0,
  pmgCumulativePct: "",
  invoiceNumber: "",
  invoiceDate: "",
  note: "",
});

export default function BulkForm({
  products,
  onSave,
}: {
  products: ProductOpt[];
  onSave: (rows: BulkRevenueRow[]) => Promise<{ ok: number; errors: { index: number; message: string }[] }>;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);

  const productBySaleType = (id: number | "") =>
    id ? products.find((p) => p.id === id)?.saleType : null;

  const update = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const submit = () => {
    // Filter out empty rows (no productId or amount = 0)
    const validRows: BulkRevenueRow[] = rows
      .filter((r) => r.productId && r.amount > 0)
      .map((r) => ({
        productId: r.productId as number,
        reconciliationDate: r.reconciliationDate || null,
        reconType: r.reconType,
        amount: r.amount,
        pmgCumulativePct: r.pmgCumulativePct ? Number(r.pmgCumulativePct) : undefined,
        invoiceNumber: r.invoiceNumber || undefined,
        invoiceDate: r.invoiceDate || null,
        note: r.note || undefined,
      }));
    if (validRows.length === 0) {
      alert("Chưa có dòng nào hợp lệ (cần chọn căn + số tiền > 0)");
      return;
    }
    start(async () => {
      try {
        const res = await onSave(validRows);
        if (res.errors.length > 0) {
          alert(
            `Đã tạo ${res.ok} dòng. ${res.errors.length} dòng lỗi:\n` +
              res.errors.map((e) => `  Dòng ${e.index + 1}: ${e.message}`).join("\n"),
          );
        } else {
          alert(`✅ Đã tạo ${res.ok} đợt đối chiếu`);
          router.push("/revenues");
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "Lỗi");
      }
    });
  };

  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.unitCode,
    sublabel: `${p.projectName ?? ""}${p.partnerName && p.partnerName !== "Chợ thứ cấp" ? ` · ${p.partnerName}` : ""}`,
  }));

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600">
        Nhập 1 loạt đợt đối chiếu doanh thu (dùng khi admin nhập tháng/quý cho nhiều căn). Dòng
        rỗng sẽ tự bỏ qua khi lưu.
      </div>

      <div className="bg-white">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-slate-600 text-[11px]">
            <tr>
              <th className="text-left p-2 min-w-56">Căn</th>
              <th className="text-left p-2">Ngày ĐC</th>
              <th className="text-left p-2 min-w-40">Loại đợt</th>
              <th className="text-right p-2 min-w-32">Số tiền</th>
              <th className="text-right p-2">%PMG lũy kế</th>
              <th className="text-left p-2">Số HĐ</th>
              <th className="text-left p-2">Ngày HĐ</th>
              <th className="text-left p-2 min-w-40">Ghi chú</th>
              <th className="text-center p-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const isSecondary = productBySaleType(r.productId) === "secondary";
              return (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="p-1">
                    <SearchableSelect
                      value={r.productId}
                      onChange={(v) => update(idx, { productId: v ? Number(v) : "" })}
                      placeholder="Gõ mã căn..."
                      emptyOption="— Chọn căn —"
                      options={productOptions}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="date"
                      value={r.reconciliationDate}
                      onChange={(e) => update(idx, { reconciliationDate: e.target.value })}
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1">
                    <select
                      value={r.reconType}
                      onChange={(e) => update(idx, { reconType: e.target.value })}
                      className="input text-xs py-1"
                    >
                      {!isSecondary && (
                        <>
                          <option value="phase:1">Đợt 1</option>
                          <option value="phase:2">Đợt 2</option>
                          <option value="phase:3">Đợt 3</option>
                          <option value="phase:4">Đợt 4</option>
                          <option value="phase:5">Đợt 5</option>
                        </>
                      )}
                      {isSecondary && <option value="phase:1">Đợt duy nhất</option>}
                      <option value="bonus_sale">Thưởng nóng sale</option>
                      <option value="bonus_manager">Thưởng nóng QL</option>
                    </select>
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.amount ? r.amount.toLocaleString("vi-VN") : ""}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        update(idx, { amount: digits ? Number(digits) : 0 });
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="0"
                      className="input text-xs py-1 text-right tabular-nums"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="number"
                      step="any"
                      value={r.pmgCumulativePct}
                      onChange={(e) => update(idx, { pmgCumulativePct: e.target.value })}
                      placeholder="vd: 5.5"
                      disabled={r.reconType.startsWith("bonus")}
                      className="input text-xs py-1 text-right"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      value={r.invoiceNumber}
                      onChange={(e) => update(idx, { invoiceNumber: e.target.value })}
                      placeholder="—"
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="date"
                      value={r.invoiceDate}
                      onChange={(e) => update(idx, { invoiceDate: e.target.value })}
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      value={r.note}
                      onChange={(e) => update(idx, { note: e.target.value })}
                      placeholder="—"
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="text-red-500 hover:bg-red-50 rounded px-1"
                      title="Xoá dòng"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={addRow}
          className="text-sm bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-200"
        >
          + Thêm dòng
        </button>
        <button
          type="button"
          onClick={() => setRows([emptyRow(), emptyRow(), emptyRow()])}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Reset
        </button>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">
          {rows.filter((r) => r.productId && r.amount > 0).length}/{rows.length} dòng hợp lệ
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-blue-600 text-white rounded-lg px-6 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Lưu tất cả"}
        </button>
      </div>
    </div>
  );
}
