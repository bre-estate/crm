"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BulkProductRow } from "@/lib/actions/products";
import SearchableSelect from "@/components/SearchableSelect";

type ProjectOpt = {
  id: number;
  code: string;
  name: string;
  partnerName: string | null;
};

type Row = {
  projectId: number | "";
  unitCode: string;
  saleType: "primary" | "secondary";
  customerName: string;
  salesPerson: string;
  depositDate: string;
  pmgBasePrice: number;
  pmgRatePct: string; // display % (5.5 for 5.5%)
  adminFee: number;
  cdtBonusSale: number;
  cdtBonusManager: number;
  note: string;
};

const emptyRow = (): Row => ({
  projectId: "",
  unitCode: "",
  saleType: "primary",
  customerName: "",
  salesPerson: "",
  depositDate: "",
  pmgBasePrice: 0,
  pmgRatePct: "",
  adminFee: 0,
  cdtBonusSale: 0,
  cdtBonusManager: 0,
  note: "",
});

export default function BulkProductForm({
  projects,
  onSave,
}: {
  projects: ProjectOpt[];
  onSave: (rows: BulkProductRow[]) => Promise<{ ok: number; errors: { index: number; message: string }[] }>;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);

  const update = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const submit = () => {
    const validRows: BulkProductRow[] = rows
      .filter((r) => r.projectId && r.unitCode.trim())
      .map((r) => ({
        projectId: r.projectId as number,
        unitCode: r.unitCode.trim(),
        saleType: r.saleType,
        customerName: r.customerName.trim() || null,
        salesPerson: r.salesPerson.trim() || null,
        depositDate: r.depositDate || null,
        pmgBasePrice: r.pmgBasePrice,
        pmgRate: r.pmgRatePct ? Number(r.pmgRatePct.replace(",", ".")) / 100 : 0,
        adminFee: r.adminFee,
        cdtBonusSale: r.cdtBonusSale,
        cdtBonusManager: r.cdtBonusManager,
        note: r.note || undefined,
      }));
    if (validRows.length === 0) {
      alert("Chưa có dòng nào hợp lệ (cần chọn dự án + mã căn)");
      return;
    }
    start(async () => {
      try {
        const res = await onSave(validRows);
        if (res.errors.length > 0) {
          alert(
            `Đã tạo ${res.ok} căn. ${res.errors.length} dòng lỗi:\n` +
              res.errors.map((e) => `  Dòng ${e.index + 1}: ${e.message}`).join("\n"),
          );
        } else {
          alert(`✅ Đã tạo ${res.ok} căn`);
          router.push("/products");
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "Lỗi");
      }
    });
  };

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: p.partnerName && p.partnerName !== "Chợ thứ cấp" ? p.partnerName : "",
  }));

  const validCount = rows.filter((r) => r.projectId && r.unitCode.trim()).length;

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600">
        Nhập 1 loạt căn mới. Dòng rỗng sẽ tự bỏ qua khi lưu. Config chi tiết (%HH sale, KPI...) có
        thể bổ sung sau ở từng căn.
      </div>

      <div className="bg-white">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-slate-600 text-[11px]">
            <tr>
              <th className="text-left p-2 min-w-52">Dự án</th>
              <th className="text-left p-2 min-w-32">Mã căn</th>
              <th className="text-left p-2 min-w-28">Loại</th>
              <th className="text-left p-2 min-w-40">Khách hàng</th>
              <th className="text-left p-2 min-w-40">NVKD</th>
              <th className="text-left p-2">Ngày cọc</th>
              <th className="text-right p-2 min-w-36">Giá tính PMG</th>
              <th className="text-right p-2">%PMG_LK</th>
              <th className="text-right p-2 min-w-28">Phí admin</th>
              <th className="text-right p-2 min-w-32">Thưởng CĐT sale</th>
              <th className="text-right p-2 min-w-32">Thưởng CĐT QL</th>
              <th className="text-left p-2 min-w-32">Ghi chú</th>
              <th className="text-center p-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t border-slate-100 align-top">
                <td className="p-1">
                  <SearchableSelect
                    value={r.projectId}
                    onChange={(v) => update(idx, { projectId: v ? Number(v) : "" })}
                    placeholder="Gõ tên dự án..."
                    emptyOption="— Chọn dự án —"
                    options={projectOptions}
                  />
                </td>
                <td className="p-1">
                  <input
                    value={r.unitCode}
                    onChange={(e) => update(idx, { unitCode: e.target.value })}
                    placeholder="A.05.07"
                    className="input text-xs py-1"
                  />
                </td>
                <td className="p-1">
                  <select
                    value={r.saleType}
                    onChange={(e) =>
                      update(idx, { saleType: e.target.value as "primary" | "secondary" })
                    }
                    className="input text-xs py-1"
                  >
                    <option value="primary">Sơ cấp</option>
                    <option value="secondary">Thứ cấp</option>
                  </select>
                </td>
                <td className="p-1">
                  <input
                    value={r.customerName}
                    onChange={(e) => update(idx, { customerName: e.target.value })}
                    placeholder="—"
                    className="input text-xs py-1"
                  />
                </td>
                <td className="p-1">
                  <input
                    value={r.salesPerson}
                    onChange={(e) => update(idx, { salesPerson: e.target.value })}
                    placeholder="—"
                    className="input text-xs py-1"
                  />
                </td>
                <td className="p-1">
                  <input
                    type="date"
                    value={r.depositDate}
                    onChange={(e) => update(idx, { depositDate: e.target.value })}
                    className="input text-xs py-1"
                  />
                </td>
                <td className="p-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.pmgBasePrice ? r.pmgBasePrice.toLocaleString("vi-VN") : ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      update(idx, { pmgBasePrice: digits ? Number(digits) : 0 });
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder="0"
                    className="input text-xs py-1 text-right tabular-nums"
                  />
                </td>
                <td className="p-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={r.pmgRatePct}
                    onChange={(e) => update(idx, { pmgRatePct: e.target.value })}
                    placeholder="5,5"
                    className="input text-xs py-1 text-right"
                  />
                </td>
                <td className="p-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.adminFee ? r.adminFee.toLocaleString("vi-VN") : ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      update(idx, { adminFee: digits ? Number(digits) : 0 });
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder="0"
                    className="input text-xs py-1 text-right tabular-nums"
                  />
                </td>
                <td className="p-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.cdtBonusSale ? r.cdtBonusSale.toLocaleString("vi-VN") : ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      update(idx, { cdtBonusSale: digits ? Number(digits) : 0 });
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder="0"
                    className="input text-xs py-1 text-right tabular-nums"
                  />
                </td>
                <td className="p-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.cdtBonusManager ? r.cdtBonusManager.toLocaleString("vi-VN") : ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      update(idx, { cdtBonusManager: digits ? Number(digits) : 0 });
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder="0"
                    className="input text-xs py-1 text-right tabular-nums"
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
            ))}
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
          {validCount}/{rows.length} dòng hợp lệ
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-orange-500 text-white rounded-lg px-6 py-2 text-sm hover:bg-orange-600 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Lưu tất cả"}
        </button>
      </div>
    </div>
  );
}
