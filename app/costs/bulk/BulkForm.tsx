"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BulkCostRow } from "@/lib/actions/costs";
import SearchableSelect from "@/components/SearchableSelect";
import { costTypeLabel, fmtMoney, fmtPctTight } from "@/lib/format";
import { computeLuyKe, computeTargetFull, type ProductConfig, type CostType } from "@/lib/costCalc";
import { toast } from "sonner";

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
  paidByKey,
  maxPmgPctByProduct,
  onSave,
}: {
  products: ProductOpt[];
  paidByKey: Record<string, number>;
  maxPmgPctByProduct: Record<number, number>;
  onSave: (rows: BulkCostRow[]) => Promise<{ ok: number; errors: { index: number; message: string }[] }>;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

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
      toast.error("Chưa có dòng nào hợp lệ", {
        description: "Cần chọn căn + số tiền > 0",
      });
      return;
    }
    start(async () => {
      try {
        const res = await onSave(validRows);
        if (res.errors.length > 0) {
          toast.error(`Đã tạo ${res.ok} dòng, ${res.errors.length} lỗi`, {
            description: res.errors
              .slice(0, 5)
              .map((e) => `Dòng ${e.index + 1}: ${e.message}`)
              .join(" · "),
          });
        } else {
          toast.success(`Đã tạo ${res.ok} dòng giá vốn`);
          router.push("/costs");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
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
              const isExpanded = expanded.has(idx);
              const canExpand = !!p;
              return (
              <React.Fragment key={idx}>
                <tr className="border-t border-slate-100 align-top">
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
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => canExpand && toggleExpand(idx)}
                        disabled={!canExpand}
                        className={`rounded-md w-7 h-7 flex items-center justify-center text-base leading-none border ${
                          canExpand
                            ? isExpanded
                              ? "bg-blue-500 text-white border-blue-500 hover:bg-blue-600"
                              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                            : "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                        }`}
                        title={canExpand ? "Xem thông tin căn" : "Chọn căn trước"}
                      >
                        {isExpanded ? "▾" : "▸"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="rounded-md w-7 h-7 flex items-center justify-center text-lg leading-none text-red-500 border border-transparent hover:bg-red-50 hover:border-red-200"
                        title="Xoá dòng"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
                {isExpanded && p && (
                  <tr className="bg-blue-50/40 border-t border-blue-200">
                    <td colSpan={9} className="p-3">
                      <InfoPanel
                        product={p}
                        costType={r.costType}
                        maxPmgPct={maxPmgPctByProduct[p.id] ?? 0}
                        paidByKey={paidByKey}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
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
          className="bg-orange-500 text-white rounded-lg px-6 py-2 text-sm hover:bg-orange-600 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Lưu tất cả"}
        </button>
      </div>
    </div>
  );
}

// ============ InfoPanel: hiển thị thông tin tham khảo cho căn + costType ============

const COST_TYPE_LABEL_KPI: Record<string, string> = {
  kpi_ceo: "KPI CEO",
  kpi_tpkd: "KPI TPKD",
  kpi_admin: "KPI Admin",
};

function InfoPanel({
  product,
  costType,
  maxPmgPct,
  paidByKey,
}: {
  product: ProductOpt;
  costType: CostType;
  maxPmgPct: number;
  paidByKey: Record<string, number>;
}) {
  // Build ProductConfig for costCalc
  const config: ProductConfig = {
    pmgBasePrice: Number(product.pmgBasePrice ?? 0),
    pmgSaleRate: Number(product.pmgSaleRate ?? 0),
    adminFeeSale: Number(product.adminFeeSale ?? 0),
    customerSupport: Number(product.customerSupport ?? 0),
    saleCommissionRate: Number(product.saleCommissionRate ?? 0),
    kpiCeoRate: Number(product.kpiCeoRate ?? 0),
    kpiTpkdRate: Number(product.kpiTpkdRate ?? 0),
    kpiAdminRate: Number(product.kpiAdminRate ?? 0),
    bonusSale: Number(product.bonusSale ?? 0),
    bonusManager: Number(product.bonusManager ?? 0),
    cdtBonusSale: Number(product.cdtBonusSale ?? 0),
    cdtBonusManager: Number(product.cdtBonusManager ?? 0),
  };

  const paidBefore = paidByKey[`${product.id}:${costType}`] ?? 0;
  const luyKeThisTime = computeLuyKe(config, costType, maxPmgPct);
  const targetFull = computeTargetFull(config, costType);
  const receivable = Math.max(0, luyKeThisTime - paidBefore);
  const remaining = Math.max(0, targetFull - luyKeThisTime);

  const isKpiCeo = costType === "kpi_ceo";
  const isKpiTpkd = costType === "kpi_tpkd";
  const isKpiAdmin = costType === "kpi_admin";
  const isKpi = isKpiCeo || isKpiTpkd || isKpiAdmin;

  return (
    <div className="space-y-3 rounded-lg bg-white border border-slate-200 p-4">
      {/* Group 1 — Thông tin chung */}
      <InfoSection title="Thông tin chung">
        <StatCard label="% PMG_LK đã thu đến ngày ĐC" value={maxPmgPct > 0 ? fmtPctTight(maxPmgPct) : "—"} />
        <StatCard label="% HH sale" value={config.saleCommissionRate > 0 ? fmtPctTight(config.saleCommissionRate) : "—"} />
        <StatCard label="Phí admin sale (gồm VAT)" value={config.adminFeeSale > 0 ? fmtMoney(config.adminFeeSale) : "—"} />
        <StatCard label="Hỗ trợ khách" value={config.customerSupport > 0 ? fmtMoney(config.customerSupport) : "—"} />
      </InfoSection>

      {/* Group 2 — PMG lũy kế */}
      {(costType === "sale_commission" || isKpi) && (
        <InfoSection title="PMG lũy kế">
          <StatCard label="Đã đối chiếu (trước)" value={paidBefore > 0 ? fmtMoney(paidBefore) : "—"} />
          <StatCard label="LK đợt này" value={luyKeThisTime > 0 ? fmtMoney(luyKeThisTime) : "—"} tone="info" />
          <StatCard label="Phải trả đợt này (gross)" value={receivable > 0 ? fmtMoney(receivable) : "—"} tone="highlight" />
          <StatCard label="Còn phải trả đợt sau" value={remaining > 0 ? fmtMoney(remaining) : "—"} tone="muted" />
        </InfoSection>
      )}

      {/* Conditional KPI section */}
      {isKpi && (
        <InfoSection title={COST_TYPE_LABEL_KPI[costType]}>
          {isKpiAdmin ? (
            <>
              <StatCard label="Thưởng Admin" value={targetFull > 0 ? fmtMoney(targetFull) : "—"} />
              <StatCard label="Đã thanh toán" value={paidBefore > 0 ? fmtMoney(paidBefore) : "—"} />
              <StatCard label="Tổng phải trả đợt này" value={receivable > 0 ? fmtMoney(receivable) : "—"} tone="highlight" />
            </>
          ) : (
            <>
              <StatCard label={`Lũy kế`} value={luyKeThisTime > 0 ? fmtMoney(luyKeThisTime) : "—"} />
              <StatCard label={`Đã thanh toán`} value={paidBefore > 0 ? fmtMoney(paidBefore) : "—"} />
              <StatCard label={`Còn thanh toán đợt này`} value={receivable > 0 ? fmtMoney(receivable) : "—"} tone="highlight" />
            </>
          )}
        </InfoSection>
      )}

      {maxPmgPct === 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
          Chưa có %PMG_LK thu — cần vào Doanh thu tạo đợt trước để tính lũy kế.
        </div>
      )}
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2 pl-1">
        {title}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {children}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "highlight" | "info" | "muted";
}) {
  const styles =
    tone === "highlight"
      ? "bg-orange-50 border-orange-200 text-orange-800"
      : tone === "info"
        ? "bg-blue-50 border-blue-200 text-blue-800"
        : tone === "muted"
          ? "bg-slate-50 border-slate-200 text-slate-500"
          : "bg-white border-slate-200 text-slate-800";
  return (
    <div className={`rounded-md border px-3 py-2 ${styles}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70 mb-0.5 truncate" title={label}>
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
