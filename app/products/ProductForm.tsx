"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, Project, Partner, Department } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import SearchableSelect from "@/components/SearchableSelect";
import { fmtMoney, toTitleCase } from "@/lib/format";

type ProjectWithPartner = Project & { partnerName?: string | null };

type Props = {
  product?: Product;
  projects: ProjectWithPartner[];
  partners: Partner[];
  departments?: Department[];
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  returnTo?: string | null;
};

const pctDisplay = (v: number | null | undefined): string =>
  v == null ? "" : String(Number((Number(v) * 100).toFixed(4)));

export default function ProductForm({ product, projects, departments = [], onSave, onDelete, returnTo }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [saleType, setSaleType] = useState<"primary" | "secondary">(
    (product?.saleType as "primary" | "secondary") ?? "primary",
  );
  const isSecondary = saleType === "secondary";

  // === Live compute state (Section Doanh thu) ===
  const [pmgBase, setPmgBase] = useState<number>(Number(product?.pmgBasePrice ?? 0));
  const [pmgRateLive, setPmgRateLive] = useState<number>(Number(product?.pmgRate ?? 0));
  const [adminFeeLive, setAdminFeeLive] = useState<number>(Number(product?.adminFee ?? 0));
  const [cdtBonusSaleLive, setCdtBonusSaleLive] = useState<number>(
    Number(product?.cdtBonusSale ?? 0),
  );
  const [cdtBonusMgrLive, setCdtBonusMgrLive] = useState<number>(
    Number(product?.cdtBonusManager ?? 0),
  );
  const [pmgSaleRateLive, setPmgSaleRateLive] = useState<number>(
    Number(product?.pmgSaleRate ?? 0),
  );
  // Section Giá vốn state
  const [adminFeeSaleLive, setAdminFeeSaleLive] = useState<number>(
    Number(product?.adminFeeSale ?? 0),
  );
  const [saleCommRateLive, setSaleCommRateLive] = useState<number>(
    Number(product?.saleCommissionRate ?? 0),
  );
  const [kpiCeoRateLive, setKpiCeoRateLive] = useState<number>(
    Number(product?.kpiCeoRate ?? 0),
  );
  const [kpiTpkdRateLive, setKpiTpkdRateLive] = useState<number>(
    Number(product?.kpiTpkdRate ?? 0),
  );
  const [kpiAdminRateLive, setKpiAdminRateLive] = useState<number>(
    Number(product?.kpiAdminRate ?? 0),
  );
  const [customerSupportLive, setCustomerSupportLive] = useState<number>(
    Number(product?.customerSupport ?? 0),
  );
  const [bonusMgrCtyLive, setBonusMgrCtyLive] = useState<number>(
    Number(product?.bonusManager ?? 0),
  );

  const cdtBonusTotal = cdtBonusSaleLive + cdtBonusMgrLive;
  const grossTotal = pmgBase * pmgRateLive + cdtBonusTotal;
  const netInternal = pmgBase * pmgRateLive - adminFeeLive;
  const dtThangDu = pmgBase * Math.max(0, pmgRateLive - pmgSaleRateLive);

  // Giá vốn computed
  const Q_sale = pmgBase * pmgSaleRateLive;
  const hhSaleAmt = Q_sale * saleCommRateLive;
  const kpiCeoAmt = Q_sale * kpiCeoRateLive;
  const kpiTpkdAmt = Q_sale * kpiTpkdRateLive;
  const kpiAdminAmt = Q_sale * kpiAdminRateLive;
  const adminSubsidyLive = Math.max(0, adminFeeLive - adminFeeSaleLive);
  const totalCostLive =
    hhSaleAmt +
    kpiCeoAmt +
    kpiTpkdAmt +
    kpiAdminAmt +
    adminFeeSaleLive +
    customerSupportLive +
    bonusMgrCtyLive +
    adminSubsidyLive;

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
            <input
              name="customerName"
              defaultValue={toTitleCase(product?.customerName) || ""}
              className="input"
              onBlur={(e) => {
                e.currentTarget.value = toTitleCase(e.currentTarget.value);
              }}
            />
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
              <option value="primary">Sơ cấp</option>
              <option value="secondary">Thứ cấp</option>
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
          {/* Ngày hoàn thành dự kiến + PTTT ẩn — bỏ khỏi UI theo yêu cầu */}
          <input
            type="hidden"
            name="expectedCompleteDate"
            value={product?.expectedCompleteDate ?? ""}
          />
          <input type="hidden" name="paymentMethod" value={product?.paymentMethod ?? ""} />
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
          {/* Row 1: Giá tính PMG + %PMG_LK */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Giá tính PMG (= giá bán)">
              <MoneyInput
                name="pmgBasePrice"
                defaultValue={product?.pmgBasePrice ?? 0}
                className="input"
                onValueChange={setPmgBase}
              />
            </Field>
            <Field label="%PMG_LK (CĐT trả BRE)">
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  name="pmgRate"
                  defaultValue={product?.pmgRate ? Number((Number(product.pmgRate) * 100).toFixed(4)) : ""}
                  onChange={(e) => setPmgRateLive(Number(e.target.value.replace(/,/g, ".")) / 100)}
                  className="input pr-8"
                  placeholder="VD: 6,75"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Muốn track lịch sử điều chỉnh → dùng &quot;Điều chỉnh thông tin căn&quot; bên dưới
              </div>
            </Field>
          </div>

          {/* Row 2: Phí admin — luôn 2 ô riêng (CĐT trừ vs dùng tính HH sale) */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Field label="Phí admin (CĐT trừ khỏi PMG)">
              <MoneyInput
                name="adminFee"
                defaultValue={product?.adminFee ?? 0}
                className="input"
                onValueChange={setAdminFeeLive}
              />
              <div className="text-[10px] text-slate-500 mt-1">
                Số CĐT trừ khỏi PMG trước khi chuyển tiền vào TK BRE
              </div>
            </Field>
            <Field label="Phí admin (dùng tính HH sale)">
              <MoneyInput
                name="adminFeeSale"
                defaultValue={product?.adminFeeSale ?? 0}
                className="input"
                onValueChange={setAdminFeeSaleLive}
              />
              <div className="text-[10px] text-slate-500 mt-1">
                Số ghi trong công thức HH sale. Chênh cty tự chịu.
              </div>
            </Field>
          </div>

          {/* Row 3: CĐT thưởng nóng */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Field label="CĐT thưởng nóng cho sale">
              <MoneyInput
                name="cdtBonusSale"
                defaultValue={product?.cdtBonusSale ?? 0}
                className="input"
                onValueChange={setCdtBonusSaleLive}
              />
            </Field>
            <Field label="CĐT thưởng nóng cho QL">
              <MoneyInput
                name="cdtBonusManager"
                defaultValue={product?.cdtBonusManager ?? 0}
                className="input"
                onValueChange={setCdtBonusMgrLive}
              />
            </Field>
          </div>

          {/* 3 loại tổng doanh thu (live compute) */}
          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
              Tổng doanh thu — tự động cập nhật khi anh chỉnh %PMG hoặc phí admin
            </div>
            <div className={`grid grid-cols-1 md:grid-cols-${dtThangDu > 0 ? 3 : 2} gap-3`}>
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                <div className="text-xs text-blue-700 font-semibold">A. Tổng ghi nhận</div>
                <div className="text-lg font-bold tabular-nums mt-1">{fmtMoney(grossTotal)}</div>
                <div className="text-[10px] text-slate-500 mt-1">
                  = PMG × %PMG_LK + thưởng CĐT (chưa trừ admin)
                </div>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50/60 p-3">
                <div className="text-xs text-green-700 font-semibold">
                  B. DT thuần nội bộ
                </div>
                <div className="text-lg font-bold tabular-nums mt-1">{fmtMoney(netInternal)}</div>
                <div className="text-[10px] text-slate-500 mt-1">
                  = Giá tính PMG × %PMG_LK − phí admin
                </div>
              </div>
              {dtThangDu > 0 && (
                <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-3">
                  <div className="text-xs text-purple-700 font-semibold">
                    C. DT thặng dư
                  </div>
                  <div className="text-lg font-bold tabular-nums mt-1">{fmtMoney(dtThangDu)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    = PMG × (%PMG_LK − %PMG_LK_sale) — CTY giữ + bù admin
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Hidden: totalRevenue tự tính = netInternal, sellPrice = pmgBasePrice */}
          <input type="hidden" name="totalRevenue" value={String(netInternal)} />
          <input type="hidden" name="sellPrice" value={String(pmgBase)} />
          <input type="hidden" name="otherFeePct" value="" />
          <input type="hidden" name="otherRevenue" value={0} />
          <input type="hidden" name="revenueReduction" value={0} />
          </>
        )}
      </Section>

      <Section title={isSecondary ? "Giá vốn (BRE trả NVKD)" : "Giá vốn (BRE trả nội bộ)"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="%HH sale (NVKD)">
            <input
              name="saleCommissionRate"
              type="number"
              step="any"
              defaultValue={pctDisplay(product?.saleCommissionRate)}
              className="input"
              onChange={(e) => {
                const n = Number(e.target.value.replace(/,/g, "."));
                setSaleCommRateLive(isNaN(n) ? 0 : n / 100);
              }}
            />
          </Field>
          <Field label="Hỗ trợ khách">
            <MoneyInput
              name="customerSupport"
              defaultValue={product?.customerSupport ?? 0}
              className="input"
              onValueChange={setCustomerSupportLive}
            />
          </Field>
          <Field label="CTY thưởng QL">
            <MoneyInput
              name="bonusManager"
              defaultValue={product?.bonusManager ?? 0}
              className="input"
              onValueChange={setBonusMgrCtyLive}
            />
          </Field>
          <input type="hidden" name="bonusSale" value={0} />
          <input type="hidden" name="otherCost" value={0} />
          {!isSecondary && (
            <>
              <Field label="%PMG_LK_sale (base tính HH sale)">
                <input
                  name="pmgSaleRate"
                  type="number"
                  step="any"
                  defaultValue={pctDisplay(product?.pmgSaleRate)}
                  className="input"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/,/g, "."));
                    setPmgSaleRateLive(isNaN(n) ? 0 : n / 100);
                  }}
                />
              </Field>
              <Field label="%KPI CEO">
                <input
                  name="kpiCeoRate"
                  type="number"
                  step="any"
                  defaultValue={pctDisplay(product?.kpiCeoRate)}
                  className="input"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/,/g, "."));
                    setKpiCeoRateLive(isNaN(n) ? 0 : n / 100);
                  }}
                />
              </Field>
              <Field label="%KPI TPKD (Trưởng phòng)">
                <input
                  name="kpiTpkdRate"
                  type="number"
                  step="any"
                  defaultValue={pctDisplay(product?.kpiTpkdRate)}
                  className="input"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/,/g, "."));
                    setKpiTpkdRateLive(isNaN(n) ? 0 : n / 100);
                  }}
                />
              </Field>
              <Field label="%KPI Admin">
                <input
                  name="kpiAdminRate"
                  type="number"
                  step="any"
                  defaultValue={pctDisplay(product?.kpiAdminRate)}
                  className="input"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/,/g, "."));
                    setKpiAdminRateLive(isNaN(n) ? 0 : n / 100);
                  }}
                />
              </Field>
            </>
          )}
        </div>

        {/* Tổng giá vốn — read-only, live compute */}
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="rounded-lg border-2 border-orange-200 bg-orange-50/60 p-4">
            <div className="flex justify-between items-center">
              <div className="text-sm font-semibold text-orange-900 flex items-center gap-1.5">
                Tổng giá vốn
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-300 text-white text-[10px] cursor-help select-none"
                  title={`Tự động tính từ:\n= HH sale (Q_sale × %HH)\n+ KPI CEO/TPKD/Admin (Q_sale × %KPI)\n+ Hỗ trợ khách\n+ CTY thưởng QL\n+ Phí admin sale${adminSubsidyLive > 0 ? `\n+ Bù admin ${fmtMoney(adminSubsidyLive)} (admin thực > admin sale)` : ""}\n\nQ_sale = Giá tính PMG × %PMG_LK_sale`}
                >
                  ?
                </span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-orange-900">
                {fmtMoney(totalCostLive)}
              </div>
            </div>
          </div>
          <input type="hidden" name="totalCost" value={String(totalCostLive)} />
        </div>
        {isSecondary && (
          <>
            <input type="hidden" name="pmgSaleRate" value="" />
            <input type="hidden" name="adminFeeSale" value={0} />
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
        {returnTo && <input type="hidden" name="__returnTo" value={returnTo} />}
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

