"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BulkRevenueRow } from "@/lib/actions/revenues";
import { fmtMoney } from "@/lib/format";
import SearchableSelect from "@/components/SearchableSelect";
import { toast } from "sonner";

type ProjectOpt = {
  id: number;
  name: string;
  partnerName: string | null;
};

type ProductOpt = {
  id: number;
  productCode: string;
  unitCode: string;
  projectId: number;
  projectName: string | null;
  partnerName: string | null;
  saleType: string | null;
  pmgBasePrice: number | null;
  pmgRate: number | null;
  adminFee: number | null;
  cdtBonusSale: number | null;
  cdtBonusManager: number | null;
};

type PrevRecon = { cumulativeRevenue: number; maxPhasePct: number };

type ReconType = "commission" | "bonus_sale" | "bonus_manager";

// ============ Helpers ============
function splitColumn(raw: string): string[] {
  const s = raw.replace(/\r\n?/g, "\n").split("\n").map((x) => x.trim());
  while (s.length > 0 && s[s.length - 1] === "") s.pop();
  return s;
}

function parseMoney(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

// Decimal 0..1 từ "5.5" | "5,5" | "5,5%" | "0.055"
function parsePctDecimal(s: string): number {
  const clean = s.replace(/[%\s]/g, "").replace(",", ".");
  const n = Number(clean);
  if (!Number.isFinite(n) || n === 0) return 0;
  return n < 1 && n > 0 ? n : n / 100;
}

function parseDate(s: string): string {
  const t = s.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const n = Number(t);
  if (Number.isFinite(n) && n > 25569 && n < 60000) {
    const ms = (n - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return "";
}

function normalize(s: string): string {
  return s.replace(/[\s.\-_]/g, "").toLowerCase();
}

// ============ Component ============

export default function BulkForm({
  projects,
  products,
  prevReconsByProduct,
  onSave,
}: {
  projects: ProjectOpt[];
  products: ProductOpt[];
  prevReconsByProduct: Record<number, PrevRecon>;
  onSave: (rows: BulkRevenueRow[]) => Promise<{
    ok: number;
    createdIds: number[];
    errors: { index: number; message: string }[];
  }>;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  // Top defaults
  const [projectId, setProjectId] = useState<string>("");
  const [reconType, setReconType] = useState<ReconType>("commission");
  const [defaultDate, setDefaultDate] = useState<string>("");
  const isCommission = reconType === "commission";
  const isBonusSale = reconType === "bonus_sale";
  const isBonusMgr = reconType === "bonus_manager";

  // Cột paste
  const [colUnit, setColUnit] = useState("");
  const [colPmgLk, setColPmgLk] = useState("");     // %PMG_LK (đợt này)
  const [colPhasePct, setColPhasePct] = useState(""); // %thu PMG_LK đợt này
  const [colAmount, setColAmount] = useState("");   // chỉ dùng cho bonus
  const [colDate, setColDate] = useState("");
  const [colMinutes, setColMinutes] = useState("");
  const [colNote, setColNote] = useState("");

  // Filter products theo dự án đã chọn — 1 lần bulk = 1 dự án. Nếu chưa
  // chọn dự án → không lookup được → warning "Chọn dự án ở trên".
  const productByUnitCode = useMemo(() => {
    const m = new Map<string, ProductOpt>();
    if (!projectId) return m;
    const pid = Number(projectId);
    for (const p of products) {
      if (p.projectId === pid) m.set(normalize(p.unitCode), p);
    }
    return m;
  }, [products, projectId]);

  const cols = useMemo(
    () => ({
      unit: splitColumn(colUnit),
      pmgLk: splitColumn(colPmgLk),
      phasePct: splitColumn(colPhasePct),
      amount: splitColumn(colAmount),
      date: splitColumn(colDate),
      minutes: splitColumn(colMinutes),
      note: splitColumn(colNote),
    }),
    [colUnit, colPmgLk, colPhasePct, colAmount, colDate, colMinutes, colNote],
  );

  const nRows = cols.unit.length;

  // ============ Preview ============
  const preview = useMemo(() => {
    const out: {
      row: BulkRevenueRow;
      product: ProductOpt | null;
      warnings: string[];
      isRegression: boolean; // %thu đợt này < đã thu trước → block save
      // Reference columns
      pmgBase: number;
      pmgLk: number;
      phasePct: number;
      prevMaxPhasePct: number;       // % đã thu tại đợt trước (cumulative)
      grossThisTime: number;         // = pmgBase × pmgLk × phasePct
      lkThisTime: number;            // = gross - admin (DT LK đợt này)
      lkPrev: number;                // DT đã ĐC lũy kế đợt trước
      receivable: number;            // DT phải thu đợt này = lkThisTime - lkPrev
      expectedTotal: number;         // DT full = pmgBase × pmgLk_final - admin
      remaining: number;             // DT còn phải thu (static, độc lập input đợt này) = expected - lkPrev
      totalReceivable: number;       // Tổng khoản phải thu đợt này (bao gồm bonus nếu có)
    }[] = [];

    for (let i = 0; i < nRows; i++) {
      const warnings: string[] = [];
      const unit = cols.unit[i];
      if (!unit) continue;

      const product = productByUnitCode.get(normalize(unit)) ?? null;
      if (!product) {
        if (!projectId) warnings.push("Chưa chọn dự án ở trên");
        else warnings.push(`Không tìm thấy căn "${unit}" trong dự án này`);
      }

      const pmgBase = Number(product?.pmgBasePrice ?? 0);
      const admin = Number(product?.adminFee ?? 0);
      // %PMG_LK đợt này — nếu user không paste, fallback từ product.pmgRate
      const pmgLk = cols.pmgLk[i]
        ? parsePctDecimal(cols.pmgLk[i])
        : Number(product?.pmgRate ?? 0);
      const phasePct = cols.phasePct[i] ? parsePctDecimal(cols.phasePct[i]) : 0;

      // Compute reference values
      const grossThisTime = pmgBase * pmgLk * phasePct;
      const lkThisTime = Math.max(0, grossThisTime - admin);
      const prev = prevReconsByProduct[product?.id ?? -1];
      const lkPrev = prev?.cumulativeRevenue ?? 0;
      const prevMaxPhasePct = prev?.maxPhasePct ?? 0;
      const receivable = Math.max(0, Math.round(lkThisTime - lkPrev));
      const expectedTotal = Math.max(0, pmgBase * pmgLk - admin);
      // Còn phải thu = TỔNG − đã thu trước (STATIC, không phụ thuộc %thu đợt này).
      // Sau khi save đợt này, số này sẽ giảm xuống ở lần bulk kế tiếp.
      const remaining = Math.max(0, Math.round(expectedTotal - lkPrev));

      // Regression check: %thu đợt này phải >= %thu đã có trước (cumulative)
      const isRegression =
        isCommission && phasePct > 0 && phasePct < prevMaxPhasePct - 1e-9;
      if (isRegression) {
        warnings.push(
          `%thu ${(phasePct * 100).toFixed(2)}% < đã thu trước ${(prevMaxPhasePct * 100).toFixed(2)}%`,
        );
      }

      // Amount:
      //   Commission → auto = receivable (từ formula)
      //   Bonus sale → user paste manual, fallback product.cdtBonusSale
      //   Bonus mgr → user paste manual, fallback product.cdtBonusManager
      let amount = 0;
      if (isCommission) {
        if (pmgLk <= 0) warnings.push("Thiếu %PMG_LK");
        if (phasePct <= 0) warnings.push("Thiếu %thu đợt này");
        amount = receivable;
      } else if (isBonusSale) {
        amount = cols.amount[i]
          ? parseMoney(cols.amount[i])
          : Number(product?.cdtBonusSale ?? 0);
      } else if (isBonusMgr) {
        amount = cols.amount[i]
          ? parseMoney(cols.amount[i])
          : Number(product?.cdtBonusManager ?? 0);
      }
      if (amount <= 0 && !isCommission) warnings.push("Số tiền = 0");

      const totalReceivable = isCommission ? receivable : amount;

      const row: BulkRevenueRow = {
        productId: product?.id ?? 0,
        reconciliationDate: cols.date[i] ? parseDate(cols.date[i]) : defaultDate || null,
        minutesNumber: cols.minutes[i] || undefined,
        reconType,
        amount,
        phasePctThisTime: isCommission ? phasePct * 100 : undefined,
        pmgCumulativePct: isCommission ? pmgLk * 100 : undefined,
        note: cols.note[i] || undefined,
      };

      out.push({
        row,
        product,
        warnings,
        isRegression,
        pmgBase,
        pmgLk,
        phasePct,
        prevMaxPhasePct,
        grossThisTime,
        lkThisTime,
        lkPrev,
        receivable,
        expectedTotal,
        remaining,
        totalReceivable,
      });
    }
    return out;
  }, [nRows, cols, productByUnitCode, prevReconsByProduct, isCommission, isBonusSale, isBonusMgr, reconType, defaultDate, projectId]);

  const validCount = preview.filter(
    (p) => p.warnings.length === 0 && p.row.productId > 0 && p.row.amount > 0,
  ).length;
  const totalWarnings = preview.reduce((s, p) => s + p.warnings.length, 0);
  const regressionCount = preview.filter((p) => p.isRegression).length;

  const submit = () => {
    // Regression rows BLOCK — không cho lưu (dù có ignore warnings).
    const validRows = preview
      .filter((p) => p.row.productId > 0 && p.row.amount > 0 && !p.isRegression)
      .map((p) => p.row);
    if (validRows.length === 0) {
      toast.error("Không có dòng hợp lệ", {
        description: "Cần có căn tìm được + số tiền > 0",
      });
      return;
    }
    if (totalWarnings > 0) {
      const ok = confirm(
        `${totalWarnings} cảnh báo, ${validRows.length}/${preview.length} dòng sẽ được lưu. Tiếp tục?`,
      );
      if (!ok) return;
    }
    start(async () => {
      try {
        const res = await onSave(validRows);
        if (res.errors.length > 0) {
          toast.error(`Đã tạo ${res.ok}, ${res.errors.length} lỗi`, {
            description: res.errors
              .slice(0, 5)
              .map((e) => `Dòng ${e.index + 1}: ${e.message}`)
              .join(" · "),
          });
        } else {
          toast.success(`Đã tạo ${res.ok} đợt đối chiếu`);
          const qs =
            res.createdIds.length > 0
              ? `?justCreated=${res.createdIds.join(",")}`
              : "";
          router.push(`/revenues${qs}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  };

  const clearAll = () => {
    if (!confirm("Xóa hết dữ liệu đã paste?")) return;
    setColUnit("");
    setColPmgLk("");
    setColPhasePct("");
    setColAmount("");
    setColDate("");
    setColMinutes("");
    setColNote("");
  };

  return (
    <div className="space-y-4">
      {/* Top settings — Dự án + Loại đợt + Ngày ĐC */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">
            Dự án <span className="text-red-600">*</span>
          </label>
          <SearchableSelect
            value={projectId}
            onChange={(v) => setProjectId(String(v))}
            placeholder="Tìm tên dự án hoặc CĐT..."
            options={projects.map((p) => ({
              value: p.id,
              label: p.partnerName ? `${p.name} — ${p.partnerName}` : p.name,
            }))}
            required
          />
          <div className="text-[10px] text-slate-500 mt-1">
            1 lần bulk = 1 dự án. Muốn nhập nhiều dự án → chia nhiều lượt.
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">
            Loại đợt <span className="text-red-600">*</span>
          </label>
          <select
            value={reconType}
            onChange={(e) => setReconType(e.target.value as ReconType)}
            className="input"
          >
            <option value="commission">Hoa hồng (auto tính)</option>
            <option value="bonus_sale">Thưởng nóng cho sale</option>
            <option value="bonus_manager">Thưởng nóng cho QL</option>
          </select>
          <div className="text-[10px] text-slate-500 mt-1">
            {isCommission
              ? "Số tiền tự tính từ %PMG × %thu × Giá PMG − admin − đã ĐC trước."
              : "Số tiền cần paste cụ thể. Trống → dùng số cấu hình của căn."}
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">
            Ngày ĐC mặc định (nếu không paste cột Ngày)
          </label>
          <input
            type="date"
            value={defaultDate}
            onChange={(e) => setDefaultDate(e.target.value)}
            className="input"
          />
        </div>
      </div>

      {/* Hướng dẫn */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-900">
        Mở file Excel CĐT gửi → click header cột → Ctrl+C → paste vào ô tương ứng
        bên dưới. Cột <span className="text-red-600 font-semibold">Mã căn *</span>
        {" "}bắt buộc; các cột khác paste đủ số dòng cùng thứ tự.
      </div>

      {/* Paste columns */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <ColTextarea
            label="Mã căn"
            value={colUnit}
            onChange={setColUnit}
            placeholder="A.10.10 B.03.16 ..."
            required
          />
          {isCommission && (
            <ColTextarea
              label="%PMG_LK"
              value={colPmgLk}
              onChange={setColPmgLk}
              placeholder="7% 7% ..."
              hint="Nếu trống → dùng %PMG_LK cấu hình của căn"
            />
          )}
          {isCommission && (
            <ColTextarea
              label="Tỷ lệ % thu PMG đợt này"
              value={colPhasePct}
              onChange={setColPhasePct}
              placeholder="30% 70% ..."
              required
              hint="VD đợt 1 thu 30%, đợt 2 thu tiếp 40% ..."
            />
          )}
          {!isCommission && (
            <ColTextarea
              label="Số tiền"
              value={colAmount}
              onChange={setColAmount}
              placeholder="22.000.000 ..."
              hint="Trống → dùng số cấu hình của căn"
            />
          )}
          <ColTextarea
            label="Ngày ĐC"
            value={colDate}
            onChange={setColDate}
            placeholder="24/06/2026 ..."
          />
          <ColTextarea
            label="Số biên bản"
            value={colMinutes}
            onChange={setColMinutes}
            placeholder="BB001 ..."
          />
          <ColTextarea
            label="Ghi chú"
            value={colNote}
            onChange={setColNote}
            placeholder="Đợt 1 ..."
          />
        </div>
      </div>

      {/* Preview */}
      {nRows > 0 && (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <b>{nRows}</b> dòng đã paste · <b>{validCount}</b> hợp lệ
              {totalWarnings > 0 && (
                <>
                  {" "}·{" "}
                  <span className="text-amber-700">{totalWarnings} cảnh báo</span>
                </>
              )}
              {regressionCount > 0 && (
                <>
                  {" "}·{" "}
                  <span className="text-red-700 font-semibold">
                    {regressionCount} dòng lùi %thu (bị chặn)
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-red-600 hover:underline"
            >
              Xóa hết
            </button>
          </div>
          {regressionCount > 0 && (
            <div className="text-xs bg-red-50 border border-red-200 rounded p-2 text-red-800">
              <b>Chặn lưu {regressionCount} dòng</b> vì %thu đợt này thấp hơn %thu
              đã có trước. Nếu <b>Giá tính PMG</b> của căn đã thay đổi sau khi thu
              đợt trước → xử lý qua <b>Điều chỉnh thông tin căn</b> (mở trang chi
              tiết căn) trước, rồi bulk lại.
            </div>
          )}
          <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2 whitespace-nowrap">Mã căn</th>
                  {isCommission && (
                    <>
                      <th className="text-right p-2 whitespace-nowrap bg-slate-100">
                        % đã thu trước
                      </th>
                      <th className="text-right p-2">%PMG</th>
                      <th className="text-right p-2">%thu đợt này</th>
                    </>
                  )}
                  <th className="text-right p-2 whitespace-nowrap bg-blue-50">
                    DT LK đợt này
                  </th>
                  <th className="text-right p-2 whitespace-nowrap bg-blue-50">
                    Đã ĐC trước
                  </th>
                  <th className="text-right p-2 whitespace-nowrap bg-blue-50">
                    Phải thu đợt này
                  </th>
                  <th
                    className="text-right p-2 whitespace-nowrap bg-blue-50"
                    title="= Tổng phải thu − Đã ĐC trước (không phụ thuộc %thu đợt này)"
                  >
                    Còn phải thu
                  </th>
                  <th className="text-right p-2 whitespace-nowrap bg-green-50">
                    Số tiền (sẽ lưu)
                  </th>
                  <th className="text-left p-2 whitespace-nowrap">Ngày</th>
                  <th className="text-left p-2">Số BB</th>
                  <th className="text-left p-2">Ghi chú</th>
                  <th className="text-left p-2">Cảnh báo</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => {
                  const bad = p.warnings.length > 0;
                  const rowBg = p.isRegression
                    ? "bg-red-50"
                    : bad
                      ? "bg-amber-50"
                      : "";
                  return (
                    <tr
                      key={i}
                      className={`border-t border-slate-100 ${rowBg}`}
                    >
                      <td className="p-2 text-slate-400">{i + 1}</td>
                      <td className="p-2 font-mono">
                        {p.product?.unitCode ?? cols.unit[i]}
                        {p.product && (
                          <div className="text-[10px] text-slate-500">
                            {p.product.projectName}
                          </div>
                        )}
                      </td>
                      {isCommission && (
                        <>
                          <td className="p-2 text-right tabular-nums bg-slate-100/50 text-slate-600">
                            {p.prevMaxPhasePct > 0
                              ? (p.prevMaxPhasePct * 100).toFixed(2) + "%"
                              : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {p.pmgLk > 0 ? (p.pmgLk * 100).toFixed(2) + "%" : "—"}
                          </td>
                          <td
                            className={`p-2 text-right tabular-nums ${p.isRegression ? "text-red-700 font-semibold" : ""}`}
                          >
                            {p.phasePct > 0
                              ? (p.phasePct * 100).toFixed(2) + "%"
                              : "—"}
                          </td>
                        </>
                      )}
                      <td className="p-2 text-right tabular-nums bg-blue-50/50">
                        {p.lkThisTime > 0 ? fmtMoney(p.lkThisTime) : "—"}
                      </td>
                      <td className="p-2 text-right tabular-nums bg-blue-50/50 text-slate-500">
                        {p.lkPrev > 0 ? fmtMoney(p.lkPrev) : "—"}
                      </td>
                      <td className="p-2 text-right tabular-nums bg-blue-50/50 font-medium">
                        {p.receivable > 0 ? fmtMoney(p.receivable) : "—"}
                      </td>
                      <td className="p-2 text-right tabular-nums bg-blue-50/50 text-slate-500">
                        {p.remaining > 0 ? fmtMoney(p.remaining) : "—"}
                      </td>
                      <td className="p-2 text-right tabular-nums bg-green-50 font-semibold">
                        {p.row.amount > 0 ? fmtMoney(p.row.amount) : "—"}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {p.row.reconciliationDate ?? "—"}
                      </td>
                      <td className="p-2">{p.row.minutesNumber ?? "—"}</td>
                      <td className="p-2">{p.row.note ?? "—"}</td>
                      <td className="p-2 text-amber-700 text-xs">
                        {p.warnings.join("; ") || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push("/revenues")}
          disabled={pending}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || validCount === 0}
          className="px-6 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : `Lưu ${validCount} đợt`}
        </button>
      </div>
    </div>
  );
}

// ============ Sub component ============
function ColTextarea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  const nLines =
    value.trim() === ""
      ? 0
      : value
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .filter((l) => l.trim()).length;
  return (
    <div>
      <label className="block text-xs text-slate-700 mb-1 font-medium">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
        {nLines > 0 && (
          <span className="ml-2 text-slate-400 font-normal">({nLines} dòng)</span>
        )}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input font-mono text-xs h-24 resize-y"
      />
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}
