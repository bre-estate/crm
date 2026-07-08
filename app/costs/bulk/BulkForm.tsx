"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BulkCostRow } from "@/lib/actions/costs";
import SearchableSelect from "@/components/SearchableSelect";
import { costTypeLabel, fmtMoney } from "@/lib/format";

type ProductOpt = {
  id: number;
  productCode: string | null;
  unitCode: string | null;
  pmgBasePrice: number | string | null;
  pmgSaleRate: number | string | null;
  saleCommissionRate: number | string | null;
  kpiCeoRate: number | string | null;
  kpiTpkdRate: number | string | null;
  kpiAdminRate: number | string | null;
  bonusSale: number | string | null;
  bonusManager: number | string | null;
  customerSupport: number | string | null;
  cdtBonusSale: number | string | null;
  cdtBonusManager: number | string | null;
  adminFeeSale: number | string | null;
  salesPerson: string | null;
  projectName: string | null;
  partnerName: string | null;
};

const COST_TYPES = [
  "sale_commission",
  "customer_support",
  "bonus_sale",
  "bonus_manager",
  "cdt_bonus_sale",
  "cdt_bonus_manager",
  "kpi_ceo",
  "kpi_tpkd",
  "kpi_admin",
] as const;

type Row = {
  productId: number | "";
  costType: (typeof COST_TYPES)[number];
  employeeName: string;
  reconciliationDate: string;
  amount: number;
  paymentDate: string;
  paymentAmount: number;
  note: string;
};

const emptyRow = (): Row => ({
  productId: "",
  costType: "sale_commission",
  employeeName: "",
  reconciliationDate: "",
  amount: 0,
  paymentDate: "",
  paymentAmount: 0,
  note: "",
});

// Suggest max amount = Q_sale × rate cho costType (để cảnh báo over-limit)
const targetForRow = (p: ProductOpt | undefined, ct: string): number => {
  if (!p) return 0;
  const Q_sale = Number(p.pmgBasePrice ?? 0) * Number(p.pmgSaleRate ?? 0);
  switch (ct) {
    case "sale_commission":
      return Q_sale * Number(p.saleCommissionRate ?? 0);
    case "kpi_ceo":
      return Q_sale * Number(p.kpiCeoRate ?? 0);
    case "kpi_tpkd":
      return Q_sale * Number(p.kpiTpkdRate ?? 0);
    case "kpi_admin":
      return Q_sale * Number(p.kpiAdminRate ?? 0);
    case "bonus_sale":
      return Number(p.bonusSale ?? 0);
    case "bonus_manager":
      return Number(p.bonusManager ?? 0);
    case "cdt_bonus_sale":
      return Number(p.cdtBonusSale ?? 0);
    case "cdt_bonus_manager":
      return Number(p.cdtBonusManager ?? 0);
    case "customer_support":
      return Number(p.customerSupport ?? 0);
    default:
      return 0;
  }
};

// Suggest default employeeName by costType
const suggestEmployee = (p: ProductOpt | undefined, ct: string): string => {
  if (!p) return "";
  if (
    ct === "sale_commission" ||
    ct === "customer_support" ||
    ct === "bonus_sale" ||
    ct === "cdt_bonus_sale"
  )
    return p.salesPerson ?? "";
  return "";
};

export default function BulkCostForm({
  products,
  onSave,
}: {
  products: ProductOpt[];
  onSave: (rows: BulkCostRow[]) => Promise<{ ok: number; errors: { index: number; message: string }[] }>;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);

  const productMap = new Map(products.map((p) => [p.id, p]));

  const update = (idx: number, patch: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        // Auto-fill employeeName khi đổi căn hoặc costType (nếu chưa nhập)
        if ((patch.productId !== undefined || patch.costType !== undefined) && !r.employeeName) {
          const p = productMap.get(Number(next.productId));
          const suggested = suggestEmployee(p, next.costType);
          if (suggested) next.employeeName = suggested;
        }
        return next;
      }),
    );
  };
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const submit = () => {
    const validRows: BulkCostRow[] = rows
      .filter((r) => r.productId && r.amount > 0)
      .map((r) => ({
        productId: r.productId as number,
        costType: r.costType,
        employeeName: r.employeeName.trim(),
        reconciliationDate: r.reconciliationDate || null,
        amountPayableThisTime: r.amount,
        paymentDate: r.paymentDate || null,
        paymentAmount: r.paymentAmount || 0,
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
          alert(`✅ Đã tạo ${res.ok} dòng giá vốn`);
          router.push("/costs");
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "Lỗi");
      }
    });
  };

  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.unitCode ?? "",
    sublabel: `${p.projectName ?? ""}${p.partnerName && p.partnerName !== "Chợ thứ cấp" ? ` · ${p.partnerName}` : ""}`,
  }));

  const validCount = rows.filter((r) => r.productId && r.amount > 0).length;

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600">
        Nhập 1 loạt dòng giá vốn (HH sale, KPI, thưởng, hỗ trợ khách). Điền cả cột "Đã trả" nếu
        muốn ghi payment cùng lúc. Dòng rỗng sẽ tự bỏ qua khi lưu.
      </div>

      <div className="bg-white">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-slate-600 text-[11px]">
            <tr>
              <th className="text-left p-2 min-w-56">Căn</th>
              <th className="text-left p-2 min-w-44">Loại chi phí</th>
              <th className="text-left p-2 min-w-40">Người nhận</th>
              <th className="text-left p-2">Ngày ĐC</th>
              <th className="text-right p-2 min-w-32">Số tiền</th>
              <th className="text-left p-2">Ngày trả</th>
              <th className="text-right p-2 min-w-32">Đã trả</th>
              <th className="text-left p-2 min-w-32">Ghi chú</th>
              <th className="text-center p-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const p = r.productId ? productMap.get(Number(r.productId)) : undefined;
              const maxAmt = targetForRow(p, r.costType);
              const overLimit = maxAmt > 0 && r.amount > maxAmt + 1000;
              return (
                <tr key={idx} className="border-t border-slate-100 align-top">
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
                    <select
                      value={r.costType}
                      onChange={(e) =>
                        update(idx, { costType: e.target.value as (typeof COST_TYPES)[number] })
                      }
                      className="input text-xs py-1"
                    >
                      {COST_TYPES.map((ct) => (
                        <option key={ct} value={ct}>
                          {costTypeLabel(ct)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1">
                    <input
                      value={r.employeeName}
                      onChange={(e) => update(idx, { employeeName: e.target.value })}
                      placeholder="Tên NVKD/TPKD/Admin"
                      className="input text-xs py-1"
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
                      className={`input text-xs py-1 text-right tabular-nums ${overLimit ? "border-red-400 text-red-700" : ""}`}
                    />
                    {maxAmt > 0 && (
                      <div className={`text-[10px] mt-0.5 ${overLimit ? "text-red-600" : "text-slate-400"}`}>
                        Tối đa: {fmtMoney(maxAmt)}
                      </div>
                    )}
                  </td>
                  <td className="p-1">
                    <input
                      type="date"
                      value={r.paymentDate}
                      onChange={(e) => update(idx, { paymentDate: e.target.value })}
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.paymentAmount ? r.paymentAmount.toLocaleString("vi-VN") : ""}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        update(idx, { paymentAmount: digits ? Number(digits) : 0 });
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="= số tiền"
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
          {validCount}/{rows.length} dòng hợp lệ
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
