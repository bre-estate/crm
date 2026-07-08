"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, Project, Partner, Department } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import SearchableSelect from "@/components/SearchableSelect";

type ProjectWithPartner = Project & { partnerName?: string | null };

type Props = {
  product?: Product;
  projects: ProjectWithPartner[];
  partners: Partner[];
  departments?: Department[];
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
};

const pctDisplay = (v: number | null | undefined): string =>
  v == null ? "" : String(Number((Number(v) * 100).toFixed(4)));

export default function ProductForm({ product, projects, departments = [], onSave, onDelete }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [saleType, setSaleType] = useState<"primary" | "secondary">(
    (product?.saleType as "primary" | "secondary") ?? "primary",
  );
  const isSecondary = saleType === "secondary";

  return (
    <form
      action={(fd) =>
        start(async () => {
          try {
            await onSave(fd);
          } catch (e) {
            if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
            alert(e instanceof Error ? e.message : "Lỗi khi lưu");
          }
        })
      }
      className="space-y-6 bg-white border border-slate-200 rounded-xl p-6"
    >
      <Section title="Thông tin căn">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Dự án" required>
            <SearchableSelect
              name="projectId"
              defaultValue={product?.projectId ?? projects[0]?.id ?? ""}
              placeholder="Gõ tên dự án..."
              required
              options={projects.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: p.fullCode,
              }))}
            />
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
            <SearchableSelect
              name="departmentId"
              defaultValue={product?.departmentId ?? ""}
              emptyOption="— Chưa phân phòng —"
              placeholder="Gõ tên phòng..."
              options={departments.map((d) => ({
                value: d.id,
                label: d.name,
                sublabel: d.leaderName ? `Leader: ${d.leaderName}` : undefined,
              }))}
            />
            <input type="hidden" name="deptName" defaultValue={product?.deptName ?? ""} />
          </Field>
          <Field label="Loại giao dịch">
            <select
              name="saleType"
              value={saleType}
              onChange={(e) => setSaleType(e.target.value as "primary" | "secondary")}
              className="input"
            >
              <option value="primary">Sơ cấp (HĐ với CĐT)</option>
              <option value="secondary">Thứ cấp (mua bán lại)</option>
            </select>
          </Field>
          <Field label="Tháng ghi nhận DT (YYYY-MM)">
            <input
              name="recognitionMonth"
              defaultValue={product?.recognitionMonth ?? ""}
              className="input"
              placeholder="vd: 2025-06"
            />
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

      <Section title={isSecondary ? "Doanh thu" : "Doanh thu (CĐT/F1 trả BRE)"}>
        {isSecondary ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Doanh thu về cty">
                <MoneyInput
                  name="totalRevenue"
                  defaultValue={product?.totalRevenue ?? 0}
                  className="input"
                />
              </Field>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Giao dịch thứ cấp = mua bán lại, không có %PMG_LK từ CĐT. Nhập số cty thực nhận.
            </div>
            {/* Hidden fields để BE luôn nhận đủ shape — set 0 khi thứ cấp */}
            <input type="hidden" name="sellPrice" value={0} />
            <input type="hidden" name="pmgBasePrice" value={0} />
            <input type="hidden" name="pmgRate" value="" />
            <input type="hidden" name="otherFeePct" value="" />
            <input type="hidden" name="otherRevenue" value={0} />
            <input type="hidden" name="revenueReduction" value={0} />
            <input type="hidden" name="adminFee" value={0} />
            <input type="hidden" name="cdtBonusSale" value={0} />
            <input type="hidden" name="cdtBonusManager" value={0} />
          </>
        ) : (
          <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Giá bán">
              <MoneyInput name="sellPrice" defaultValue={product?.sellPrice ?? 0} className="input" />
            </Field>
            <Field label="Tổng doanh thu (gồm VAT)">
              <MoneyInput name="totalRevenue" defaultValue={product?.totalRevenue ?? 0} className="input" />
            </Field>
            <Field label="Giá tính PMG">
              <MoneyInput name="pmgBasePrice" defaultValue={product?.pmgBasePrice ?? 0} className="input" />
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
            <Field label="Phí admin (gồm VAT)">
              <MoneyInput name="adminFee" defaultValue={product?.adminFee ?? 0} className="input" />
            </Field>
            <Field label="CĐT thưởng sale">
              <MoneyInput name="cdtBonusSale" defaultValue={product?.cdtBonusSale ?? 0} className="input" />
            </Field>
            <Field label="CĐT thưởng QL">
              <MoneyInput name="cdtBonusManager" defaultValue={product?.cdtBonusManager ?? 0} className="input" />
            </Field>
          </div>
          {/* Fields toàn 0 trên DB — hidden để BE nhận đủ shape */}
          <input type="hidden" name="otherFeePct" value="" />
          <input type="hidden" name="otherRevenue" value={0} />
          <input type="hidden" name="revenueReduction" value={0} />
          </>
        )}
      </Section>

      <Section title={isSecondary ? "Giá vốn (BRE trả NVKD)" : "Giá vốn (BRE trả nội bộ)"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tổng giá vốn">
            <MoneyInput name="totalCost" defaultValue={product?.totalCost ?? 0} className="input" />
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
          <Field label="Hỗ trợ khách">
            <MoneyInput name="customerSupport" defaultValue={product?.customerSupport ?? 0} className="input" />
          </Field>
          <Field label="CTY thưởng QL">
            <MoneyInput name="bonusManager" defaultValue={product?.bonusManager ?? 0} className="input" />
          </Field>
          {/* bonusSale + otherCost toàn 0 → hidden */}
          <input type="hidden" name="bonusSale" value={0} />
          <input type="hidden" name="otherCost" value={0} />
          {/* Phí admin sale tự động = adminFee (CĐT chuyển transit qua BRE) */}
          <input type="hidden" name="adminFeeSale" value={String(product?.adminFee ?? 0)} />
          {!isSecondary && (
            <>
              <Field label="%PMG_LK_sale (base tính HH sale)">
                <input
                  name="pmgSaleRate"
                  type="number"
                  step="any"
                  defaultValue={pctDisplay(product?.pmgSaleRate)}
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
              <Field label="%KPI TPKD (Trưởng phòng)">
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
            </>
          )}
        </div>
        {isSecondary && (
          <>
            <input type="hidden" name="pmgSaleRate" value="" />
            <input type="hidden" name="kpiCeoRate" value="" />
            <input type="hidden" name="kpiTpkdRate" value="" />
            <input type="hidden" name="kpiAdminRate" value="" />
          </>
        )}
      </Section>

      <Section title="Ghi chú">
        <Field label="Nội dung">
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
                    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
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
