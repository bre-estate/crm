"use client";

import { useTransition, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { RevenueReconciliation } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import { fmtMoney } from "@/lib/format";

type ProductOption = {
  id: number;
  productCode: string;
  unitCode: string;
  pmgBasePrice: number | null;
  pmgRate: number | null;
  adminFee: number | null;
  projectName: string | null;
  partnerName: string | null;
};

type InvoiceInfo = { number: string; date: string | null; totalAmountVat: number };

type Props = {
  recon?: RevenueReconciliation;
  invoiceInit?: InvoiceInfo;
  paymentInit?: { paymentDate: string | null; amount: number } | null;
  products: ProductOption[];
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
};

const isRedirect = (e: unknown): boolean =>
  !!e &&
  typeof e === "object" &&
  "digest" in e &&
  String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");

const pctDisplay = (v: number | null | undefined): string =>
  v == null || v === 0 ? "" : String(Number((Number(v) * 100).toFixed(4)));

export default function RevenueForm({
  recon,
  invoiceInit,
  paymentInit,
  products,
  onSave,
  onDelete,
}: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [productId, setProductId] = useState<number>(recon?.productId ?? products[0]?.id ?? 0);
  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);

  return (
    <form
      action={(fd) =>
        start(async () => {
          try {
            await onSave(fd);
          } catch (e) {
            if (isRedirect(e)) throw e;
            alert(e instanceof Error ? e.message : "Lỗi khi lưu");
          }
        })
      }
      className="space-y-6 bg-white border border-slate-200 rounded-xl p-6"
    >
      <Section title="Thông tin đợt đối chiếu">
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
                  {p.productCode} · {p.projectName} · {p.partnerName}
                </option>
              ))}
            </select>
            {product && (
              <div className="text-xs text-slate-500 mt-1">
                Giá tính PMG: {fmtMoney(product.pmgBasePrice)} · %PMG_LK:{" "}
                {Number((Number(product.pmgRate ?? 0) * 100).toFixed(2))}%
              </div>
            )}
          </Field>
          <Field label="Đợt số (1-5)">
            <input
              name="phaseNumber"
              type="number"
              min={1}
              max={5}
              defaultValue={recon?.phaseNumber ?? 1}
              className="input"
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
          <Field label="Số biên bản (BB)">
            <input
              name="minutesNumber"
              defaultValue={recon?.minutesNumber ?? ""}
              className="input"
            />
          </Field>
        </div>
      </Section>

      <Section title="Hóa đơn">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Số hóa đơn">
            <input
              name="invoiceNumber"
              defaultValue={invoiceInit?.number ?? ""}
              className="input"
              placeholder="Để trống nếu chưa lập"
            />
          </Field>
          <Field label="Ngày hóa đơn">
            <input
              type="date"
              name="invoiceDate"
              defaultValue={invoiceInit?.date ?? ""}
              className="input"
            />
          </Field>
          <Field label="Giá trị HĐ tổng (gồm VAT)">
            <MoneyInput
              name="invoiceTotalVat"
              defaultValue={invoiceInit?.totalAmountVat ?? 0}
              className="input"
            />
          </Field>
        </div>
        <div className="text-xs text-slate-500">
          Nếu số HĐ + ngày HĐ trùng với HĐ đã có, hệ thống tự link vào HĐ đó.
        </div>
      </Section>

      <Section title="Tỷ lệ %">
        <div className="grid grid-cols-2 gap-4">
          <Field label="%PMG_LK lũy kế đến đợt này (vd: 5.5)">
            <input
              name="pmgCumulativePct"
              type="number"
              step="any"
              defaultValue={pctDisplay(recon?.pmgCumulativePct)}
              className="input"
            />
          </Field>
          <Field label="%thu PMG đợt này (vd: 60)">
            <input
              name="phasePctThisTime"
              type="number"
              step="any"
              defaultValue={pctDisplay(recon?.phasePctThisTime)}
              className="input"
            />
          </Field>
          <Field label="%PMG hỗ trợ (hồi tố nếu có)">
            <input
              name="pmgSupportPct"
              type="number"
              step="any"
              defaultValue={pctDisplay(recon?.pmgSupportPct)}
              className="input"
            />
          </Field>
          <Field label="%doanh thu khác">
            <input
              name="otherRevenuePct"
              type="number"
              step="any"
              defaultValue={pctDisplay(recon?.otherRevenuePct)}
              className="input"
            />
          </Field>
        </div>
      </Section>

      <Section title="Số tiền (VND)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Giá tính PMG (snapshot)">
            <MoneyInput
              name="pmgBasePrice"
              defaultValue={recon?.pmgBasePrice ?? product?.pmgBasePrice ?? 0}
              className="input"
            />
          </Field>
          <Field label="Phí admin (gồm VAT)">
            <MoneyInput
              name="adminFeeVat"
              defaultValue={recon?.adminFeeVat ?? 0}
              className="input"
            />
          </Field>
          <Field label="DT theo tiến độ đợt này">
            <MoneyInput
              name="revenueThisTime"
              defaultValue={recon?.revenueThisTime ?? 0}
              className="input"
            />
          </Field>
          <Field label="DT không theo tiến độ">
            <MoneyInput
              name="revenueOffProgress"
              defaultValue={recon?.revenueOffProgress ?? 0}
              className="input"
            />
          </Field>
          <Field label="Khoản giảm doanh thu">
            <MoneyInput
              name="revenueReduction"
              defaultValue={recon?.revenueReduction ?? 0}
              className="input"
            />
          </Field>
          <Field label="CĐT thưởng sale (đợt này)">
            <MoneyInput
              name="cdtBonusSale"
              defaultValue={recon?.cdtBonusSale ?? 0}
              className="input"
            />
          </Field>
          <Field label="CĐT thưởng QL sàn (đợt này)">
            <MoneyInput
              name="cdtBonusManager"
              defaultValue={recon?.cdtBonusManager ?? 0}
              className="input"
            />
          </Field>
          <Field label="Tổng phải thu đợt này">
            <MoneyInput
              name="totalReceivableThisTime"
              defaultValue={recon?.totalReceivableThisTime ?? 0}
              className="input"
            />
          </Field>
        </div>
      </Section>

      <Section title="Thanh toán (tùy chọn — nếu đã thu tiền cho đợt này)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ngày nhận tiền">
            <input
              type="date"
              name="paymentDate"
              defaultValue={paymentInit?.paymentDate ?? ""}
              className="input"
            />
          </Field>
          <Field label="Số tiền thực nhận">
            <MoneyInput
              name="paymentAmount"
              defaultValue={paymentInit?.amount ?? 0}
              className="input"
            />
          </Field>
        </div>
        <div className="text-xs text-slate-500">
          Khi tạo mới, mục này tạo 1 dòng thanh toán liên kết. Khi sửa thì các thanh toán hiện có
          không bị thay đổi.
        </div>
      </Section>

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
              if (confirm("Xóa đợt đối chiếu này? (Các thanh toán đã ghi nhận cũng sẽ bị xóa)")) {
                start(async () => {
                  try {
                    await onDelete();
                  } catch (e) {
                    if (isRedirect(e)) throw e;
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
