"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, Project, Partner } from "@/lib/schema";

type ProjectWithPartner = Project & { partnerName?: string | null };

type Props = {
  product?: Product;
  projects: ProjectWithPartner[];
  partners: Partner[];
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
};

const pctDisplay = (v: number | null | undefined): string =>
  v == null ? "" : String(Number((Number(v) * 100).toFixed(4)));

export default function ProductForm({ product, projects, onSave, onDelete }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      action={(fd) =>
        start(async () => {
          try {
            await onSave(fd);
          } catch (e) {
            alert(e instanceof Error ? e.message : "Lỗi khi lưu");
          }
        })
      }
      className="space-y-6 bg-white border border-slate-200 rounded-xl p-6"
    >
      <Section title="Thông tin căn">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Dự án" required>
            <select
              name="projectId"
              defaultValue={product?.projectId ?? projects[0]?.id ?? ""}
              className="input"
              required
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullCode} · {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mã căn" required>
            <input
              name="unitCode"
              defaultValue={product?.unitCode ?? ""}
              className="input"
              required
            />
          </Field>
          <Field label="Tên khách">
            <input name="customerName" defaultValue={product?.customerName ?? ""} className="input" />
          </Field>
          <Field label="Mô tả căn (loại, dt...)">
            <input
              name="unitDescription"
              defaultValue={product?.unitDescription ?? ""}
              className="input"
            />
          </Field>
          <Field label="NVKD">
            <input name="salesPerson" defaultValue={product?.salesPerson ?? ""} className="input" />
          </Field>
          <Field label="Phòng kinh doanh">
            <input name="deptName" defaultValue={product?.deptName ?? ""} className="input" />
          </Field>
          <Field label="Ngày cọc">
            <input
              type="date"
              name="depositDate"
              defaultValue={product?.depositDate ?? ""}
              className="input"
            />
          </Field>
          <Field label="Ngày hoàn thành dự kiến">
            <input
              type="date"
              name="expectedCompleteDate"
              defaultValue={product?.expectedCompleteDate ?? ""}
              className="input"
            />
          </Field>
          <Field label="PTTT">
            <input
              name="paymentMethod"
              defaultValue={product?.paymentMethod ?? ""}
              className="input"
            />
          </Field>
        </div>
      </Section>

      <Section title="Doanh thu (CĐT/F1 trả BRE)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Giá bán (VND)">
            <input
              name="sellPrice"
              type="number"
              defaultValue={product?.sellPrice ?? 0}
              className="input"
            />
          </Field>
          <Field label="Tổng doanh thu (VND, gồm VAT)">
            <input
              name="totalRevenue"
              type="number"
              defaultValue={product?.totalRevenue ?? 0}
              className="input"
            />
          </Field>
          <Field label="Giá tính PMG (VND)">
            <input
              name="pmgBasePrice"
              type="number"
              defaultValue={product?.pmgBasePrice ?? 0}
              className="input"
            />
          </Field>
          <Field label="%PMG_LK (vd: 5.5)">
            <input
              name="pmgRate"
              type="number"
              step="any"
              defaultValue={pctDisplay(product?.pmgRate)}
              className="input"
            />
          </Field>
          <Field label="%phí khác">
            <input
              name="otherFeePct"
              type="number"
              step="any"
              defaultValue={pctDisplay(product?.otherFeePct)}
              className="input"
            />
          </Field>
          <Field label="Doanh thu khác (VND)">
            <input
              name="otherRevenue"
              type="number"
              defaultValue={product?.otherRevenue ?? 0}
              className="input"
            />
          </Field>
          <Field label="Khoản giảm doanh thu (VND)">
            <input
              name="revenueReduction"
              type="number"
              defaultValue={product?.revenueReduction ?? 0}
              className="input"
            />
          </Field>
          <Field label="Phí admin (VND, gồm VAT)">
            <input
              name="adminFee"
              type="number"
              defaultValue={product?.adminFee ?? 0}
              className="input"
            />
          </Field>
          <Field label="CĐT thưởng sale (VND)">
            <input
              name="cdtBonusSale"
              type="number"
              defaultValue={product?.cdtBonusSale ?? 0}
              className="input"
            />
          </Field>
          <Field label="CĐT thưởng QL (VND)">
            <input
              name="cdtBonusManager"
              type="number"
              defaultValue={product?.cdtBonusManager ?? 0}
              className="input"
            />
          </Field>
        </div>
      </Section>

      <Section title="Giá vốn (BRE trả nội bộ + F2 dưới)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tổng giá vốn (VND)">
            <input
              name="totalCost"
              type="number"
              defaultValue={product?.totalCost ?? 0}
              className="input"
            />
          </Field>
          <Field label="%PMG_LK_sale (trả F2 dưới)">
            <input
              name="pmgSaleRate"
              type="number"
              step="any"
              defaultValue={pctDisplay(product?.pmgSaleRate)}
              className="input"
            />
          </Field>
          <Field label="%HH sale (NVKD)">
            <input
              name="saleCommissionRate"
              type="number"
              step="any"
              defaultValue={pctDisplay(product?.saleCommissionRate)}
              className="input"
            />
          </Field>
          <Field label="Phí admin sale (VND)">
            <input
              name="adminFeeSale"
              type="number"
              defaultValue={product?.adminFeeSale ?? 0}
              className="input"
            />
          </Field>
          <Field label="Hỗ trợ khách (VND)">
            <input
              name="customerSupport"
              type="number"
              defaultValue={product?.customerSupport ?? 0}
              className="input"
            />
          </Field>
          <Field label="CTY thưởng NVKD (VND)">
            <input
              name="bonusSale"
              type="number"
              defaultValue={product?.bonusSale ?? 0}
              className="input"
            />
          </Field>
          <Field label="CTY thưởng QL (VND)">
            <input
              name="bonusManager"
              type="number"
              defaultValue={product?.bonusManager ?? 0}
              className="input"
            />
          </Field>
          <Field label="%KPI CEO">
            <input
              name="kpiCeoRate"
              type="number"
              step="any"
              defaultValue={pctDisplay(product?.kpiCeoRate)}
              className="input"
            />
          </Field>
          <Field label="%KPI TPKD">
            <input
              name="kpiTpkdRate"
              type="number"
              step="any"
              defaultValue={pctDisplay(product?.kpiTpkdRate)}
              className="input"
            />
          </Field>
          <Field label="%KPI Admin">
            <input
              name="kpiAdminRate"
              type="number"
              step="any"
              defaultValue={pctDisplay(product?.kpiAdminRate)}
              className="input"
            />
          </Field>
          <Field label="CP giá vốn khác (VND)">
            <input
              name="otherCost"
              type="number"
              defaultValue={product?.otherCost ?? 0}
              className="input"
            />
          </Field>
        </div>
      </Section>

      <Section title="Ghi chú">
        <Field label="Note">
          <textarea name="note" defaultValue={product?.note ?? ""} className="input" rows={3} />
        </Field>
      </Section>

      <div className="flex justify-end gap-3 pt-2">
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Xóa giao dịch "${product?.unitCode}"?`)) {
                start(async () => {
                  try {
                    await onDelete();
                  } catch (e) {
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
