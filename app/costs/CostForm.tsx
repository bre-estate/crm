"use client";

import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { CostReconciliation } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import SearchableSelect from "@/components/SearchableSelect";
import { costTypeLabel, fmtMoney, fmtPct, fmtPctTight, fmtPctRaw } from "@/lib/format";
import { computeLuyKe, type ProductConfig, type CostType } from "@/lib/costCalc";

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
  progressN?: number | string | null;
};

// Recon light-weight cho client-side filter (từ /costs/new pre-load all).
export type AllReconRow = {
  id: number;
  productId: number;
  costType: string;
  date: string | null;
  amount: number | string | null;
  progressN: number | string | null;
  employeeName: string;
  note: string | null;
};

type Props = {
  recon?: CostReconciliation;
  paymentInit?: { paymentDate: string | null; amount: number } | null;
  products: ProductOption[];
  defaultProductId?: number;
  previousRecons?: PreviousRecon[];
  allRecons?: AllReconRow[]; // Nếu có, dùng để tự filter previous theo productId+costType (client-side)
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
  previousRecons: previousReconsProp = [],
  allRecons,
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

  // previousRecons: nếu edit → dùng prop từ server. Nếu new (có allRecons) → filter client-side.
  const previousRecons = useMemo<PreviousRecon[]>(() => {
    if (previousReconsProp.length > 0) return previousReconsProp;
    if (!allRecons || !productId) return [];
    return allRecons
      .filter((r) => r.productId === productId && r.costType === costType)
      .map((r) => ({ id: r.id, date: r.date, amount: r.amount, note: r.note, progressN: r.progressN }));
  }, [previousReconsProp, allRecons, productId, costType]);

  // Max N (Tiến độ) của các đợt trước → N đợt này phải ≥ giá trị này (không lùi tiến độ)
  const maxPrevN = useMemo(() => {
    return previousRecons.reduce((mx, r) => Math.max(mx, Number(r.progressN ?? 0)), 0);
  }, [previousRecons]);

  // Lọc COST_TYPES: chỉ hiện loại có config > 0 trên căn (giữ costType hiện tại
  // của recon nếu đang edit, tránh trường hợp config vừa đổi làm mất option).
  const availableCostTypes = useMemo(() => {
    if (!product) return [...COST_TYPES];
    const hasValue = (t: (typeof COST_TYPES)[number]): boolean => {
      switch (t) {
        case "sale_commission":
          return Number(product.saleCommissionRate ?? 0) > 0;
        case "customer_support":
          return Number(product.customerSupport ?? 0) > 0;
        case "bonus_sale":
          return Number(product.bonusSale ?? 0) > 0;
        case "bonus_manager":
          return Number(product.bonusManager ?? 0) > 0;
        case "cdt_bonus_sale":
          return Number(product.cdtBonusSale ?? 0) > 0;
        case "cdt_bonus_manager":
          return Number(product.cdtBonusManager ?? 0) > 0;
        case "kpi_ceo":
          return Number(product.kpiCeoRate ?? 0) > 0;
        case "kpi_tpkd":
          return Number(product.kpiTpkdRate ?? 0) > 0;
        case "kpi_admin":
          return Number(product.kpiAdminRate ?? 0) > 0;
      }
    };
    return COST_TYPES.filter((t) => hasValue(t) || t === costType);
  }, [product, costType]);

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
  // PMG Sale = Giá tính PMG × %PMG_LK_sale (Excel col 11 × col 12)
  const PMG_Sale = useMemo(() => {
    const base = Number(product?.pmgBasePrice ?? 0);
    const rate = Number(product?.pmgSaleRate ?? 0) || Number(product?.pmgRate ?? 0);
    return base * rate;
  }, [product]);
  // Target ĐỦ (khi khách trả 100%) theo công thức Excel:
  //   ((L × M − Q) / 1.1 − R) × %  (HH sale, KPI CEO/TPKD, KPI Admin)
  //   Config flat cho bonus/support (cdt_bonus_*, bonus_*, customer_support)
  const targetForType = useMemo(() => {
    if (!product) return 0;
    const cfg: ProductConfig = {
      pmgBasePrice: Number(product.pmgBasePrice ?? 0),
      pmgSaleRate: Number(product.pmgSaleRate ?? 0) || Number(product.pmgRate ?? 0),
      adminFeeSale: Number(product.adminFeeSale ?? 0),
      customerSupport: Number(product.customerSupport ?? 0),
      saleCommissionRate: Number(product.saleCommissionRate ?? 0),
      kpiCeoRate: Number(product.kpiCeoRate ?? 0),
      kpiTpkdRate: Number(product.kpiTpkdRate ?? 0),
      kpiAdminRate: Number(product.kpiAdminRate ?? 0),
      bonusSale: Number(product.bonusSale ?? 0),
      bonusManager: Number(product.bonusManager ?? 0),
      cdtBonusSale: Number(product.cdtBonusSale ?? 0),
      cdtBonusManager: Number(product.cdtBonusManager ?? 0),
    };
    // N=1 → target ĐỦ
    return computeLuyKe(cfg, costType as CostType, 1);
  }, [costType, product]);

  // Tổng đã ĐC các đợt trước (cùng cost_type, cùng employee, cùng căn)
  const paidBefore = useMemo(
    () => previousRecons.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [previousRecons],
  );

  // N = Tiến độ PMG đã thu tiền đến ngày ĐC (%). Excel col 13.
  // Khách đã trả CĐT bao nhiêu % — dùng công thức Excel:
  //   Lũy kế mới = ((L × M × N − Q) / 1,1 − R) × %
  // Amount đợt này = Lũy kế mới − Đã ĐC trước.
  const [progressN, setProgressN] = useState<string>(
    recon?.paymentProgressPct
      ? (Number(recon.paymentProgressPct) * 100).toString().replace(".", ",")
      : "",
  );
  const progressNNum = progressN ? Number(progressN.replace(/,/g, ".")) / 100 : 0;

  // Lũy kế mới theo N nhập (dùng công thức Excel)
  const luyKeAtN = useMemo(() => {
    if (!product || !progressN) return 0;
    const cfg: ProductConfig = {
      pmgBasePrice: Number(product.pmgBasePrice ?? 0),
      pmgSaleRate: Number(product.pmgSaleRate ?? 0) || Number(product.pmgRate ?? 0),
      adminFeeSale: Number(product.adminFeeSale ?? 0),
      customerSupport: Number(product.customerSupport ?? 0),
      saleCommissionRate: Number(product.saleCommissionRate ?? 0),
      kpiCeoRate: Number(product.kpiCeoRate ?? 0),
      kpiTpkdRate: Number(product.kpiTpkdRate ?? 0),
      kpiAdminRate: Number(product.kpiAdminRate ?? 0),
      bonusSale: Number(product.bonusSale ?? 0),
      bonusManager: Number(product.bonusManager ?? 0),
      cdtBonusSale: Number(product.cdtBonusSale ?? 0),
      cdtBonusManager: Number(product.cdtBonusManager ?? 0),
    };
    return computeLuyKe(cfg, costType as CostType, progressNNum);
  }, [product, progressN, progressNNum, costType]);

  const thisAmountFromN = Math.max(0, luyKeAtN - paidBefore);
  const paidBeforePct = targetForType > 0 ? (paidBefore / targetForType) * 100 : 0;
  const remainingBefore = Math.max(0, targetForType - paidBefore);
  const remainingAfter = Math.max(0, targetForType - paidBefore - thisAmountFromN);

  // Legacy for backward compat with existing JSX
  const thisPct = progressN;
  const setThisPct = setProgressN;
  const thisPctNum = progressNNum;
  const thisAmountFromPct = thisAmountFromN;

  // Auto-sync totalAmt = thisAmountFromN mỗi khi N/product/costType đổi.
  // Trên EDIT: khởi tạo manuallyOverriddenRef = true (giữ giá trị recon cũ, không ghi đè
  //   bằng recompute — vì config M có thể đã đổi từ lúc recon được tạo).
  //   Chỉ khi user chủ động sửa N → mới cho phép sync lại từ formula.
  const manuallyOverriddenRef = useRef(isEdit);
  useEffect(() => {
    if (manuallyOverriddenRef.current) return;
    if (thisAmountFromN > 0) setTotalAmt(thisAmountFromN);
    else if (progressN === "") setTotalAmt(0);
  }, [thisAmountFromN, progressN]);

  // Validate N không được lùi so với đợt trước
  const isNRegression = progressN !== "" && progressNNum < maxPrevN;

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
      // HH sale: pmgThisTime × commissionRate (nếu có), fallback PMG_Sale × commissionRate
      const base = pmgThis > 0 ? pmgThis : PMG_Sale;
      return base * commissionRateNum;
    }
    if (showKpi) {
      // KPI: PMG_Sale × kpiRate
      return PMG_Sale * kpiRateNum;
    }
    if (costType === "bonus_sale") return Number(product?.bonusSale ?? 0);
    if (costType === "bonus_manager") return Number(product?.bonusManager ?? 0);
    if (costType === "customer_support") return Number(product?.customerSupport ?? 0);
    return 0;
  }, [showCommission, showKpi, costType, pmgThis, PMG_Sale, commissionRateNum, kpiRateNum, product]);

  const applyValue = (v: number) => setTotalAmt(Math.round(v));

  // Chặn save khi tổng ĐC vượt mức tối đa
  const isOverLimit =
    targetForType > 0 && paidBefore + totalAmt > targetForType + 1000;

  return (
    <form
      action={(fd) =>
        start(async () => {
          if (isOverLimit) {
            alert(
              `Không cho lưu — tổng đã ĐC (${(paidBefore + totalAmt).toLocaleString("vi-VN")}) vượt mức tối đa (${targetForType.toLocaleString("vi-VN")}).\n\nVui lòng giảm số tiền hoặc sửa mức tối đa ở /products/{id}/edit.`,
            );
            return;
          }
          if (isNRegression) {
            alert(
              `Không cho lưu — Tiến độ N nhập ${(progressNNum * 100).toFixed(0)}% nhỏ hơn N của đợt trước ${(maxPrevN * 100).toFixed(0)}%. Không thể lùi tiến độ.`,
            );
            return;
          }
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
          </Field>
          <Field label="Loại chi phí" required>
            <select
              name="costType"
              value={costType}
              onChange={(e) => setCostType(e.target.value as (typeof COST_TYPES)[number])}
              className="input"
              required
            >
              {availableCostTypes.map((t) => (
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
          {/* fiscalYear ẩn — bỏ khỏi UI theo yêu cầu */}
          <input
            type="hidden"
            name="fiscalYear"
            value={recon?.fiscalYear ?? new Date().getFullYear()}
          />
        </div>

        {/* Info căn dạng disabled inputs */}
        {product && (() => {
          const rateForType: { label: string; value: string } | null = (() => {
            const pct = (r: number | null | undefined) => fmtPctTight(r);
            switch (costType) {
              case "sale_commission":
                return { label: "%HH sale (chốt)", value: pct(product.saleCommissionRate) };
              case "kpi_ceo":
                return { label: "%KPI CEO", value: pct(product.kpiCeoRate) };
              case "kpi_tpkd":
                return { label: "%KPI TPKD", value: pct(product.kpiTpkdRate) };
              case "kpi_admin":
                return { label: "%KPI Admin", value: pct(product.kpiAdminRate) };
              case "customer_support":
                return {
                  label: "Hỗ trợ khách (chốt)",
                  value: fmtMoney(product.customerSupport),
                };
              case "bonus_manager":
                return { label: "CTY thưởng QL", value: fmtMoney(product.bonusManager) };
              case "bonus_sale":
                return { label: "CTY thưởng NVKD", value: fmtMoney(product.bonusSale) };
              case "cdt_bonus_sale":
                return { label: "CĐT thưởng sale", value: fmtMoney(product.cdtBonusSale) };
              case "cdt_bonus_manager":
                return { label: "CĐT thưởng QL", value: fmtMoney(product.cdtBonusManager) };
              default:
                return null;
            }
          })();
          // M (%PMG_LK_sale): so sánh giá trị recon-time (đã lưu) vs config hiện tại
          const mAtRecon = Number(recon?.pmgLkSaleRate ?? 0);
          const mCurrent = Number(product.pmgSaleRate ?? 0);
          const mChanged = isEdit && mAtRecon > 0 && Math.abs(mAtRecon - mCurrent) > 0.0001;
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-3 border-t border-slate-100">
              <Field label="Giá tính PMG (từ căn)">
                <input
                  type="text"
                  value={fmtMoney(product.pmgBasePrice)}
                  readOnly
                  className="input bg-slate-100 text-slate-500 cursor-not-allowed tabular-nums"
                />
              </Field>
              <Field label="%PMG_LK_sale (M)">
                <input
                  type="text"
                  value={
                    mChanged
                      ? `${fmtPctTight(mAtRecon)} → ${fmtPctTight(mCurrent)}`
                      : fmtPctTight(mCurrent)
                  }
                  readOnly
                  className={`input tabular-nums cursor-not-allowed ${
                    mChanged ? "bg-amber-50 text-amber-800 border-amber-300" : "bg-slate-100 text-slate-500"
                  }`}
                  title={
                    mChanged
                      ? `Đợt cũ ${fmtPctTight(mAtRecon)}, config hiện tại ${fmtPctTight(mCurrent)} (có điều chỉnh)`
                      : undefined
                  }
                />
                {mChanged && (
                  <div className="text-[10px] text-amber-700 mt-0.5">
                    ⚠️ M đã điều chỉnh từ {fmtPctTight(mAtRecon)} sang {fmtPctTight(mCurrent)}
                  </div>
                )}
              </Field>
              {rateForType && (
                <Field label={rateForType.label}>
                  <input
                    type="text"
                    value={rateForType.value}
                    readOnly
                    className="input bg-slate-100 text-slate-500 cursor-not-allowed tabular-nums"
                  />
                </Field>
              )}
              <Field label="NVKD">
                <input
                  type="text"
                  value={product.salesPerson ?? "—"}
                  readOnly
                  className="input bg-slate-100 text-slate-500 cursor-not-allowed"
                />
              </Field>
            </div>
          );
        })()}
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
          {(() => {
            const rate =
              costType === "sale_commission"
                ? Number(product?.saleCommissionRate ?? 0)
                : costType === "kpi_ceo"
                  ? Number(product?.kpiCeoRate ?? 0)
                  : costType === "kpi_tpkd"
                    ? Number(product?.kpiTpkdRate ?? 0)
                    : costType === "kpi_admin"
                      ? Number(product?.kpiAdminRate ?? 0)
                      : 0;
            const rateBased =
              costType === "sale_commission" || costType.startsWith("kpi_");
            const rateName =
              costType === "sale_commission"
                ? "%HH sale"
                : costType === "kpi_ceo"
                  ? "%KPI CEO"
                  : costType === "kpi_tpkd"
                    ? "%KPI TPKD"
                    : costType === "kpi_admin"
                      ? "%KPI Admin"
                      : "";
            return (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  Mức chi tối đa
                  <span
                    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-300 text-white text-[9px] cursor-help select-none"
                    title={
                      rateBased
                        ? `PMG Sale = Giá tính PMG × %PMG_LK_sale = ${fmtMoney(Number(product?.pmgBasePrice ?? 0))} × ${fmtPct(Number(product?.pmgSaleRate ?? 0), 2)} = ${fmtMoney(PMG_Sale)}. Target ĐỦ (khi khách trả 100%) = ((PMG Sale − admin_sale)/1,1 − hỗ trợ khách) × %`
                        : "Số flat lấy trực tiếp từ config căn"
                    }
                  >
                    ?
                  </span>
                </div>
                <div className="text-sm font-semibold tabular-nums mt-1">
                  {fmtMoney(targetForType)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                  {rateBased
                    ? `((PMG Sale − admin) / 1,1 − R) × ${rateName} = ${fmtMoney(targetForType)}`
                    : "Số flat từ căn"}
                </div>
              </div>
            );
          })()}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Đã ĐC trước ({previousRecons.length} đợt)</div>
            <div className="text-sm font-semibold tabular-nums mt-1 text-green-700">
              {fmtMoney(paidBefore)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {fmtPctRaw(paidBeforePct, 1)} mức tối đa
            </div>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
            <div className="text-xs text-blue-700">Đợt này (dự tính)</div>
            <div className="text-sm font-semibold tabular-nums mt-1 text-blue-900">
              {fmtMoney(thisAmountFromN)}
            </div>
            <div className="text-[10px] text-blue-500 mt-0.5">
              {progressN
                ? `Lũy kế mới ${fmtMoney(luyKeAtN)} − đã ĐC ${fmtMoney(paidBefore)}`
                : "chưa nhập N"}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Còn lại sau đợt này</div>
            <div
              className={`text-sm font-semibold tabular-nums mt-1 ${remainingAfter < 1000 ? "text-slate-400" : "text-red-600"}`}
            >
              {fmtMoney(remainingAfter)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {targetForType > 0
                ? fmtPctRaw((remainingAfter / targetForType) * 100, 1)
                : "—"}
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
          <Field label="Tiến độ PMG đã thu tiền (N)">
            <div className="relative">
              <input
                type="number"
                step="any"
                min={maxPrevN * 100}
                max={100}
                value={progressN}
                onChange={(e) => {
                  // User chủ động sửa N → cho phép auto-sync totalAmt lại
                  manuallyOverriddenRef.current = false;
                  setProgressN(e.target.value);
                }}
                placeholder={maxPrevN > 0 ? `≥ ${(maxPrevN * 100).toFixed(0)}%` : "vd: 90 = khách đã trả CĐT 90%"}
                className={`input pr-8 ${isNRegression ? "border-red-400 text-red-700" : ""}`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                %
              </span>
            </div>
            {isNRegression ? (
              <div className="text-[10px] text-red-600 mt-1 font-semibold">
                ⚠️ N phải ≥ {(maxPrevN * 100).toFixed(0)}% (tiến độ đợt trước). Không thể lùi tiến độ.
              </div>
            ) : (
              <div className="text-[10px] text-slate-500 mt-1">
                = Khách đã trả CĐT bao nhiêu %. Đợt này auto = ((PMG Sale × N − admin_sale)/1,1 − hỗ trợ khách) × % − đã ĐC
                {maxPrevN > 0 && (
                  <span className="block mt-0.5">Tối thiểu {(maxPrevN * 100).toFixed(0)}% (theo đợt trước)</span>
                )}
              </div>
            )}
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
        {/* N = Tiến độ PMG đã thu tiền, submit dạng decimal 0..1 */}
        <input type="hidden" name="paymentProgressPct" value={String(progressNNum)} />
      </Section>

      <Section title="💰 Tổng phải trả đợt này">
        {(() => {
          const overLimit =
            targetForType > 0 && paidBefore + totalAmt > targetForType + 1000; // threshold rounding
          const overBy = paidBefore + totalAmt - targetForType;
          return (
            <>
              <div
                className={`rounded-lg border-2 p-4 ${
                  overLimit
                    ? "border-red-300 bg-red-50/60"
                    : "border-orange-200 bg-orange-50/60"
                }`}
              >
                <div className="flex justify-between items-center gap-3">
                  <div className={`text-xs ${overLimit ? "text-red-700" : "text-orange-700"}`}>
                    Auto = Lũy kế mới (theo N nhập ở trên) − đã ĐC trước. Có thể ghi đè thủ công nếu cần.
                  </div>
                  <input
                    name="amountPayableThisTime"
                    type="text"
                    inputMode="numeric"
                    value={totalAmt ? totalAmt.toLocaleString("vi-VN") : ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      const newTotal = digits ? Number(digits) : 0;
                      manuallyOverriddenRef.current = true;
                      setTotalAmt(newTotal);
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    className={`input text-right text-xl font-bold tabular-nums min-w-40 ${overLimit ? "text-red-700 border-red-400" : "text-orange-900"}`}
                    placeholder="0"
                    required
                  />
                </div>
              </div>
              {overLimit && (
                <div className="mt-2 rounded-lg border border-red-300 bg-red-100 p-3 text-sm text-red-800">
                  ⚠️ <b>Vượt mức chi tối đa!</b>
                  <br />
                  Đã ĐC trước ({fmtMoney(paidBefore)}) + đợt này ({fmtMoney(totalAmt)}) ={" "}
                  {fmtMoney(paidBefore + totalAmt)} đồng
                  <br />
                  Vượt <b>{fmtMoney(overBy)}</b> so với mức tối đa {fmtMoney(targetForType)}.
                  <br />
                  <span className="text-xs">
                    Không cho lưu để tránh chi vượt. Nếu là điều chỉnh hồi tố hợp lệ, sửa mức
                    tối đa ở /products/{"{"}id{"}"}/edit.
                  </span>
                </div>
              )}
            </>
          );
        })()}
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
