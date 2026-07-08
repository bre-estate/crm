"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { CostReconciliation } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import SearchableSelect from "@/components/SearchableSelect";
import { costTypeLabel, fmtMoney } from "@/lib/format";

type ProductOption = {
  id: number;
  productCode: string;
  unitCode: string;
  pmgBasePrice: number | null;
  pmgSaleRate: number | null;
  pmgRate: number | null;
  saleCommissionRate: number | null;
  adminFeeSale: number | null;
  salesPerson: string | null;
  projectName: string | null;
  partnerName: string | null;
  kpiCeoRate?: number | null;
  kpiTpkdRate?: number | null;
  kpiAdminRate?: number | null;
  bonusSale?: number | null;
  bonusManager?: number | null;
  customerSupport?: number | null;
  cdtBonusSale?: number | null;
  cdtBonusManager?: number | null;
};

type PreviousRecon = {
  id: number;
  date: string | null;
  amount: number | string | null;
  note: string | null;
};

type Props = {
  recon?: CostReconciliation;
  paymentInit?: { paymentDate: string | null; amount: number } | null;
  products: ProductOption[];
  defaultProductId?: number;
  previousRecons?: PreviousRecon[];
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
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

const pctDisplay = (v: number | null | undefined): string =>
  v == null || v === 0 ? "" : String(Number((Number(v) * 100).toFixed(4)));

export default function CostForm({
  recon,
  paymentInit,
  products,
  defaultProductId,
  previousRecons = [],
  onSave,
  onDelete,
}: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [productId, setProductId] = useState<number>(
    recon?.productId ?? defaultProductId ?? products[0]?.id ?? 0,
  );
  const [costType, setCostType] = useState<(typeof COST_TYPES)[number]>(
    (recon?.costType as (typeof COST_TYPES)[number]) ?? "sale_commission",
  );
  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const isEdit = !!recon;

  const showCommission = costType === "sale_commission";
  const showSupport = costType === "customer_support";
  const showKpi = costType === "kpi_ceo" || costType === "kpi_tpkd" || costType === "kpi_admin";
  const showBonus = costType === "bonus_sale" || costType === "bonus_manager";

  // === Auto-calc state ===
  const parsePct = (s: string): number => {
    const clean = s.replace(/,/g, ".").replace(/\s/g, "");
    if (!clean) return 0;
    const n = Number(clean);
    return isNaN(n) ? 0 : n / 100;
  };
  const parseMoney = (s: string | number | null | undefined): number => {
    if (s === null || s === undefined) return 0;
    if (typeof s === "number") return s;
    const clean = s.replace(/[.,\s]/g, "");
    return Number(clean) || 0;
  };

  const [commissionPct, setCommissionPct] = useState<string>(
    pctDisplay(recon?.commissionRate ?? product?.saleCommissionRate),
  );
  const [pmgThis, setPmgThis] = useState<number>(Number(recon?.pmgThisTime ?? 0));
  const [kpiPct, setKpiPct] = useState<string>(pctDisplay(recon?.kpiRate));
  const [totalAmt, setTotalAmt] = useState<number>(
    Number(recon?.amountPayableThisTime ?? 0),
  );

  // Target base cho loại chi phí hiện tại
  const Q_sale_full = useMemo(() => {
    const base = Number(product?.pmgBasePrice ?? 0);
    const rate = Number(product?.pmgSaleRate ?? 0) || Number(product?.pmgRate ?? 0);
    return base * rate;
  }, [product]);
  const targetForType = useMemo(() => {
    if (!product) return 0;
    if (costType === "sale_commission")
      return Q_sale_full * Number(product.saleCommissionRate ?? 0);
    if (costType === "kpi_ceo") return Q_sale_full * Number(product.kpiCeoRate ?? 0);
    if (costType === "kpi_tpkd") return Q_sale_full * Number(product.kpiTpkdRate ?? 0);
    if (costType === "kpi_admin") return Q_sale_full * Number(product.kpiAdminRate ?? 0);
    if (costType === "customer_support") return Number(product.customerSupport ?? 0);
    if (costType === "bonus_sale") return Number(product.bonusSale ?? 0);
    if (costType === "bonus_manager") return Number(product.bonusManager ?? 0);
    if (costType === "cdt_bonus_sale") return Number(product.cdtBonusSale ?? 0);
    if (costType === "cdt_bonus_manager") return Number(product.cdtBonusManager ?? 0);
    return 0;
  }, [costType, product, Q_sale_full]);

  // Tổng đã ĐC các đợt trước (cùng cost_type, cùng employee, cùng căn)
  const paidBefore = useMemo(
    () => previousRecons.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [previousRecons],
  );
  const paidBeforePct = targetForType > 0 ? (paidBefore / targetForType) * 100 : 0;

  // Payment progress cho đợt này: nhập % → tự tính số tiền
  const [thisPct, setThisPct] = useState<string>(
    targetForType > 0 && recon?.amountPayableThisTime
      ? ((Number(recon.amountPayableThisTime) / targetForType) * 100).toFixed(2)
      : "",
  );
  const thisPctNum = thisPct ? Number(thisPct.replace(/,/g, ".")) / 100 : 0;
  const thisAmountFromPct = targetForType * thisPctNum;

  const remainingBefore = Math.max(0, targetForType - paidBefore);
  const remainingAfter = remainingBefore - thisAmountFromPct;

  // Q_sale = pmgBase × pmgSaleRate (fallback pmgRate)
  const Q_sale = useMemo(() => {
    const base = Number(product?.pmgBasePrice ?? 0);
    const rate = Number(product?.pmgSaleRate ?? 0) || Number(product?.pmgRate ?? 0);
    return base * rate;
  }, [product]);

  // Auto default rate for KPI based on cost_type + product config
  const kpiRateDefault = useMemo(() => {
    if (costType === "kpi_ceo") return Number(product?.kpiCeoRate ?? 0);
    if (costType === "kpi_tpkd") return Number(product?.kpiTpkdRate ?? 0);
    if (costType === "kpi_admin") return Number(product?.kpiAdminRate ?? 0);
    return 0;
  }, [costType, product]);

  const kpiRateNum = kpiPct ? parsePct(kpiPct) : kpiRateDefault;
  const commissionRateNum = parsePct(commissionPct);

  // Suggested amount
  const suggested = useMemo(() => {
    if (showCommission) {
      // HH sale: pmgThisTime × commissionRate (nếu có), fallback Q_sale × commissionRate
      const base = pmgThis > 0 ? pmgThis : Q_sale;
      return base * commissionRateNum;
    }
    if (showKpi) {
      // KPI: Q_sale × kpiRate
      return Q_sale * kpiRateNum;
    }
    if (costType === "bonus_sale") return Number(product?.bonusSale ?? 0);
    if (costType === "bonus_manager") return Number(product?.bonusManager ?? 0);
    if (costType === "customer_support") return Number(product?.customerSupport ?? 0);
    return 0;
  }, [showCommission, showKpi, costType, pmgThis, Q_sale, commissionRateNum, kpiRateNum, product]);

  const applyValue = (v: number) => setTotalAmt(Math.round(v));

  return (
    <form
      action={(fd) =>
        start(async () => {
          try {
            await onSave(fd);
          } catch (e) {
            if (
              e &&
              typeof e === "object" &&
              "digest" in e &&
              String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")
            )
              throw e;
            alert(e instanceof Error ? e.message : "Lỗi khi lưu");
          }
        })
      }
      className="space-y-6 bg-white border border-slate-200 rounded-xl p-6"
    >
      <Section title="Thông tin đối chiếu">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Căn (sản phẩm)" required>
            {isEdit ? (
              <>
                <SearchableSelect
                  value={productId}
                  disabled
                  options={products.map((p) => ({
                    value: p.id,
                    label: p.productCode,
                    sublabel: p.projectName ?? undefined,
                  }))}
                />
                <input type="hidden" name="productId" value={productId} />
              </>
            ) : (
              <SearchableSelect
                name="productId"
                value={productId}
                onChange={(v) => setProductId(Number(v))}
                placeholder="Gõ mã căn / tên dự án..."
                required
                options={products.map((p) => ({
                  value: p.id,
                  label: p.productCode,
                  sublabel: p.projectName ?? undefined,
                }))}
              />
            )}
            {product && (
              <div className="text-xs text-slate-500 mt-1">
                Giá tính PMG: {fmtMoney(product.pmgBasePrice)} · %HH sale (chốt):{" "}
                {Number((Number(product.saleCommissionRate ?? 0) * 100).toFixed(2))}% · NVKD mặc định:{" "}
                {product.salesPerson ?? "—"}
              </div>
            )}
            {isEdit && (
              <div className="text-xs text-slate-500 mt-1">
                Không đổi được căn khi sửa. Muốn chuyển dòng sang căn khác thì xóa dòng này rồi tạo lại.
              </div>
            )}
          </Field>
          <Field label="Loại chi phí" required>
            <select
              name="costType"
              value={costType}
              onChange={(e) => setCostType(e.target.value as (typeof COST_TYPES)[number])}
              className="input"
              required
            >
              {COST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {costTypeLabel(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tên người được đối chiếu" required>
            <input
              name="employeeName"
              defaultValue={recon?.employeeName ?? product?.salesPerson ?? ""}
              className="input"
              required
            />
          </Field>
          <Field label="Ngày đối chiếu">
            <input
              type="date"
              name="reconciliationDate"
              defaultValue={recon?.reconciliationDate ?? ""}
              className="input"
            />
          </Field>
          <Field label="Năm ghi nhận DT">
            <input
              name="fiscalYear"
              type="number"
              defaultValue={recon?.fiscalYear ?? new Date().getFullYear()}
              className="input"
            />
          </Field>
        </div>
      </Section>

      {/* Progress + Payment cho đợt này */}
      <Section title="📊 Tiến độ chi trả">
        <div className="text-xs text-slate-500 -mt-2 mb-3">
          Loại chi phí: <b>{costTypeLabel(costType)}</b>
          {product?.salesPerson && costType === "sale_commission" && (
            <span> · Cho: {product.salesPerson}</span>
          )}
        </div>

        {/* Progress cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Target</div>
            <div className="text-sm font-semibold tabular-nums mt-1">
              {fmtMoney(targetForType)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {costType === "sale_commission" || costType.startsWith("kpi_")
                ? "Q_sale × %"
                : "Số flat"}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Đã ĐC trước ({previousRecons.length} đợt)</div>
            <div className="text-sm font-semibold tabular-nums mt-1 text-green-700">
              {fmtMoney(paidBefore)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {paidBeforePct.toFixed(1)}% target
            </div>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
            <div className="text-xs text-blue-700">Đợt này (dự tính)</div>
            <div className="text-sm font-semibold tabular-nums mt-1 text-blue-900">
              {fmtMoney(thisAmountFromPct)}
            </div>
            <div className="text-[10px] text-blue-500 mt-0.5">
              {thisPct ? `${thisPctNum * 100}%` : "chưa nhập %"} target
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Còn lại sau đợt này</div>
            <div
              className={`text-sm font-semibold tabular-nums mt-1 ${remainingAfter < 1000 ? "text-slate-400" : "text-red-600"}`}
            >
              {fmtMoney(Math.max(0, remainingAfter))}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {targetForType > 0 ? `${(100 - paidBeforePct - thisPctNum * 100).toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        {/* Lịch sử đợt trước */}
        {previousRecons.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-slate-500 mb-1">Các đợt đã ĐC trước:</div>
            <ul className="text-xs text-slate-600 space-y-0.5">
              {previousRecons.map((pr) => (
                <li key={pr.id}>
                  · {pr.date ?? "(chưa có ngày)"} — {fmtMoney(Number(pr.amount ?? 0))}
                  {pr.note && <span className="text-slate-400"> · {pr.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 2 input đơn giản: nội dung + % */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nội dung thanh toán">
            <input
              name="note"
              defaultValue={recon?.note ?? ""}
              className="input"
              placeholder="vd: Đợt 1, Đợt 2, thưởng nóng, ..."
            />
          </Field>
          <Field label="% số tiền thanh toán">
            <input
              type="number"
              step="any"
              value={thisPct}
              onChange={(e) => {
                setThisPct(e.target.value);
                const n = Number(e.target.value.replace(/,/g, ".")) / 100;
                if (targetForType > 0 && !isNaN(n)) {
                  setTotalAmt(Math.round(targetForType * n));
                }
              }}
              onBlur={(e) => {
                const n = Number(e.target.value.replace(/,/g, ".")) / 100;
                if (targetForType > 0 && !isNaN(n)) {
                  setTotalAmt(Math.round(targetForType * n));
                }
              }}
              placeholder="vd: 30 = 30% target"
              className="input"
            />
          </Field>
        </div>

        {/* Hidden inputs cho các field snapshot cũ để BE không break */}
        <input
          type="hidden"
          name="pmgBasePriceSale"
          value={String(recon?.pmgBasePriceSale ?? product?.pmgBasePrice ?? 0)}
        />
        <input
          type="hidden"
          name="pmgLkSaleRate"
          value={pctDisplay(recon?.pmgLkSaleRate ?? product?.pmgSaleRate)}
        />
        <input
          type="hidden"
          name="pmgCumulativePctSale"
          value={pctDisplay(recon?.pmgCumulativePctSale)}
        />
        <input
          type="hidden"
          name="pmgProgressAmount"
          value={String(recon?.pmgProgressAmount ?? 0)}
        />
        <input
          type="hidden"
          name="commissionRate"
          value={commissionPct}
        />
        <input
          type="hidden"
          name="adminFeeSale"
          value={String(recon?.adminFeeSale ?? product?.adminFeeSale ?? 0)}
        />
        <input
          type="hidden"
          name="pmgReconciledCumulative"
          value={String(recon?.pmgReconciledCumulative ?? 0)}
        />
        <input type="hidden" name="pmgThisTime" value={String(pmgThis)} />
        <input
          type="hidden"
          name="pmgPayable"
          value={String(recon?.pmgPayable ?? 0)}
        />
        <input
          type="hidden"
          name="pmgRemaining"
          value={String(recon?.pmgRemaining ?? 0)}
        />
        {costType === "customer_support" && (
          <input
            type="hidden"
            name="customerSupport"
            value={String(totalAmt)}
          />
        )}
        {costType.startsWith("kpi_") && (
          <>
            <input type="hidden" name="kpiRate" value={kpiPct} />
            <input type="hidden" name="kpiAmount" value={String(totalAmt)} />
          </>
        )}
      </Section>

      <Section title="💰 Tổng phải trả đợt này">
        <div className="rounded-lg border-2 border-orange-200 bg-orange-50/60 p-4">
          <div className="flex justify-between items-center gap-3">
            <div className="text-xs text-orange-700">
              Tự tính = Target × % nhập ở trên. Có thể ghi đè thủ công.
            </div>
            <input
              name="amountPayableThisTime"
              type="text"
              inputMode="numeric"
              value={totalAmt ? totalAmt.toLocaleString("vi-VN") : ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setTotalAmt(digits ? Number(digits) : 0);
              }}
              onFocus={(e) => e.currentTarget.select()}
              className="input text-right text-xl font-bold tabular-nums text-orange-900 min-w-40"
              placeholder="0"
              required
            />
          </div>
        </div>
      </Section>

      {!recon && (
        <Section title="Ghi nhận chi tiền (tùy chọn — nếu đã trả cho người này rồi)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ngày thanh toán">
              <input
                type="date"
                name="paymentDate"
                defaultValue={paymentInit?.paymentDate ?? ""}
                className="input"
              />
            </Field>
            <Field label="Số tiền thanh toán">
              <MoneyInput
                name="paymentAmount"
                defaultValue={paymentInit?.amount ?? 0}
                className="input"
              />
            </Field>
          </div>
          <div className="text-xs text-slate-500">
            Điền vào đây để tạo luôn 1 dòng chi tiền liên kết. Nếu chưa chi, cứ để trống.
          </div>
        </Section>
      )}

      {/* Nội dung thanh toán đã nhập ở Section Tiến độ */}

      <div className="flex justify-end gap-3 pt-2">
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Xóa dòng đối chiếu giá vốn này? (Các thanh toán cũng sẽ bị xóa)")) {
                start(async () => {
                  try {
                    await onDelete();
                  } catch (e) {
                    if (
                      e &&
                      typeof e === "object" &&
                      "digest" in e &&
                      String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")
                    )
                      throw e;
                    alert(e instanceof Error ? e.message : "Không xóa được");
                  }
                });
              }
            }}
            className="px-4 py-2 text-red-600 border border-red-300 rounded-lg text-sm hover:bg-red-50"
            disabled={pending}
          >
            Xóa
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-700 pb-2 border-b border-slate-100">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  required,
  full,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
