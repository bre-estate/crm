"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, Project, Partner, Department, ProductAdjustment } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import PercentInput from "@/components/PercentInput";
import SearchableSelect from "@/components/SearchableSelect";
import { fmtMoney, fmtDate, fmtPctTight, toTitleCase } from "@/lib/format";
import AdjustmentDialog from "./[id]/AdjustmentDialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

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
  // Nếu true → khóa base config (giá, %PMG_LK, phí admin, phí admin sale,
  // %PMG_LK_sale) — dùng "Điều chỉnh thông tin căn" thay. Trigger khi căn
  // đã có ≥1 recon rev/cost core (non-bonus).
  lockCoreFields?: boolean;
  // Option B2: per-field lock. Rate riêng lock nếu có recon LOẠI tương ứng.
  // Common lock = base config (giá, %PMG_LK, phí admin, adminFeeSale).
  locks?: {
    common: boolean;
    saleCommission: boolean;
    kpiCeo: boolean;
    kpiTpkd: boolean;
    kpiAdmin: boolean;
  };
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

// Diễn giải các field thay đổi trong 1 adjustment (bảng "Điều chỉnh thông tin căn").
// Match tất cả field mà AdjustmentDialog cho phép chọn.
type AdjustmentFields = {
  pmgBasePrice?: number | null;
  pmgRate?: number | null;
  pmgSaleRate?: number | null;
  adminFee?: number | null;
  adminFeeSale?: number | null;
  saleCommissionRate?: number | null;
  kpiCeoRate?: number | null;
  kpiTpkdRate?: number | null;
  kpiAdminRate?: number | null;
  cdtBonusSale?: number | null;
  cdtBonusManager?: number | null;
  bonusSale?: number | null;
  bonusManager?: number | null;
  customerSupport?: number | null;
};
function describeAdjustmentChanges(a: AdjustmentFields | Record<string, number>): string[] {
  const asAny = a as Record<string, unknown>;
  const val = (k: string): number | null => {
    const v = asAny[k];
    return v == null || v === undefined ? null : Number(v);
  };
  const pushIf = (out: string[], k: string, label: string, fmt: (n: number) => string) => {
    const v = val(k);
    if (v == null) return;
    out.push(`${label} = ${fmt(v)}`);
  };
  const out: string[] = [];
  pushIf(out, "pmgBasePrice", "Giá PMG", fmtMoney);
  pushIf(out, "pmgRate", "%PMG_LK", fmtPctTight);
  pushIf(out, "pmgSaleRate", "%PMG sale", fmtPctTight);
  pushIf(out, "adminFee", "Phí admin", fmtMoney);
  pushIf(out, "adminFeeSale", "Phí admin sale", fmtMoney);
  pushIf(out, "saleCommissionRate", "%HH sale", fmtPctTight);
  pushIf(out, "kpiCeoRate", "%KPI CEO", fmtPctTight);
  pushIf(out, "kpiTpkdRate", "%KPI TPKD", fmtPctTight);
  pushIf(out, "kpiAdminRate", "%KPI Admin", fmtPctTight);
  pushIf(out, "cdtBonusSale", "CĐT thưởng NVKD", fmtMoney);
  pushIf(out, "cdtBonusManager", "CĐT thưởng TPKD", fmtMoney);
  pushIf(out, "bonusSale", "CTY thưởng NVKD", fmtMoney);
  pushIf(out, "bonusManager", "CTY thưởng TPKD", fmtMoney);
  pushIf(out, "customerSupport", "Hỗ trợ khách", fmtMoney);
  return out;
}

