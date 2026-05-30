"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { CostReconciliation } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import { costTypeLabel, fmtMoney } from "@/lib/format";

type ProductOption = {
  id: number;
  productCode: string;
  unitCode: string;
  pmgBasePrice: number | null;
  pmgSaleRate: number | null;
  saleCommissionRate: number | null;
  adminFeeSale: number | null;
  salesPerson: string | null;
  projectName: string | null;
  partnerName: string | null;
};

type Props = {
  recon?: CostReconciliation;
  paymentInit?: { paymentDate: string | null; amount: number } | null;
  products: ProductOption[];
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
};

const COST_TYPES = [
  "sale_commission",
  "customer_support",
  "bonus_sale",
  "bonus_manager",
  "kpi_ceo",
  "kpi_tpkd",
  "kpi_admin",
] as const;

const pctDisplay = (v: number | null | undefined): string =>
  v == null || v === 0 ? "" : String(Number((Number(v) * 100).toFixed(4)));

export default function CostForm({ recon, paymentInit, products, onSave, onDelete }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [productId, setProductId] = useState<number>(recon?.productId ?? products[0]?.id ?? 0);
  const [costType, setCostType] = useState<(typeof COST_TYPES)[number]>(
    (recon?.costType as (typeof COST_TYPES)[number]) ?? "sale_commission",
  );
  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);

  const showCommission = costType === "sale_commission";
  const showSupport = costType === "customer_support";
  const showKpi = costType === "kpi_ceo" || costType === "kpi_tpkd" || costType === "kpi_admin";
  const showBonus = costType === "bonus_sale" || costType === "bonus_manager";

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
            <select
              name="productId"
              value={productId}
              onChange={(e) => setProductId(Number(e.target.value))}
              className="input"
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.productCode} · {p.projectName}
                </option>
              ))}
            </select>
            {product && (
              <div className="text-xs text-slate-500 mt-1">
                Giá tính PMG: {fmtMoney(product.pmgBasePrice)} · %HH sale snapshot:{" "}
                {Number((Number(product.saleCommissionRate ?? 0) * 100).toFixed(2))}% · NVKD mặc định:{" "}
                {product.salesPerson ?? "—"}
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

      <Section title="Snapshot cơ sở tính (chuyển về value sau khi đối chiếu)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Giá tính PMG sale">
            <MoneyInput
              name="pmgBasePriceSale"
              defaultValue={recon?.pmgBasePriceSale ?? product?.pmgBasePrice ?? 0}
              className="input"
            />
          </Field>
          <Field label="%PMG_LK_sale">
            <input
              name="pmgLkSaleRate"
              type="number"
              step="any"
              defaultValue={pctDisplay(recon?.pmgLkSaleRate ?? product?.pmgSaleRate)}
              className="input"
            />
          </Field>
          <Field label="Tiến độ %PMG đã thu đến nay (vd: 60)">
            <input
              name="pmgCumulativePctSale"
              type="number"
              step="any"
              defaultValue={pctDisplay(recon?.pmgCumulativePctSale)}
              className="input"
            />
          </Field>
          <Field label="Tiến độ tiền PMG đã thu (VND)">
            <MoneyInput
              name="pmgProgressAmount"
              defaultValue={recon?.pmgProgressAmount ?? 0}
              className="input"
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
                defaultValue={pctDisplay(recon?.commissionRate ?? product?.saleCommissionRate)}
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
            <Field label="PMG đã ĐC lũy kế (VND)">
              <MoneyInput
                name="pmgReconciledCumulative"
                defaultValue={recon?.pmgReconciledCumulative ?? 0}
                className="input"
              />
            </Field>
            <Field label="PMG đợt này (VND)">
              <MoneyInput
                name="pmgThisTime"
                defaultValue={recon?.pmgThisTime ?? 0}
                className="input"
              />
            </Field>
            <Field label="PMG phải trả đợt này (VND)">
              <MoneyInput
                name="pmgPayable"
                defaultValue={recon?.pmgPayable ?? 0}
                className="input"
              />
            </Field>
            <Field label="PMG còn phải trả đợt sau (VND)">
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
        <Section title={costType === "bonus_sale" ? "Thưởng NVKD" : "Thưởng quản lý"}>
          <div className="text-xs text-slate-500 mb-2">
            Khoản thưởng nhập theo số sau VAT (chia 1.1). Số tiền phải trả ghi ở "Tổng phải trả".
          </div>
        </Section>
      )}

      {showKpi && (
        <Section title={`KPI ${costType === "kpi_ceo" ? "CEO" : costType === "kpi_tpkd" ? "TPKD" : "Admin"}`}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="%KPI">
              <input
                name="kpiRate"
                type="number"
                step="any"
                defaultValue={pctDisplay(recon?.kpiRate)}
                className="input"
              />
            </Field>
            <Field label="Tiền KPI đợt này (VND)">
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
        <Field label="Tổng phải trả đợt này (VND)" required>
          <MoneyInput
            name="amountPayableThisTime"
            defaultValue={recon?.amountPayableThisTime ?? 0}
            className="input"
          />
        </Field>
      </Section>

      {!recon && (
        <Section title="Thanh toán (tùy chọn — nếu đã trả tiền cho đợt này)">
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
        </Section>
      )}

      <Section title="Ghi chú">
        <Field label="Note">
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
