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
};

type Props = {
  recon?: CostReconciliation;
  paymentInit?: { paymentDate: string | null; amount: number } | null;
  products: ProductOption[];
  defaultProductId?: number;
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

export default function CostForm({ recon, paymentInit, products, defaultProductId, onSave, onDelete }: Props) {
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

      <Section title="Cơ sở tính (chốt tại thời điểm tạo đợt)">
        {isEdit && (
          <div className="text-xs text-slate-500 -mt-2 mb-2">
            Ô có nền xám là dữ liệu chốt lúc tạo — không sửa được.
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Giá tính PMG sale">
            <MoneyInput
              name="pmgBasePriceSale"
              defaultValue={recon?.pmgBasePriceSale ?? product?.pmgBasePrice ?? 0}
              className="input"
              readOnly={isEdit}
            />
          </Field>
          <Field label="%PMG_LK_sale">
            <input
              name="pmgLkSaleRate"
              type="number"
              step="any"
              defaultValue={pctDisplay(recon?.pmgLkSaleRate ?? product?.pmgSaleRate)}
              className={`input ${isEdit ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
              readOnly={isEdit}
            />
          </Field>
          <Field label="Tiến độ %PMG đã thu đến nay (vd: 60)">
            <input
              name="pmgCumulativePctSale"
              type="number"
              step="any"
              defaultValue={pctDisplay(recon?.pmgCumulativePctSale)}
              className={`input ${isEdit ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
              readOnly={isEdit}
            />
          </Field>
          <Field label="Tiến độ tiền PMG đã thu">
            <MoneyInput
              name="pmgProgressAmount"
              defaultValue={recon?.pmgProgressAmount ?? 0}
              className="input"
              readOnly={isEdit}
            />
          </Field>
        </div>
      </Section>

      {showCommission && (
        <Section title="Hoa hồng sale (HH)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="%HH sale (vd: 55 = 55%)">
              <input
                name="commissionRate"
                type="number"
                step="any"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Phí admin sale">
              <MoneyInput
                name="adminFeeSale"
                defaultValue={recon?.adminFeeSale ?? product?.adminFeeSale ?? 0}
                className="input"
              />
            </Field>
            <Field label="PMG đã ĐC lũy kế">
              <MoneyInput
                name="pmgReconciledCumulative"
                defaultValue={recon?.pmgReconciledCumulative ?? 0}
                className="input"
              />
            </Field>
            <Field label="PMG đợt này">
              <input
                name="pmgThisTime"
                type="text"
                inputMode="numeric"
                value={pmgThis ? pmgThis.toLocaleString("vi-VN") : ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setPmgThis(digits ? Number(digits) : 0);
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="input"
                placeholder="0"
              />
            </Field>
            <Field label="PMG phải trả đợt này">
              <MoneyInput
                name="pmgPayable"
                defaultValue={recon?.pmgPayable ?? 0}
                className="input"
              />
            </Field>
            <Field label="PMG còn phải trả đợt sau">
              <MoneyInput
                name="pmgRemaining"
                defaultValue={recon?.pmgRemaining ?? 0}
                className="input"
              />
            </Field>
          </div>
        </Section>
      )}

      {showSupport && (
        <Section title="Hỗ trợ khách">
          <Field label="Số tiền hỗ trợ khách (VND, chưa trừ thuế TNCN)">
            <MoneyInput
              name="customerSupport"
              defaultValue={recon?.customerSupport ?? 0}
              className="input"
            />
          </Field>
        </Section>
      )}

      {showBonus && (
        <Section title={costType === "bonus_sale" ? "Thưởng NVKD" : "Thưởng TPKD (Trưởng phòng)"}>
          <div className="text-xs text-slate-500 mb-2">
            Khoản thưởng nhập theo số sau VAT (chia 1.1). Số tiền phải trả ghi ở "Tổng phải trả".
          </div>
        </Section>
      )}

      {showKpi && (
        <Section title={`KPI ${costType === "kpi_ceo" ? "CEO" : costType === "kpi_tpkd" ? "TPKD" : "Admin"}`}>
          <div className="text-xs text-slate-500 mb-2">
            Q_sale (base tính KPI) = <b>{fmtMoney(Q_sale)}</b>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={`%KPI ${costType === "kpi_ceo" ? "CEO" : costType === "kpi_tpkd" ? "TPKD" : "Admin"}`}>
              <input
                name="kpiRate"
                type="number"
                step="any"
                value={kpiPct}
                onChange={(e) => setKpiPct(e.target.value)}
                placeholder={
                  kpiRateDefault > 0 ? `Mặc định từ căn: ${(kpiRateDefault * 100).toFixed(2)}` : ""
                }
                className="input"
              />
            </Field>
            <Field label="Tiền KPI đợt này">
              <MoneyInput
                name="kpiAmount"
                defaultValue={recon?.kpiAmount ?? 0}
                className="input"
              />
            </Field>
          </div>
        </Section>
      )}

      <Section title="Tổng kết">
        <Field label="Tổng phải trả đợt này" required>
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
            className="input"
            placeholder="0"
          />
          {suggested > 0 && Math.abs(suggested - totalAmt) > 100 && (
            <div className="text-xs mt-1.5 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1">
              <span className="text-blue-700">
                💡 Gợi ý:{" "}
                <b className="tabular-nums">{fmtMoney(suggested)}</b>
                {showCommission && (
                  <span className="text-slate-500 ml-1">
                    ({pmgThis > 0 ? "PMG đợt" : "Q_sale"} × %HH)
                  </span>
                )}
                {showKpi && <span className="text-slate-500 ml-1">(Q_sale × %KPI)</span>}
              </span>
              <button
                type="button"
                onClick={() => applyValue(suggested)}
                className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700"
              >
                Áp dụng
              </button>
            </div>
          )}
        </Field>
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

      <Section title="Ghi chú">
        <Field label="Nội dung">
          <textarea name="note" defaultValue={recon?.note ?? ""} className="input" rows={2} />
        </Field>
      </Section>

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
