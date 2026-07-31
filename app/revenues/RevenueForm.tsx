"use client";

import React, { useTransition, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { RevenueReconciliation } from "@/lib/schema";
import MoneyInput from "@/components/MoneyInput";
import SearchableSelect from "@/components/SearchableSelect";
import { fmtMoney, fmtPctTight } from "@/lib/format";
import { toast } from "sonner";

type InvoiceReconRef = {
  id: number;
  invoiceNumber: string;
  invoiceDate: string | null;
  totalReceivableThisTime: number;
};

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

type PrevRecon = {
  id: number;
  productId: number;
  pmgCumulativePct: number | null;
  phasePctThisTime: number | null;
  revenueThisTime: number | null;
  totalReceivableThisTime: number | null;
  cdtBonusSale: number | null;
  cdtBonusManager: number | null;
};

type Props = {
  recon?: RevenueReconciliation;
  invoiceInit?: InvoiceInfo;
  paymentInit?: { paymentDate: string | null; amount: number } | null;
  products: ProductOption[];
  defaultProductId?: number;
  prevRecons?: PrevRecon[];
  invoiceRecons?: InvoiceReconRef[];
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
  prevRecons = [],
  invoiceRecons = [],
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

  // Loại đợt: commission (hoa hồng, gộp mọi đợt tiến độ) / bonus_sale / bonus_manager
  // Đợt cụ thể (1/2/3) admin ghi vào Mô tả.
  // EDIT mode: hiện dropdown để user chọn loại của recon đang sửa.
  // CREATE mode: luôn commission (mặc định); thưởng nóng thêm qua "+ Thêm loại" bên dưới.
  const initialReconType = ((): string => {
    if (recon) {
      if (Number(recon.cdtBonusSale ?? 0) > 0) return "bonus_sale";
      if (Number(recon.cdtBonusManager ?? 0) > 0) return "bonus_manager";
    }
    return "commission";
  })();
  const [reconType, setReconType] = useState(initialReconType);

  // Multi-recon (chỉ CREATE): repeater rows với row 0 = loại chính (chọn bất
  // kỳ 3 loại), extra rows = bonus type khác chưa được dùng. Cả N chia sẻ
  // cùng invoice + ngày ĐC + số BB.
  type BonusType = "bonus_sale" | "bonus_manager";
  type BonusRow = { type: BonusType; amount: number; note: string };
  const [bonusRows, setBonusRows] = useState<BonusRow[]>([]);

  const BONUS_TYPES: BonusType[] = ["bonus_sale", "bonus_manager"];
  const bonusTypeLabel: Record<BonusType, string> = {
    bonus_sale: "Thưởng nóng cho sale",
    bonus_manager: "Thưởng nóng cho quản lý sàn",
  };

  // Loại bonus có config trên căn (>0). Không có config → không hiện trong dropdown.
  const productAvailableBonusTypes: BonusType[] = BONUS_TYPES.filter((t) => {
    const cfg =
      t === "bonus_sale"
        ? Number(product?.cdtBonusSale ?? 0)
        : Number(product?.cdtBonusManager ?? 0);
    return cfg > 0;
  });

  const usedBonusTypes = new Set(bonusRows.map((r) => r.type));
  // + button availability: có loại bonus nào (chưa dùng ở row 0 hoặc extras) VÀ có config
  const canAddMoreBonus = productAvailableBonusTypes.some(
    (t) => t !== reconType && !usedBonusTypes.has(t),
  );

  // Row 0 dropdown options: commission luôn có + các bonus có config, filter
  // các bonus type đã bị extras dùng (nếu có, không cho row 0 pick trùng).
  const row0Options: string[] = [
    "commission",
    ...productAvailableBonusTypes.filter(
      (t) => t === reconType || !usedBonusTypes.has(t),
    ),
  ];

  // Options cho 1 extra row: các bonus có config + chưa được dùng ở row 0 hoặc
  // extra khác (giữ current row's type để hiển thị).
  const extraRowOptions = (idx: number): BonusType[] => {
    const currentType = bonusRows[idx]?.type;
    return productAvailableBonusTypes.filter(
      (t) =>
        t === currentType ||
        (t !== reconType && !bonusRows.some((r, i) => i !== idx && r.type === t)),
    );
  };

  const addBonusRow = () => {
    const availableForNew = productAvailableBonusTypes.filter(
      (t) => t !== reconType && !usedBonusTypes.has(t),
    );
    if (availableForNew.length === 0) return;
    const nextType = availableForNew[0];
    const defaultAmt =
      nextType === "bonus_sale"
        ? Number(product?.cdtBonusSale ?? 0)
        : Number(product?.cdtBonusManager ?? 0);
    setBonusRows([...bonusRows, { type: nextType, amount: defaultAmt, note: "" }]);
  };
  const removeBonusRow = (idx: number) => {
    setBonusRows(bonusRows.filter((_, i) => i !== idx));
  };
  const updateBonusRow = (idx: number, patch: Partial<BonusRow>) => {
    setBonusRows(bonusRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

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

  // Controlled % — cần cho auto-suggest "Số tiền" khi commission.
  const [pmgLkDisplay, setPmgLkDisplay] = useState(pctDisplay(recon?.pmgCumulativePct));
  const [phasePctDisplay, setPhasePctDisplay] = useState(
    pctDisplay(recon?.phasePctThisTime),
  );

  const isCommission = reconType === "commission";
  const revenueThisTimeVal = isCommission ? amount : 0;
  const cdtBonusSaleVal = reconType === "bonus_sale" ? amount : 0;
  const cdtBonusManagerVal = reconType === "bonus_manager" ? amount : 0;

  // Prev recons của căn này (loại recon đang edit + loại bonus)
  const prevCommissions = useMemo(() => {
    if (!product) return [];
    return prevRecons.filter(
      (r) =>
        r.productId === product.id &&
        r.id !== recon?.id &&
        !(Number(r.cdtBonusSale) > 0 || Number(r.cdtBonusManager) > 0),
    );
  }, [prevRecons, product, recon?.id]);

  // Tổng đã ĐC LK trước đây (không tính bonus, không tính recon đang edit).
  // Excel col 18 "DT theo tien do da doi chieu LK".
  const prevCumulativeLK = useMemo(
    () => prevCommissions.reduce((sum, r) => sum + Number(r.revenueThisTime ?? 0), 0),
    [prevCommissions],
  );

  // %thu PMG_LK cao nhất từ các đợt trước — hint cho user biết đợt mới thường ≥ giá trị này
  const prevMaxPhasePct = useMemo(
    () =>
      Math.max(
        0,
        ...prevCommissions.map((r) => Number(r.phasePctThisTime ?? 0)),
      ),
    [prevCommissions],
  );

  // ===== Hóa đơn state (auto-compute total) =====
  const [invoiceNumber, setInvoiceNumber] = useState<string>(invoiceInit?.number ?? "");
  const [invoiceDate, setInvoiceDate] = useState<string>(invoiceInit?.date ?? "");

  // Tổng HĐ = sum(totalReceivable của các recon khác cùng số HĐ + ngày HĐ) + amount đang nhập
  const invoiceTotalComputed = useMemo(() => {
    const num = invoiceNumber.trim();
    if (!num && !invoiceDate) return 0;
    const otherSum = invoiceRecons
      .filter(
        (r) =>
          r.id !== recon?.id &&
          r.invoiceNumber === (num || "(chưa có số)") &&
          (r.invoiceDate ?? "") === (invoiceDate || ""),
      )
      .reduce((s, r) => s + Number(r.totalReceivableThisTime ?? 0), 0);
    return otherSum + amount;
  }, [invoiceRecons, invoiceNumber, invoiceDate, amount, recon?.id]);

  // Số recon khác đang chia sẻ HĐ này (để hint cho user)
  const otherReconsInInvoice = useMemo(() => {
    const num = invoiceNumber.trim();
    if (!num && !invoiceDate) return [];
    return invoiceRecons.filter(
      (r) =>
        r.id !== recon?.id &&
        r.invoiceNumber === (num || "(chưa có số)") &&
        (r.invoiceDate ?? "") === (invoiceDate || ""),
    );
  }, [invoiceRecons, invoiceNumber, invoiceDate, recon?.id]);

  // Suggest amount dựa loại đợt + product config
  // Commission theo Excel col 20 = (pmgBase × %PMG_LK × %thu − admin_fee) − sum(prev col 20)
  const suggested = useMemo(() => {
    if (!product) return 0;
    if (reconType === "bonus_sale") return Number(product.cdtBonusSale ?? 0);
    if (reconType === "bonus_manager") return Number(product.cdtBonusManager ?? 0);
    // Commission
    const pmgLk = Number(pmgLkDisplay.replace(",", ".")) / 100;
    const phasePct = Number(phasePctDisplay.replace(",", ".")) / 100;
    if (!Number.isFinite(pmgLk) || !Number.isFinite(phasePct) || pmgLk <= 0 || phasePct <= 0) {
      return 0;
    }
    const gross = Number(product.pmgBasePrice ?? 0) * pmgLk * phasePct;
    // Admin fee: ưu tiên recon.adminFeeVat (đã lưu), fallback product.adminFee
    const adminFee = Number(recon?.adminFeeVat ?? 0) || Number(product.adminFee ?? 0);
    const lkThisTime = gross - adminFee; // = Excel col 19
    return Math.max(0, Math.round(lkThisTime - prevCumulativeLK));
  }, [reconType, product, recon, pmgLkDisplay, phasePctDisplay, prevCumulativeLK]);

  return (
    <form
      action={(fd) =>
        start(async () => {
          try {
            await onSave(fd);
          } catch (e) {
            if (isRedirect(e)) throw e;
            toast.error(e instanceof Error ? e.message : "Lỗi khi lưu");
          }
        })
      }
      autoComplete="off"
      className="space-y-6 bg-white border border-slate-200 rounded-xl p-6"
    >
      {/* ===== 1. Chọn căn ===== */}
      <Section title="Chọn căn">
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
          {isEdit && (
            <div className="text-xs text-slate-500 mt-1">
              Không đổi được căn khi sửa. Muốn chuyển đợt sang căn khác → xóa đợt này rồi tạo lại.
            </div>
          )}
        </Field>
      </Section>

      {/* Các % Excel không có, giữ hidden để không break shape / data cũ */}
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

      {/* ===== 2. Tham chiếu từ căn (gộp info + cấu hình HH/KPI) ===== */}
      {product && (
        <Section title="📌 Tham chiếu từ căn (chỉ hiển thị)">
          <div className="text-xs text-slate-500 -mt-2 mb-3">
            Dữ liệu lấy từ config căn. Muốn đổi thì{" "}
            <a href={`/products/${product.id}/edit`} className="text-blue-600 hover:underline">
              vào trang chỉnh sửa căn
            </a>
            .
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <RefInfo label="Giá tính PMG" value={fmtMoney(product.pmgBasePrice)} />
            <RefInfo label="%PMG_LK (căn)" value={fmtPctTight(product.pmgRate)} />
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
            {!isSecondary && (
              <>
                <RefInfo label="%PMG_LK_sale" value={fmtPctTight(product.pmgSaleRate)} />
                <RefInfo label="%HH sale (NVKD)" value={fmtPctTight(product.saleCommissionRate)} />
                <RefInfo label="%KPI CEO" value={fmtPctTight(product.kpiCeoRate)} />
                <RefInfo label="%KPI TPKD" value={fmtPctTight(product.kpiTpkdRate)} />
                <RefInfo label="%KPI Admin" value={fmtPctTight(product.kpiAdminRate)} />
                <RefInfo label="Thưởng CĐT sale" value={fmtMoney(product.cdtBonusSale)} />
                <RefInfo label="Thưởng CĐT QL" value={fmtMoney(product.cdtBonusManager)} />
                <RefInfo label="Thưởng NVKD (CTY)" value={fmtMoney(product.bonusSale)} />
                <RefInfo label="Thưởng TPKD (CTY)" value={fmtMoney(product.bonusManager)} />
                <RefInfo label="Hỗ trợ khách" value={fmtMoney(product.customerSupport)} />
                <RefInfo
                  label="% thu PMG_LK đã ĐC"
                  value={prevMaxPhasePct > 0 ? `${(prevMaxPhasePct * 100).toFixed(2)}%` : "0%"}
                />
                <RefInfo label="LK đã ĐC (đợt trước)" value={fmtMoney(prevCumulativeLK)} />
              </>
            )}
          </div>
        </Section>
      )}

      {/* ===== 3. Nhập đợt đối chiếu ===== */}
      <Section title="💵 Nhập đợt đối chiếu">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <>
              <input type="hidden" name="pmgCumulativePct" defaultValue={pctDisplay(recon?.pmgCumulativePct)} />
              <input type="hidden" name="phasePctThisTime" defaultValue={pctDisplay(recon?.phasePctThisTime)} />
            </>
          ) : (
            <>
              <Field label="% PMG_LK đợt này">
                <input
                  name="pmgCumulativePct"
                  type="text"
                  inputMode="decimal"
                  value={pmgLkDisplay}
                  onChange={(e) => setPmgLkDisplay(e.target.value)}
                  onBlur={() => isCommission && suggested > 0 && setAmount(suggested)}
                  className="input"
                  placeholder="vd: 5.5"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Thường trùng {product ? fmtPctTight(product.pmgRate) : "%PMG_LK căn"}.
                </div>
              </Field>
              <Field label="Tỷ lệ % thu PMG_LK đợt này">
                <input
                  name="phasePctThisTime"
                  type="text"
                  inputMode="decimal"
                  value={phasePctDisplay}
                  onChange={(e) => setPhasePctDisplay(e.target.value)}
                  onBlur={() => isCommission && suggested > 0 && setAmount(suggested)}
                  className="input"
                  placeholder="vd: 60"
                />
                {prevMaxPhasePct > 0 && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    Đợt trước đã ĐC {(prevMaxPhasePct * 100).toFixed(2)}%. Đợt mới thường ≥.
                  </div>
                )}
              </Field>
            </>
          )}
        </div>

        {/* ===== Các khoản đối chiếu (repeater) =====
            Row 0 luôn Hoa hồng (create) hoặc loại của recon (edit).
            Bonus rows: chọn Thưởng nóng sale / QL, cộng inline vào cùng lần submit.
            Constraint: mỗi bonus type chỉ được add 1 lần. */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-700 uppercase mb-2">
            Các khoản đối chiếu
          </div>
          <div className="space-y-2">
            {/* Row 0 — commission (create) hoặc single recon (edit) */}
            <div className="flex gap-3 items-start flex-wrap">
              <div className="w-56">
                <label className="block text-xs text-slate-600 mb-1">
                  Loại đợt <span className="text-red-500">*</span>
                </label>
                <select
                  value={reconType}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setReconType(newType);
                    // Nếu row 0 chuyển sang bonus type đang được extra dùng → gỡ extra
                    if (newType === "bonus_sale" || newType === "bonus_manager") {
                      setBonusRows((rows) => rows.filter((r) => r.type !== newType));
                    }
                  }}
                  className="input"
                >
                  {(() => {
                    // Edit mode: cũng filter theo config căn. Giữ current type (dù
                    // config đã đổi thành 0) để không mất data recon đang sửa.
                    // Create mode: dùng row0Options (đã có sẵn logic).
                    if (!isEdit) {
                      return row0Options.map((t) => (
                        <option key={t} value={t}>
                          {t === "commission"
                            ? "Hoa hồng"
                            : bonusTypeLabel[t as BonusType]}
                        </option>
                      ));
                    }
                    const opts: { v: string; label: string }[] = [
                      { v: "commission", label: "Hoa hồng" },
                    ];
                    if (
                      Number(product?.cdtBonusSale ?? 0) > 0 ||
                      reconType === "bonus_sale"
                    ) {
                      opts.push({ v: "bonus_sale", label: "Thưởng nóng cho sale" });
                    }
                    if (
                      Number(product?.cdtBonusManager ?? 0) > 0 ||
                      reconType === "bonus_manager"
                    ) {
                      opts.push({
                        v: "bonus_manager",
                        label: "Thưởng nóng cho quản lý sàn",
                      });
                    }
                    return opts.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ));
                  })()}
                </select>
              </div>
              <div className="w-44">
                <label className="block text-xs text-slate-600 mb-1">
                  Số tiền <span className="text-red-500">*</span>
                </label>
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
              </div>
              <div className="flex-1 min-w-64">
                <label className="block text-xs text-slate-600 mb-1">Mô tả / Ghi chú</label>
                <input
                  name="note"
                  defaultValue={recon?.note ?? ""}
                  className="input"
                  placeholder="vd: Đợt 1, Đợt HĐMB, ..."
                />
              </div>
              {!isEdit && bonusRows.length === 0 && canAddMoreBonus && (
                <button
                  type="button"
                  onClick={addBonusRow}
                  title="Thêm loại đối chiếu"
                  className="h-10 w-10 mt-5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 text-xl leading-none flex items-center justify-center"
                >
                  +
                </button>
              )}
            </div>

            {/* Bonus rows (create only) */}
            {!isEdit &&
              bonusRows.map((row, idx) => {
                const rowAvailable = extraRowOptions(idx);
                const isLast = idx === bonusRows.length - 1;
                const amtDisplay = row.amount ? row.amount.toLocaleString("vi-VN") : "";
                return (
                  <div key={idx} className="flex gap-3 items-end flex-wrap">
                    <div className="w-56">
                      <label className="block text-xs text-slate-600 mb-1">
                        Loại đợt <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={row.type}
                        onChange={(e) =>
                          updateBonusRow(idx, { type: e.target.value as BonusType })
                        }
                        className="input"
                      >
                        {rowAvailable.map((t) => (
                          <option key={t} value={t}>
                            {bonusTypeLabel[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-44">
                      <label className="block text-xs text-slate-600 mb-1">
                        Số tiền <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={amtDisplay}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          updateBonusRow(idx, { amount: digits ? Number(digits) : 0 });
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                        className="input"
                        placeholder="0"
                      />
                    </div>
                    <div className="flex-1 min-w-64">
                      <label className="block text-xs text-slate-600 mb-1">
                        Mô tả / Ghi chú
                      </label>
                      <input
                        value={row.note}
                        onChange={(e) => updateBonusRow(idx, { note: e.target.value })}
                        className="input"
                        placeholder={`vd: ${bonusTypeLabel[row.type]}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBonusRow(idx)}
                      title="Bỏ khoản này"
                      className="h-10 w-10 mt-5 rounded-lg border border-slate-300 text-slate-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-xl leading-none flex items-center justify-center"
                    >
                      −
                    </button>
                    {isLast && canAddMoreBonus && (
                      <button
                        type="button"
                        onClick={addBonusRow}
                        title="Thêm loại đối chiếu"
                        className="h-10 w-10 mt-5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 text-xl leading-none flex items-center justify-center"
                      >
                        +
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>


        {/* Hidden inputs — route số tiền vào field đúng theo loại */}
        <input type="hidden" name="phaseNumber" value={0} />
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

      {/* Payment section đã bỏ khỏi form CREATE — user nhập thanh toán ở trang
          Sửa (PaymentsEditor). Lý do: lúc mới đối chiếu thường chưa thu tiền. */}

      {/* Hidden inputs cho bonus recons (create mode) — serialize repeater rows */}
      {!isEdit && (
        <>
          <input type="hidden" name="bonus_count" value={bonusRows.length} />
          {bonusRows.map((row, idx) => (
            <React.Fragment key={idx}>
              <input type="hidden" name={`bonus_${idx}_type`} value={row.type} />
              <input type="hidden" name={`bonus_${idx}_amount`} value={row.amount} />
              <input type="hidden" name={`bonus_${idx}_note`} value={row.note} />
            </React.Fragment>
          ))}
        </>
      )}

      {/* ===== 5. Hóa đơn (cuối) ===== */}
      <Section title={`📄 Hóa đơn${invoiceInit?.number ? " · ✅ Đã lập" : ""}`}>
        <div className="text-xs text-slate-500 -mt-2 mb-2">
          Trạng thái xuất hóa đơn cho đợt này. Nếu chưa lập, cứ để trống.
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Số hóa đơn">
            <input
              name="invoiceNumber"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="input"
              placeholder="Để trống nếu chưa lập"
            />
          </Field>
          <Field label="Ngày hóa đơn">
            <input
              type="date"
              name="invoiceDate"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Giá trị HĐ tổng (gồm VAT)">
            <div className="input bg-slate-50 text-slate-700 tabular-nums cursor-not-allowed">
              {invoiceTotalComputed > 0
                ? invoiceTotalComputed.toLocaleString("vi-VN")
                : "—"}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Tự tính = tổng các đợt cùng số HĐ.
              {otherReconsInInvoice.length > 0 &&
                ` Đang gộp ${otherReconsInInvoice.length} đợt khác (${fmtMoney(
                  otherReconsInInvoice.reduce(
                    (s, r) => s + Number(r.totalReceivableThisTime ?? 0),
                    0,
                  ),
                )}) + đợt này.`}
            </div>
          </Field>
        </div>
        <div className="text-xs text-slate-500">
          Số HĐ + ngày HĐ trùng HĐ đã có → hệ thống tự link + cộng dồn giá trị.
        </div>
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
