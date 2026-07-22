"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, Project, Partner, Department, ProductAdjustment } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import SearchableSelect from "@/components/SearchableSelect";
import { fmtMoney, fmtDate, fmtPctTight, toTitleCase } from "@/lib/format";
import AdjustmentDialog from "./[id]/AdjustmentDialog";
import { toast } from "sonner";

type ProjectWithPartner = Project & {
  partnerName?: string | null;
};

type EmployeeOption = {
  id: number;
  name: string;
  position: string;
  departmentId: number | null;
};

type Props = {
  product?: Product;
  projects: ProjectWithPartner[];
  partners: Partner[];
  departments?: Department[];
  employees?: EmployeeOption[];
  onSave: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  returnTo?: string | null;
  // Nếu true → khóa 3 field pmgBase / pmgRate / adminFee (dùng "Điều chỉnh thông tin căn" thay)
  lockCoreFields?: boolean;
  // Sum recon cdt_bonus_sale/manager để pre-check khi user giảm config
  reconCdtBonusSaleSum?: number;
  reconCdtBonusMgrSum?: number;
  // Existing adjustments từ DB (hiển thị trong block Điều chỉnh)
  existingAdjustments?: ProductAdjustment[];
};

// Pending adjustment — user gõ trong dialog nhưng chưa save vào DB, chỉ giữ
// trong state form. Save form → gửi kèm __pendingAdjustments JSON, server apply.
type PendingAdjustment = {
  effectiveDate: string;
  note: string | null;
  fields: Record<string, number>; // key = product field name, value = số đã parse
};

const pctDisplay = (v: number | null | undefined): string =>
  v == null ? "" : String(Number((Number(v) * 100).toFixed(4)));

