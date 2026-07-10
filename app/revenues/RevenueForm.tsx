"use client";

import { useTransition, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { RevenueReconciliation } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import SearchableSelect from "@/components/SearchableSelect";
import { fmtMoney, fmtPctTight } from "@/lib/format";

type ProductOption = {
  id: number;
  productCode: string;
  unitCode: string;
  pmgBasePrice: number | null;
  pmgRate: number | null;
  pmgSaleRate?: number | null;
  adminFee: number | null;
  projectName: string | null;
  partnerName: string | null;
  saleType?: string | null;
  cdtBonusSale?: number | null;
  cdtBonusManager?: number | null;
  totalRevenue?: number | null;
  saleCommissionRate?: number | null;
  kpiCeoRate?: number | null;
  kpiTpkdRate?: number | null;
  kpiAdminRate?: number | null;
  bonusSale?: number | null;
  bonusManager?: number | null;
  customerSupport?: number | null;
};

type InvoiceInfo = { number: string; date: string | null; totalAmountVat: number };

type Props = {
  recon?: RevenueReconciliation;
  invoiceInit?: InvoiceInfo;
  paymentInit?: { paymentDate: string | null; amount: number } | null;
  products: ProductOption[];
  defaultProductId?: number;
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  returnTo?: string | null;
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
  defaultProductId,
  onSave,
  onDelete,
  returnTo,
}: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [productId, setProductId] = useState<number>(
    recon?.productId ?? defaultProductId ?? products[0]?.id ?? 0,
  );
  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const isEdit = !!recon;
  const isSecondary = product?.saleType === "secondary";

  // Loại đợt: đợt tiến độ N (phase:N) hoặc bonus_sale / bonus_manager
  const initialReconType = ((): string => {
    if (recon) {
      if (Number(recon.cdtBonusSale ?? 0) > 0) return "bonus_sale";
      if (Number(recon.cdtBonusManager ?? 0) > 0) return "bonus_manager";
      if (recon.phaseNumber) return `phase:${recon.phaseNumber}`;
    }
    return "phase:1";
  })();
  const [reconType, setReconType] = useState(initialReconType);

  const initialAmount = ((): number => {
    if (recon) {
      return (
        Number(recon.revenueThisTime ?? 0) ||
        Number(recon.cdtBonusSale ?? 0) ||
        Number(recon.cdtBonusManager ?? 0) ||
        Number(recon.totalReceivableThisTime ?? 0)
      );
    }
    return 0;
  })();
  const [amount, setAmount] = useState<number>(initialAmount);
  const amountDisplay = amount ? amount.toLocaleString("vi-VN") : "";

  const isPhaseType = reconType.startsWith("phase:");
  const phaseN = isPhaseType ? Number(reconType.split(":")[1]) : 0;
  const revenueThisTimeVal = isPhaseType ? amount : 0;
  const cdtBonusSaleVal = reconType === "bonus_sale" ? amount : 0;
  const cdtBonusManagerVal = reconType === "bonus_manager" ? amount : 0;

  // Suggest amount dựa loại đợt + product config
  const suggested = useMemo(() => {
    if (!product) return 0;
    if (reconType === "bonus_sale") return Number(product.cdtBonusSale ?? 0);
    if (reconType === "bonus_manager") return Number(product.cdtBonusManager ?? 0);
    // Phase types: chưa có formula chính xác (cần biết đợt trước) → không gợi ý
    return 0;
  }, [reconType, product]);

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
            {isEdit ? (
              <>
                <SearchableSelect
                  value={productId}
                  disabled
                  options={products.map((p) => ({
                    value: p.id,
                    label: p.productCode,
                    sublabel: `${p.projectName ?? ""}${p.partnerName && p.partnerName !== "Chợ thứ cấp" ? ` · ${p.partnerName}` : ""}`,
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
                  sublabel: `${p.projectName ?? ""}${p.partnerName && p.partnerName !== "Chợ thứ cấp" ? ` · ${p.partnerName}` : ""}`,
                }))}
              />
            )}
            {product && (
              <div className="text-xs text-slate-500 mt-1">
                Giá tính PMG: {fmtMoney(product.pmgBasePrice)} · %PMG_LK:{" "}
                {fmtPctTight(product.pmgRate)}
              </div>
            )}
            {isEdit && (
              <div className="text-xs text-slate-500 mt-1">
                Không đổi được căn khi sửa. Muốn chuyển đợt sang căn khác thì xóa đợt này rồi tạo lại.
              </div>
            )}
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
          {isSecondary ? (
            <input type="hidden" name="pmgCumulativePct" defaultValue={pctDisplay(recon?.pmgCumulativePct)} />
          ) : (
            <Field label="%PMG_LK lũy kế đến đợt này (vd: 5.5)">
              <input
                name="pmgCumulativePct"
                type="number"
                step="any"
                defaultValue={pctDisplay(recon?.pmgCumulativePct)}
                className="input"
              />
            </Field>
          )}
        </div>
      </Section>

      <Section title={`📄 Hóa đơn${invoiceInit?.number ? " · ✅ Đã lập" : ""}`}>
        <div className="text-xs text-slate-500 -mt-2 mb-2">
          Trạng thái xuất hóa đơn cho đợt đối chiếu này. Nếu chưa lập, cứ để trống.
        </div>
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

      {/* Các % Excel không có, giữ hidden để không break shape / data cũ */}
      <input
        type="hidden"
        name="phasePctThisTime"
        defaultValue={pctDisplay(recon?.phasePctThisTime)}
      />
      <input
        type="hidden"
        name="pmgSupportPct"
        defaultValue={pctDisplay(recon?.pmgSupportPct)}
      />
      <input
        type="hidden"
        name="otherRevenuePct"
        defaultValue={pctDisplay(recon?.otherRevenuePct)}
      />

      {/* Tham chiếu từ căn — grayed out */}
      {product && (
        <Section title="📌 Tham chiếu từ căn">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <RefInfo label="Giá tính PMG" value={fmtMoney(product.pmgBasePrice)} />
            <RefInfo
              label="%PMG_LK"
              value={fmtPctTight(product.pmgRate)}
            />
            <RefInfo label="Phí admin" value={fmtMoney(product.adminFee)} />
            <RefInfo
              label="HH BRE dự kiến"
              value={fmtMoney(
                Math.max(
                  0,
                  Number(product.pmgBasePrice ?? 0) * Number(product.pmgRate ?? 0) -
                    Number(product.adminFee ?? 0),
                ),
              )}
              highlight
            />
          </div>
        </Section>
      )}

      {/* Số tiền đợt này */}
      <Section title="💵 Số tiền đợt này">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Loại đợt" required>
            <select
              value={reconType}
              onChange={(e) => setReconType(e.target.value)}
              className="input"
            >
              {!isSecondary && (
                <>
                  <option value="phase:1">Đợt 1 (theo tiến độ)</option>
                  <option value="phase:2">Đợt 2 (theo tiến độ)</option>
                  <option value="phase:3">Đợt 3 (theo tiến độ)</option>
                  <option value="phase:4">Đợt 4 (theo tiến độ)</option>
                  <option value="phase:5">Đợt 5 (theo tiến độ)</option>
                </>
              )}
              {isSecondary && <option value="phase:1">Đợt duy nhất</option>}
              <option value="bonus_sale">Thưởng nóng cho sale</option>
              <option value="bonus_manager">Thưởng nóng cho quản lý sàn</option>
            </select>
          </Field>
          <Field label="Số tiền" required>
            <input
              type="text"
              inputMode="numeric"
              value={amountDisplay}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setAmount(digits ? Number(digits) : 0);
              }}
              onFocus={(e) => e.currentTarget.select()}
              className="input"
              placeholder="0"
            />
            {suggested > 0 && Math.abs(suggested - amount) > 100 && (
              <div className="text-xs mt-1.5 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                <span className="text-blue-700">
                  💡 Gợi ý từ căn:{" "}
                  <b className="tabular-nums">{fmtMoney(suggested)}</b>
                </span>
                <button
                  type="button"
                  onClick={() => setAmount(Math.round(suggested))}
                  className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700"
                >
                  Áp dụng
                </button>
              </div>
            )}
          </Field>
          <Field label="Mô tả / Ghi chú" full>
            <input
              name="note"
              defaultValue={recon?.note ?? ""}
              className="input"
              placeholder="vd: Đợt cọc, đợt HĐMB, thưởng nóng, ..."
            />
          </Field>
        </div>

        {/* Hidden inputs — route số tiền vào field đúng theo loại */}
        <input type="hidden" name="phaseNumber" value={phaseN} />
        <input type="hidden" name="revenueThisTime" value={revenueThisTimeVal} />
        <input type="hidden" name="cdtBonusSale" value={cdtBonusSaleVal} />
        <input type="hidden" name="cdtBonusManager" value={cdtBonusManagerVal} />
        <input type="hidden" name="totalReceivableThisTime" value={amount} />
        <input
          type="hidden"
          name="pmgBasePrice"
          defaultValue={String(recon?.pmgBasePrice ?? product?.pmgBasePrice ?? 0)}
        />
        <input
          type="hidden"
          name="adminFeeVat"
          defaultValue={String(recon?.adminFeeVat ?? 0)}
        />
        <input
          type="hidden"
          name="revenueOffProgress"
          defaultValue={String(recon?.revenueOffProgress ?? 0)}
        />
        <input
          type="hidden"
          name="revenueReduction"
          defaultValue={String(recon?.revenueReduction ?? 0)}
        />
      </Section>

      {/* Cấu hình phân bổ HH & KPI — nhập tại đây, các trang khác đọc lại */}
      {!isSecondary && (
        <Section title="⚙️ Cấu hình phân bổ HH & KPI (áp lên căn khi lưu)">
          <div className="text-xs text-slate-500 -mt-2 mb-3">
            Nhập các tỷ lệ & thưởng ở đây. Khi lưu, hệ thống tự cập nhật lên căn để tất cả các
            trang khác (giá vốn, báo cáo) dùng chung.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="%PMG_LK_sale (base HH+KPI)">
              <input
                name="cfgPmgSaleRate"
                type="number"
                step="any"
                defaultValue={pctDisplay(product?.pmgSaleRate)}
                className="input"
                placeholder="vd: 5.25"
              />
            </Field>
            <Field label="%HH sale (NVKD)">
              <input
                name="cfgSaleCommRate"
                type="number"
                step="any"
                defaultValue={pctDisplay(product?.saleCommissionRate)}
                className="input"
                placeholder="vd: 55"
              />
            </Field>
            <Field label="%KPI CEO">
              <input
                name="cfgKpiCeoRate"
                type="number"
                step="any"
                defaultValue={pctDisplay(product?.kpiCeoRate)}
                className="input"
                placeholder="vd: 3.5"
              />
            </Field>
            <Field label="%KPI TPKD">
              <input
                name="cfgKpiTpkdRate"
                type="number"
                step="any"
                defaultValue={pctDisplay(product?.kpiTpkdRate)}
                className="input"
                placeholder="vd: 2"
              />
            </Field>
            <Field label="%KPI Admin">
              <input
                name="cfgKpiAdminRate"
                type="number"
                step="any"
                defaultValue={pctDisplay(product?.kpiAdminRate)}
                className="input"
                placeholder="vd: 0.25"
              />
            </Field>
          </div>
          <div className="border-t border-slate-200 mt-3 pt-3">
            <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
              Thưởng nóng CĐT & CTY (số flat)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Thưởng nóng CĐT (sale)">
                <MoneyInput
                  name="cfgCdtBonusSale"
                  defaultValue={product?.cdtBonusSale ?? 0}
                  className="input"
                />
              </Field>
              <Field label="Thưởng nóng CĐT (QL)">
                <MoneyInput
                  name="cfgCdtBonusManager"
                  defaultValue={product?.cdtBonusManager ?? 0}
                  className="input"
                />
              </Field>
              <Field label="Thưởng NVKD (CTY)">
                <MoneyInput
                  name="cfgBonusSale"
                  defaultValue={product?.bonusSale ?? 0}
                  className="input"
                />
              </Field>
              <Field label="Thưởng TPKD (CTY)">
                <MoneyInput
                  name="cfgBonusManager"
                  defaultValue={product?.bonusManager ?? 0}
                  className="input"
                />
              </Field>
              <Field label="Hỗ trợ khách">
                <MoneyInput
                  name="cfgCustomerSupport"
                  defaultValue={product?.customerSupport ?? 0}
                  className="input"
                />
              </Field>
            </div>
          </div>
        </Section>
      )}

      {!isEdit && (
        <Section title="🏦 Đã nhận tiền vào TK cty chưa? (tùy chọn — điền nếu CĐT đã trả rồi)">
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
            Điền vào đây để tạo luôn 1 dòng thanh toán liên kết. Nếu chưa thu, cứ để trống.
          </div>
        </Section>
      )}

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
        {returnTo && <input type="hidden" name="__returnTo" value={returnTo} />}
        <button
          type="button"
          onClick={() => {
            if (returnTo) router.push(returnTo);
            else router.back();
          }}
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

function RefInfo({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-green-50 border border-green-200" : "bg-slate-100 border border-slate-200"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${highlight ? "text-green-700" : "text-slate-500"}`}>
        {value}
      </div>
    </div>
  );
}