export default function ProductForm({
  product,
  projects,
  departments = [],
  employees = [],
  onSave,
  onDelete,
  returnTo,
  lockCoreFields = false,
  locks,
  reconCdtBonusSaleSum = 0,
  reconCdtBonusMgrSum = 0,
  existingAdjustments = [],
}: Props) {
  // Fallback nếu chưa pass locks (giữ compat call-site cũ)
  const effLocks = locks ?? {
    common: lockCoreFields,
    saleCommission: lockCoreFields,
    kpiCeo: lockCoreFields,
    kpiTpkd: lockCoreFields,
    kpiAdmin: lockCoreFields,
  };
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

  // Combined type value — track để hide checkbox +PN phụ khi chọn Duplex/Penthouse/TMDV/Shophouse
  const [unitTypeCombined, setUnitTypeCombined] = useState<string>(() => {
    if (product?.unitType === "penthouse") return "penthouse";
    if (product?.unitType === "duplex") return "duplex";
    if (product?.unitType === "shophouse") return "shophouse";
    if (product?.unitType === "commercial") return "commercial";
    return product?.bedrooms == null ? "" : String(product.bedrooms);
  });
  const hasBonusRoomApplicable = /^[0-4]$/.test(unitTypeCombined);

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

  // Khi tạo căn MỚI và đổi dự án → pre-fill lại phí admin/admin sale từ dự án
  useEffect(() => {
    if (!isNewProduct || !selectedProject) return;
    setAdminFeeLive(Number(selectedProject.adminFee ?? 0));
    setAdminFeeSaleLive(Number(selectedProject.adminFeeSale ?? 0));
  }, [projectId]);

  // Selected project (for pre-filling admin fees when creating new căn)
  const selectedProject = projects.find((p) => String(p.id) === projectId);
  const isNewProduct = !product;

  // === Live compute state (Section Doanh thu) ===
  const [pmgBase, setPmgBase] = useState<number>(Number(product?.pmgBasePrice ?? 0));
  const [pmgRateLive, setPmgRateLive] = useState<number>(Number(product?.pmgRate ?? 0));
  const [adminFeeLive, setAdminFeeLive] = useState<number>(
    Number(product?.adminFee ?? (isNewProduct ? selectedProject?.adminFee ?? 0 : 0))
  );
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
    Number(product?.adminFeeSale ?? (isNewProduct ? selectedProject?.adminFeeSale ?? 0 : 0)),
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
      className="space-y-6 bg-card rounded-xl ring-1 ring-foreground/10 p-6"
    >
      {/* ===== Top action bar (chỉ hiện khi edit) ===== */}
      {isEdit && (
        <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-2 px-6 py-3 bg-white border-b border-slate-200 flex items-center gap-3">
          <div className="text-lg font-bold flex-1">Sửa giao dịch</div>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={pending}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            disabled={pending}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                value={unitTypeCombined}
                onChange={(e) => setUnitTypeCombined(e.target.value)}
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
              {hasBonusRoomApplicable && (
                <label className="flex items-center gap-1 text-xs whitespace-nowrap" title="Có phòng phụ đa năng (VD 1PN+, 2PN+). Chỉ áp dụng cho căn hộ 1-4 PN.">
                  <input
                    type="checkbox"
                    name="hasBonusRoom"
                    defaultChecked={product?.hasBonusRoom ?? false}
                  />
                  <span>+PN phụ</span>
                </label>
              )}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Doanh thu về cty">
                <MoneyInput
                  name="totalRevenue"
                  defaultValue={product?.totalRevenue ?? 0}
                  className="input"
                />
              </Field>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Giao dịch thứ cấp = mua bán lại, không có %PMG_LK từ chủ đầu tư. Nhập số công ty thực nhận.
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <PercentInput
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
                  key={`adminFee-${projectId}`}
                  name="adminFee"
                  defaultValue={product?.adminFee ?? (isNewProduct ? selectedProject?.adminFee ?? 0 : 0)}
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
                key={`adminFeeSale-${projectId}`}
                name="adminFeeSale"
                defaultValue={product?.adminFeeSale ?? (isNewProduct ? selectedProject?.adminFeeSale ?? 0 : 0)}
                className="input"
                onValueChange={setAdminFeeSaleLive}
              />
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
            <div className="text-xs text-slate-500 uppercase font-semibold mb-2 flex items-center gap-1.5">
              <span>Tổng doanh thu</span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-300 text-white text-[9px] cursor-help select-none normal-case">
                      ?
                    </span>
                  }
                />
                <TooltipContent className="max-w-xs">
                  Tự động cập nhật khi chỉnh các thông số liên quan (ví dụ %PMG, phí admin).
                </TooltipContent>
              </Tooltip>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {!isSecondary && (
            <Field label="%PMG_LK_sale (base tính HH sale)">
              <PercentInput
                name="pmgSaleRate"
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
            <PercentInput
              name={effLocks.saleCommission ? "_locked_saleCommissionRate" : "saleCommissionRate"}
              defaultValue={pctDisplay(product?.saleCommissionRate)}
              disabled={effLocks.saleCommission}
              className={`input ${effLocks.saleCommission ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/,/g, "."));
                setSaleCommRateLive(isNaN(n) ? 0 : n / 100);
              }}
            />
            {effLocks.saleCommission && (
              <input type="hidden" name="saleCommissionRate" value={pctDisplay(product?.saleCommissionRate)} />
            )}
            {effLocks.saleCommission && <LockedFieldHint />}
          </Field>
          {!isSecondary && (
            <>
              <Field label="%KPI TPKD">
                <PercentInput
                  name={effLocks.kpiTpkd ? "_locked_kpiTpkdRate" : "kpiTpkdRate"}
                  defaultValue={pctDisplay(product?.kpiTpkdRate)}
                  disabled={effLocks.kpiTpkd}
                  className={`input ${effLocks.kpiTpkd ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/,/g, "."));
                    setKpiTpkdRateLive(isNaN(n) ? 0 : n / 100);
                  }}
                />
                {effLocks.kpiTpkd && (
                  <input type="hidden" name="kpiTpkdRate" value={pctDisplay(product?.kpiTpkdRate)} />
                )}
                {effLocks.kpiTpkd && <LockedFieldHint />}
              </Field>
              <Field label="%KPI CEO">
                <PercentInput
                  name={effLocks.kpiCeo ? "_locked_kpiCeoRate" : "kpiCeoRate"}
                  defaultValue={pctDisplay(product?.kpiCeoRate)}
                  disabled={effLocks.kpiCeo}
                  className={`input ${effLocks.kpiCeo ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/,/g, "."));
                    setKpiCeoRateLive(isNaN(n) ? 0 : n / 100);
                  }}
                />
                {effLocks.kpiCeo && (
                  <input type="hidden" name="kpiCeoRate" value={pctDisplay(product?.kpiCeoRate)} />
                )}
                {effLocks.kpiCeo && <LockedFieldHint />}
              </Field>
              <Field label="%KPI Admin">
                <PercentInput
                  name={effLocks.kpiAdmin ? "_locked_kpiAdminRate" : "kpiAdminRate"}
                  defaultValue={pctDisplay(product?.kpiAdminRate)}
                  disabled={effLocks.kpiAdmin}
                  className={`input ${effLocks.kpiAdmin ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/,/g, "."));
                    setKpiAdminRateLive(isNaN(n) ? 0 : n / 100);
                  }}
                />
                {effLocks.kpiAdmin && (
                  <input type="hidden" name="kpiAdminRate" value={pctDisplay(product?.kpiAdminRate)} />
                )}
                {effLocks.kpiAdmin && <LockedFieldHint />}
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
        <div id="adjustments-block" className="scroll-mt-20">
        <Section title="⚙️ Điều chỉnh thông tin căn">
          <div className="text-xs text-slate-500 -mt-2">
            Căn đã có đối chiếu → các mức phí (giá, %PMG_LK, phí admin, %HH sale,
            %KPI) khoá ở form trên. Muốn đổi phải thêm điều chỉnh bên dưới kèm
            <b> ngày hiệu lực</b> để giữ lịch sử. Nhấn Lưu ở cuối form để áp dụng.
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
                  const changes = describeAdjustmentChanges(a);
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
                  const changes = describeAdjustmentChanges(a.fields);
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
                saleCommissionRate: saleCommRateLive,
                kpiCeoRate: kpiCeoRateLive,
                kpiTpkdRate: kpiTpkdRateLive,
                kpiAdminRate: kpiAdminRateLive,
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
                if (isChanged("saleCommissionRate")) {
                  const v = parsePct(fd.get("saleCommissionRate"), "%HH sale");
                  if (!isNaN(v)) fields.saleCommissionRate = v;
                }
                if (isChanged("kpiTpkdRate")) {
                  const v = parsePct(fd.get("kpiTpkdRate"), "%KPI TPKD");
                  if (!isNaN(v)) fields.kpiTpkdRate = v;
                }
                if (isChanged("kpiCeoRate")) {
                  const v = parsePct(fd.get("kpiCeoRate"), "%KPI CEO");
                  if (!isNaN(v)) fields.kpiCeoRate = v;
                }
                if (isChanged("kpiAdminRate")) {
                  const v = parsePct(fd.get("kpiAdminRate"), "%KPI Admin");
                  if (!isNaN(v)) fields.kpiAdminRate = v;
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
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        {onDelete && (
          <Button
            type="button"
            variant="destructive"
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
            disabled={pending}
          >
            Xóa
          </Button>
        )}
        <div className="flex-1" />
        {returnTo && <input type="hidden" name="__returnTo" value={returnTo} />}
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={pending}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {pending ? "Đang lưu..." : "Lưu"}
        </Button>
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