export default function ProductForm({
  product,
  projects,
  departments = [],
  employees = [],
  onSave,
  onDelete,
  returnTo,
  lockCoreFields = false,
  reconCdtBonusSaleSum = 0,
  reconCdtBonusMgrSum = 0,
  existingAdjustments = [],
}: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const isEdit = !!product;
  // Pending adjustments (state) — thêm qua dialog, chưa save; save khi Lưu form
  const [pendingAdjustments, setPendingAdjustments] = useState<PendingAdjustment[]>([]);
  const [saleType, setSaleType] = useState<"primary" | "secondary">(
    (product?.saleType as "primary" | "secondary") ?? "primary",
  );
  const isSecondary = saleType === "secondary";

  // Filter dự án theo default_sale_type. Null = chưa phân loại → hiện ở cả 2 tab.
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (!p.defaultSaleType) return true;
      return p.defaultSaleType === saleType;
    });
  }, [projects, saleType]);

  const [projectId, setProjectId] = useState<string>(
    String(product?.projectId ?? filteredProjects[0]?.id ?? ""),
  );

  // NVKD dropdown state — value = employee.name (text). Chọn xong auto-fill dept.
  const [salesPersonName, setSalesPersonName] = useState<string>(product?.salesPerson ?? "");
  const [departmentIdState, setDepartmentIdState] = useState<string>(
    String(product?.departmentId ?? ""),
  );
  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.name,
        label: e.name,
        sublabel:
          `${e.position.toUpperCase()}${e.departmentId ? " · " + (departments.find((d) => d.id === e.departmentId)?.name ?? "") : ""}`.trim(),
      })),
    [employees, departments],
  );
  const handleSalesPersonChange = (v: string) => {
    setSalesPersonName(v);
    const emp = employees.find((e) => e.name === v);
    if (emp?.departmentId) setDepartmentIdState(String(emp.departmentId));
  };
  // Nếu switch saleType → project hiện tại không còn trong list → reset về option đầu
  useEffect(() => {
    if (!projectId) return;
    if (!filteredProjects.some((p) => String(p.id) === projectId)) {
      setProjectId(String(filteredProjects[0]?.id ?? ""));
    }
  }, [filteredProjects, projectId]);

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
  // Chuẩn Excel col P: PMG × (%PMG_LK + %phí khác) + DT khác − giảm DT − admin + CĐT thưởng
  // Các field legacy (otherFeePct/otherRevenue/revenueReduction) không có UI, chỉ preserve từ DB.
  const otherFeePctLegacy = Number(product?.otherFeePct ?? 0);
  const otherRevenueLegacy = Number(product?.otherRevenue ?? 0);
  const revenueReductionLegacy = Number(product?.revenueReduction ?? 0);
  const grossTotal =
    pmgBase * (pmgRateLive + otherFeePctLegacy) +
    otherRevenueLegacy -
    revenueReductionLegacy -
    adminFeeLive +
    cdtBonusTotal;
  const netInternal = pmgBase * pmgRateLive - adminFeeLive;
  const dtThangDu = pmgBase * Math.max(0, pmgRateLive - pmgSaleRateLive);

  // Giá vốn — CHUẨN Excel col R (đồng bộ trang detail):
  //   baseNet = (PMG × %PMG_LK_sale − admin sale) / 1,1 − hỗ trợ khách
  //   HH sale = baseNet × %HH + CĐT thưởng / 1,1 + CTY thưởng NVKD
  //   KPI CEO/TPKD/Admin = baseNet × %KPI
  //   Tổng = HH sale + KPI CEO + KPI TPKD + KPI Admin + CTY thưởng QL + CP khác
  const otherCostStored = Number(product?.otherCost ?? 0);
  const bonusSaleStored = Number(product?.bonusSale ?? 0);
  const baseNetLive =
    (pmgBase * pmgSaleRateLive - adminFeeSaleLive) / 1.1 - customerSupportLive;
  const cdtBonusNetLive = cdtBonusTotal / 1.1;
  const hhSaleBaseLive = baseNetLive * saleCommRateLive;
  const hhSaleAmt = hhSaleBaseLive + cdtBonusNetLive + bonusSaleStored;
  const kpiCeoAmt = baseNetLive * kpiCeoRateLive;
  const kpiTpkdAmt = baseNetLive * kpiTpkdRateLive;
  const kpiAdminAmt = baseNetLive * kpiAdminRateLive;
  const totalCostLive =
    hhSaleAmt + kpiCeoAmt + kpiTpkdAmt + kpiAdminAmt + bonusMgrCtyLive + otherCostStored;

  return (
    <form
      action={(fd) => {
        // Pre-check client: không cho giảm CĐT thưởng xuống dưới sum đã ĐC
        // MoneyInput format "33.000.000" — phải strip dot trước khi Number(),
        // không thì Number("33.000.000") = NaN → check silently pass.
        const parseVN = (v: FormDataEntryValue | null): number => {
          const digits = String(v ?? "").replace(/[^\d]/g, "");
          return digits ? Number(digits) : 0;
        };
        const newSale = parseVN(fd.get("cdtBonusSale"));
        const newMgr = parseVN(fd.get("cdtBonusManager"));
        if (reconCdtBonusSaleSum > 0 && newSale < reconCdtBonusSaleSum - 1) {
          toast.warning(
            `Không giảm được "CĐT thưởng sale" xuống ${newSale.toLocaleString("vi-VN")} — đã ĐC ${reconCdtBonusSaleSum.toLocaleString("vi-VN")}. Muốn giảm thì phải sửa/xoá đợt ĐC trước.`,
            { duration: 8000 },
          );
          return;
        }
        if (reconCdtBonusMgrSum > 0 && newMgr < reconCdtBonusMgrSum - 1) {
          toast.warning(
            `Không giảm được "CĐT thưởng quản lý" xuống ${newMgr.toLocaleString("vi-VN")} — đã ĐC ${reconCdtBonusMgrSum.toLocaleString("vi-VN")}. Muốn giảm thì phải sửa/xoá đợt ĐC trước.`,
            { duration: 8000 },
          );
          return;
        }
        start(async () => {
          try {
            await onSave(fd);
          } catch (e) {
            if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
            toast.error(e instanceof Error ? e.message : "Lỗi khi lưu");
          }
        });
      }}
      autoComplete="off"
      className="space-y-6 bg-white border border-slate-200 rounded-xl p-6"
    >
      {/* ===== Top action bar (chỉ hiện khi edit) ===== */}
      {isEdit && (
        <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-2 px-6 py-3 bg-white border-b border-slate-200 flex items-center gap-3">
          <div className="text-lg font-bold flex-1">Sửa giao dịch</div>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
            disabled={pending}
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {pending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      )}

      {/* ===== Inline warning: config CĐT thưởng < sum đã ĐC ===== */}
      {isEdit &&
        ((reconCdtBonusSaleSum > 0 && cdtBonusSaleLive < reconCdtBonusSaleSum - 1) ||
          (reconCdtBonusMgrSum > 0 && cdtBonusMgrLive < reconCdtBonusMgrSum - 1)) && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm text-amber-900 space-y-1">
            <div className="font-semibold">⚠️ Config CĐT thưởng thấp hơn số đã đối chiếu:</div>
            {reconCdtBonusSaleSum > 0 && cdtBonusSaleLive < reconCdtBonusSaleSum - 1 && (
              <div className="text-xs">
                · CĐT thưởng sale: đang nhập <b>{cdtBonusSaleLive.toLocaleString("vi-VN")}</b> nhưng đã ĐC{" "}
                <b>{reconCdtBonusSaleSum.toLocaleString("vi-VN")}</b> — không lưu được nếu bấm Lưu.
              </div>
            )}
            {reconCdtBonusMgrSum > 0 && cdtBonusMgrLive < reconCdtBonusMgrSum - 1 && (
              <div className="text-xs">
                · CĐT thưởng quản lý: đang nhập <b>{cdtBonusMgrLive.toLocaleString("vi-VN")}</b> nhưng đã ĐC{" "}
                <b>{reconCdtBonusMgrSum.toLocaleString("vi-VN")}</b> — không lưu được nếu bấm Lưu.
              </div>
            )}
            <div className="text-xs text-amber-700 pt-1">
              Muốn giảm config: vào Doanh thu sửa/xoá đợt ĐC cũ trước, rồi quay lại đây giảm.
            </div>
          </div>
        )}

      <Section title="Thông tin căn">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Loại giao dịch" required>
            <select
              name="saleType"
              value={saleType}
              onChange={(e) => setSaleType(e.target.value as "primary" | "secondary")}
              className="input"
              disabled={isEdit}
            >
              <option value="primary">Sơ cấp</option>
              <option value="secondary">Thứ cấp</option>
            </select>
            {isEdit && (
              <div className="text-[10px] text-slate-500 mt-1">
                Không đổi được. Nhầm loại → xóa & tạo giao dịch mới.
              </div>
            )}
          </Field>
          <Field label="Dự án" required>
            <SearchableSelect
              name="projectId"
              value={projectId}
              onChange={setProjectId}
              placeholder="Gõ tên dự án..."
              required
              disabled={isEdit}
              options={filteredProjects.map((p) => ({
                value: p.id,
                label: p.partnerName ? `${p.name} - ${p.partnerName}` : p.name,
              }))}
            />
            {isEdit && (
              <div className="text-[10px] text-slate-500 mt-1">
                Không đổi được. Nhầm dự án → xóa & tạo giao dịch mới.
              </div>
            )}
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
              placeholder="vd: 2 PN"
            />
          </Field>
          <Field label="Loại căn">
            <div className="flex gap-2 items-center">
              <select
                name="unitTypeCombined"
                defaultValue={(() => {
                  if (product?.unitType === "penthouse") return "penthouse";
                  if (product?.unitType === "duplex") return "duplex";
                  if (product?.unitType === "shophouse") return "shophouse";
                  if (product?.unitType === "commercial") return "commercial";
                  return product?.bedrooms == null ? "" : String(product.bedrooms);
                })()}
                className="input flex-1"
              >
                <option value="">— chưa xác định —</option>
                <option value="0">Studio</option>
                <option value="1">1 PN</option>
                <option value="2">2 PN</option>
                <option value="3">3 PN</option>
                <option value="4">4 PN</option>
                <option value="penthouse">Penthouse</option>
                <option value="duplex">Duplex</option>
                <option value="shophouse">Shophouse</option>
                <option value="commercial">TMDV (Thương mại dịch vụ)</option>
              </select>
              <label className="flex items-center gap-1 text-xs whitespace-nowrap" title="Có phòng phụ đa năng (VD 1PN+, 2PN+). Chỉ áp dụng cho căn hộ 1-4 PN.">
                <input
                  type="checkbox"
                  name="hasBonusRoom"
                  defaultChecked={product?.hasBonusRoom ?? false}
                />
                <span>+PN phụ</span>
              </label>
            </div>
            {product?.parseNote && (
              <div className="text-[10px] text-amber-600 mt-1">
                ⚠️ {product.parseNote}
              </div>
            )}
          </Field>
          <Field label="DT thông thủy (m²)">
            <input
              type="number"
              step="0.01"
              min="0"
              name="areaM2Net"
              defaultValue={product?.areaM2Net ?? ""}
              className="input"
              placeholder="vd: 65.5"
            />
            <div className="text-[10px] text-slate-500 mt-1">Chuẩn pháp lý + sổ đỏ</div>
          </Field>
          <Field label="DT tim tường (m²)">
            <input
              type="number"
              step="0.01"
              min="0"
              name="areaM2Gross"
              defaultValue={product?.areaM2Gross ?? ""}
              className="input"
              placeholder="vd: 72.0"
            />
            <div className="text-[10px] text-slate-500 mt-1">Marketing CĐT · gross</div>
          </Field>
          <Field label="Ngày cọc">
            <input
              type="date"
              name="depositDate"
              defaultValue={product?.depositDate ?? ""}
              className="input"
            />
          </Field>
          <Field label="NVKD">
            <SearchableSelect
              value={salesPersonName}
              onChange={handleSalesPersonChange}
              emptyOption="— Chưa gán —"
              placeholder="Gõ tên NVKD..."
              options={employeeOptions}
            />
            <input type="hidden" name="salesPerson" value={salesPersonName} />
            <div className="text-[10px] text-slate-500 mt-1">
              Chọn xong tự điền Phòng.{" "}
              <a href="/employees" className="text-blue-600 hover:underline">
                Thêm NV mới
              </a>
            </div>
          </Field>
          <Field label="Phòng kinh doanh">
            <SearchableSelect
              value={departmentIdState}
              onChange={setDepartmentIdState}
              emptyOption="— Chưa phân phòng —"
              placeholder="Gõ tên phòng..."
              options={departments.map((d) => ({
                value: d.id,
                label: d.name,
                sublabel: d.leaderName ? `Leader: ${d.leaderName}` : undefined,
              }))}
            />
            <input type="hidden" name="departmentId" value={departmentIdState} />
            <input type="hidden" name="deptName" defaultValue={product?.deptName ?? ""} />
          </Field>
          {/* Tháng ghi nhận DT bỏ khỏi form — luôn = tháng của deposit_date */}
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Giá tính PMG (= giá bán)">
              {lockCoreFields ? (
                <>
                  <MoneyInput
                    name="_locked_pmgBase"
                    defaultValue={product?.pmgBasePrice ?? 0}
                    className="input"
                    disabled
                  />
                  {/* Hidden để form submit đúng giá trị (disabled field không submit) */}
                  <input type="hidden" name="pmgBasePrice" value={String(Math.round(Number(product?.pmgBasePrice ?? 0)))} />
                </>
              ) : (
                <MoneyInput
                  name="pmgBasePrice"
                  defaultValue={product?.pmgBasePrice ?? 0}
                  className="input"
                  onValueChange={setPmgBase}
                />
              )}
              {lockCoreFields && <LockedFieldHint />}
            </Field>
            <Field label="%PMG_LK (CĐT trả BRE)">
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  name={lockCoreFields ? "_locked_pmgRate" : "pmgRate"}
                  defaultValue={product?.pmgRate ? Number((Number(product.pmgRate) * 100).toFixed(4)) : ""}
                  onChange={(e) => setPmgRateLive(Number(e.target.value.replace(/,/g, ".")) / 100)}
                  disabled={lockCoreFields}
                  className={`input pr-8 ${lockCoreFields ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
                  placeholder="VD: 6,75"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
              </div>
              {lockCoreFields && (
                <input type="hidden" name="pmgRate" value={product?.pmgRate ? Number((Number(product.pmgRate) * 100).toFixed(4)) : ""} />
              )}
              {lockCoreFields && <LockedFieldHint />}
            </Field>
            <Field label="Phí admin (CĐT trừ khỏi PMG)">
              {lockCoreFields ? (
                <>
                  <MoneyInput
                    name="_locked_adminFee"
                    defaultValue={product?.adminFee ?? 0}
                    className="input"
                    disabled
                  />
                  <input type="hidden" name="adminFee" value={String(Math.round(Number(product?.adminFee ?? 0)))} />
                </>
              ) : (
                <MoneyInput
                  name="adminFee"
                  defaultValue={product?.adminFee ?? 0}
                  className="input"
                  onValueChange={setAdminFeeLive}
                />
              )}
              {lockCoreFields ? (
                <LockedFieldHint />
              ) : (
                <div className="text-[10px] text-slate-500 mt-1">
                  CĐT trừ khỏi PMG trước khi chuyển vào TK BRE
                </div>
              )}
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
                  = PMG × %PMG_LK − phí admin + CĐT thưởng
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

          {/* Hidden: totalRevenue = Tổng ghi nhận (Excel col P, khớp reports).
              sellPrice = pmgBasePrice.
              Preserve otherFeePct/otherRevenue/revenueReduction từ legacy — không hard-zero. */}
          {/* ROUND để tránh decimal → server toNum strip . thành 10^N */}
          <input type="hidden" name="totalRevenue" value={String(Math.round(grossTotal))} />
          <input type="hidden" name="sellPrice" value={String(Math.round(pmgBase))} />
          <input
            type="hidden"
            name="otherFeePct"
            value={product?.otherFeePct != null ? String(Number(product.otherFeePct) * 100) : ""}
          />
          <input type="hidden" name="otherRevenue" value={String(Number(product?.otherRevenue ?? 0))} />
          <input
            type="hidden"
            name="revenueReduction"
            value={String(Number(product?.revenueReduction ?? 0))}
          />
          </>
        )}
      </Section>

      <Section title={isSecondary ? "Giá vốn (BRE trả NVKD)" : "Giá vốn (BRE trả nội bộ)"}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {!isSecondary && (
            <Field label="%PMG_LK_sale (base tính HH sale)">
              <input
                name="pmgSaleRate"
                type="text"
                inputMode="decimal"
                defaultValue={pctDisplay(product?.pmgSaleRate)}
                className="input"
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/,/g, "."));
                  setPmgSaleRateLive(isNaN(n) ? 0 : n / 100);
                }}
              />
            </Field>
          )}
          <Field label="%HH sale (NVKD)">
            <input
              name="saleCommissionRate"
              type="text"
              inputMode="decimal"
              defaultValue={pctDisplay(product?.saleCommissionRate)}
              className="input"
              onChange={(e) => {
                const n = Number(e.target.value.replace(/,/g, "."));
                setSaleCommRateLive(isNaN(n) ? 0 : n / 100);
              }}
            />
          </Field>
          {!isSecondary && (
            <>
              <Field label="%KPI TPKD (Trưởng phòng)">
                <input
                  name="kpiTpkdRate"
                  type="text"
                  inputMode="decimal"
                  defaultValue={pctDisplay(product?.kpiTpkdRate)}
                  className="input"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/,/g, "."));
                    setKpiTpkdRateLive(isNaN(n) ? 0 : n / 100);
                  }}
                />
              </Field>
              <Field label="%KPI CEO">
                <input
                  name="kpiCeoRate"
                  type="text"
                  inputMode="decimal"
                  defaultValue={pctDisplay(product?.kpiCeoRate)}
                  className="input"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/,/g, "."));
                    setKpiCeoRateLive(isNaN(n) ? 0 : n / 100);
                  }}
                />
              </Field>
              <Field label="%KPI Admin">
                <input
                  name="kpiAdminRate"
                  type="text"
                  inputMode="decimal"
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
          <Field label="CTY thưởng QL">
            <MoneyInput
              name="bonusManager"
              defaultValue={product?.bonusManager ?? 0}
              className="input"
              onValueChange={setBonusMgrCtyLive}
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
          {/* Preserve giá trị legacy — không hard-zero */}
          <input type="hidden" name="bonusSale" value={String(bonusSaleStored)} />
          <input type="hidden" name="otherCost" value={String(otherCostStored)} />
        </div>

        {/* Tổng giá vốn — read-only, live compute */}
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="rounded-lg border-2 border-orange-200 bg-orange-50/60 p-4">
            <div className="flex justify-between items-center">
              <div className="text-sm font-semibold text-orange-900 flex items-center gap-1.5">
                Tổng giá vốn
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-300 text-white text-[10px] cursor-help select-none"
                  title={`Tự động tính theo Excel col R:\nbaseNet = (PMG × %PMG_LK_sale − admin sale) / 1,1 − hỗ trợ khách\n\n= HH sale (baseNet × %HH + CĐT thưởng/1,1 + CTY thưởng NVKD)\n+ KPI CEO/TPKD/Admin (baseNet × %KPI)\n+ CTY thưởng QL\n+ CP giá vốn khác`}
                >
                  ?
                </span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-orange-900">
                {fmtMoney(totalCostLive)}
              </div>
            </div>
          </div>
          <input type="hidden" name="totalCost" value={String(Math.round(totalCostLive))} />
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

      {isEdit && !isSecondary && lockCoreFields && (
        <Section title="⚙️ Điều chỉnh thông tin căn">
          <div className="text-xs text-slate-500 -mt-2">
            Khi CĐT tăng %HH, sửa giá, hoặc đổi phí admin — dùng nút bên dưới. Điều
            chỉnh được lưu cùng lúc với nút Lưu ở cuối form.
          </div>
          {/* Serialize pending vào FormData → server apply khi Lưu */}
          <input
            type="hidden"
            name="__pendingAdjustments"
            value={JSON.stringify(pendingAdjustments)}
          />
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left p-2 whitespace-nowrap">Ngày</th>
                  <th className="text-left p-2">Trường thay đổi</th>
                  <th className="text-left p-2">Ghi chú</th>
                  <th className="text-right p-2 whitespace-nowrap">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {existingAdjustments.map((a) => {
                  const changes: string[] = [];
                  if (a.pmgBasePrice != null)
                    changes.push(`Giá PMG = ${fmtMoney(a.pmgBasePrice)}`);
                  if (a.pmgRate != null)
                    changes.push(`%PMG_LK = ${fmtPctTight(a.pmgRate)}`);
                  if (a.adminFee != null)
                    changes.push(`Phí admin = ${fmtMoney(a.adminFee)}`);
                  return (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="p-2 whitespace-nowrap font-medium">
                        {fmtDate(a.effectiveDate)}
                      </td>
                      <td className="p-2 text-slate-700">
                        {changes.length > 0 ? changes.join(" · ") : "—"}
                      </td>
                      <td className="p-2 text-slate-500">{a.note ?? "—"}</td>
                      <td className="p-2 text-right text-xs text-slate-400">Đã lưu</td>
                    </tr>
                  );
                })}
                {pendingAdjustments.map((a, i) => {
                  const changes: string[] = [];
                  if (a.fields.pmgBasePrice != null)
                    changes.push(`Giá PMG = ${fmtMoney(a.fields.pmgBasePrice)}`);
                  if (a.fields.pmgRate != null)
                    changes.push(`%PMG_LK = ${fmtPctTight(a.fields.pmgRate)}`);
                  if (a.fields.adminFee != null)
                    changes.push(`Phí admin = ${fmtMoney(a.fields.adminFee)}`);
                  return (
                    <tr key={`pending-${i}`} className="border-t border-slate-100 bg-amber-50">
                      <td className="p-2 whitespace-nowrap font-medium">
                        {fmtDate(a.effectiveDate)}
                      </td>
                      <td className="p-2 text-slate-700">
                        {changes.join(" · ")}
                      </td>
                      <td className="p-2 text-slate-500">{a.note ?? "—"}</td>
                      <td className="p-2 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs text-amber-700 font-medium">
                            Chờ lưu
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingAdjustments((prev) =>
                                prev.filter((_, j) => j !== i),
                              )
                            }
                            className="text-xs text-red-600 hover:underline"
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {existingAdjustments.length === 0 && pendingAdjustments.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-4 text-center text-slate-400 italic text-xs"
                    >
                      Chưa có điều chỉnh nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-start">
            <AdjustmentDialog
              product={{
                id: product?.id ?? 0,
                pmgBasePrice: pmgBase,
                pmgRate: pmgRateLive,
                adminFee: adminFeeLive,
              }}
              action={async (fd) => {
                // Fake action: chỉ append vào state, KHÔNG gọi server.
                const effectiveDate = String(fd.get("effectiveDate") ?? "");
                const note = String(fd.get("note") ?? "").trim() || null;
                const fields: Record<string, number> = {};
                const isChanged = (f: string) => fd.get(`change_${f}`) === "on";
                const invalid: string[] = [];
                // Strip mọi ký tự lạ (%, đơn vị, khoảng trắng, dấu chấm/phẩy
                // ngàn) → chỉ giữ số + dấu thập phân. Detect NaN → user gõ
                // rác (VD "abc") → alert.
                const parseMoney = (v: FormDataEntryValue | null, label: string) => {
                  const s = String(v ?? "").trim().replace(/[.,\s]/g, "");
                  if (!s) { invalid.push(`${label} rỗng`); return NaN; }
                  const n = Number(s);
                  if (isNaN(n)) invalid.push(`${label}: "${v}" không phải số`);
                  return n;
                };
                const parsePct = (v: FormDataEntryValue | null, label: string) => {
                  // Cho phép "7", "7.5", "7,5", "7%", "7,5 %" — strip %, whitespace
                  const s = String(v ?? "").trim().replace(/[%\s]/g, "").replace(/,/g, ".");
                  if (!s) { invalid.push(`${label} rỗng`); return NaN; }
                  const n = Number(s);
                  if (isNaN(n)) {
                    invalid.push(`${label}: "${v}" không phải số`);
                    return NaN;
                  }
                  return n / 100;
                };
                if (isChanged("pmgBasePrice")) {
                  const v = parseMoney(fd.get("pmgBasePrice"), "Giá tính PMG");
                  if (!isNaN(v)) fields.pmgBasePrice = v;
                }
                if (isChanged("pmgRate")) {
                  const v = parsePct(fd.get("pmgRate"), "%PMG_LK");
                  if (!isNaN(v)) fields.pmgRate = v;
                }
                if (isChanged("adminFee")) {
                  const v = parseMoney(fd.get("adminFee"), "Phí admin");
                  if (!isNaN(v)) fields.adminFee = v;
                }
                if (invalid.length > 0) {
                  toast.error("Nhập giá trị chưa hợp lệ", {
                    description: invalid.join("; "),
                  });
                  throw new Error(invalid.join("; "));
                }
                if (Object.keys(fields).length === 0) return;
                setPendingAdjustments((prev) => [
                  ...prev,
                  { effectiveDate, note, fields },
                ]);
              }}
            />
          </div>
        </Section>
      )}

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
                    toast.error(e instanceof Error ? e.message : "Không xóa được");
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
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50"
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
    <div className={full ? "col-span-full" : ""}>
      <label className="block text-xs text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// Button scroll xuống block "Điều chỉnh thông tin căn" khi field bị khóa
function LockedFieldHint() {
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.getElementById("adjustments-block");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className="mt-1 text-[10px] text-blue-600 hover:underline"
    >
      🔒 Click để đi đến &quot;Điều chỉnh thông tin căn&quot; ↓
    </button>
  );
}

