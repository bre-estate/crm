"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BulkRevenueRow } from "@/lib/actions/revenues";
import SearchableSelect from "@/components/SearchableSelect";

type ProductOpt = {
  id: number;
  productCode: string;
  unitCode: string;
  projectName: string | null;
  partnerName: string | null;
  saleType: string | null;
};

type Row = {
  productId: number | "";
  reconciliationDate: string;
  minutesNumber: string;
  reconType: string; // "commission" | "bonus_sale" | "bonus_manager"
  amount: number;
  phasePctThisTime: string; // display % (đợt này)
  pmgCumulativePct: string; // display % (lũy kế)
  invoiceNumber: string;
  invoiceDate: string;
  invoiceTotalVat: number;
  paymentDate: string;
  paymentAmount: number;
  note: string;
};

const emptyRow = (): Row => ({
  productId: "",
  reconciliationDate: "",
  minutesNumber: "",
  reconType: "commission",
  amount: 0,
  phasePctThisTime: "",
  pmgCumulativePct: "",
  invoiceNumber: "",
  invoiceDate: "",
  invoiceTotalVat: 0,
  paymentDate: "",
  paymentAmount: 0,
  note: "",
});

// Split 1 cột (dán dọc từ Excel): tách theo \n, trim mỗi dòng, bỏ dòng trailing rỗng.
function splitColumn(raw: string): string[] {
  const s = raw.replace(/\r\n?/g, "\n").split("\n").map((x) => x.trim());
  while (s.length > 0 && s[s.length - 1] === "") s.pop();
  return s;
}

// Parse số tiền: bỏ dấu . , dấu cách. "65.105.193" hoặc "65,105,193" → 65105193.
function parseMoney(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

// Parse %: chấp nhận "5.5" | "5,5" | "5,5%" | "0.055" (nếu <1 coi là decimal).
// Trả về display %: "5.5"
function parsePctDisplay(s: string): string {
  const clean = s.replace(/[%\s]/g, "").replace(",", ".");
  const n = Number(clean);
  if (!Number.isFinite(n)) return "";
  return n < 1 && n > 0 ? String(n * 100) : String(n);
}

// Parse ngày: chấp nhận "24/06/2026", "2026-06-24", Excel serial 46163, ""
function parseDate(s: string): string {
  const t = s.trim();
  if (!t) return "";
  // ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // dd/mm/yyyy
  const m = t.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // Excel serial number (days since 1899-12-30)
  const n = Number(t);
  if (Number.isFinite(n) && n > 25569 && n < 60000) {
    const ms = (n - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return "";
}

export default function BulkForm({
  products,
  onSave,
}: {
  products: ProductOpt[];
  onSave: (rows: BulkRevenueRow[]) => Promise<{ ok: number; errors: { index: number; message: string }[] }>;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);

  // === Paste column-by-column state ===
  const [showPaste, setShowPaste] = useState(false);
  const [colUnit, setColUnit] = useState("");
  const [colMinutes, setColMinutes] = useState("");
  const [colAmount, setColAmount] = useState("");
  const [colPctThis, setColPctThis] = useState("");
  const [colPct, setColPct] = useState("");
  const [colRecDate, setColRecDate] = useState("");
  const [colInvNum, setColInvNum] = useState("");
  const [colInvDate, setColInvDate] = useState("");
  const [colInvTotal, setColInvTotal] = useState("");
  const [colPayDate, setColPayDate] = useState("");
  const [colPayAmount, setColPayAmount] = useState("");
  const [colNote, setColNote] = useState("");
  const [defaultReconType, setDefaultReconType] = useState("commission");
  const [defaultDate, setDefaultDate] = useState("");
  const [replaceMode, setReplaceMode] = useState(true);

  // Reverse map: unitCode (normalized) → productId
  const unitCodeToId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      const key = p.unitCode.replace(/[\s.\-]/g, "").toLowerCase();
      m.set(key, p.id);
    }
    return m;
  }, [products]);

  const cols = useMemo(
    () => ({
      unit: splitColumn(colUnit),
      minutes: splitColumn(colMinutes),
      amount: splitColumn(colAmount),
      pctThis: splitColumn(colPctThis),
      pct: splitColumn(colPct),
      recDate: splitColumn(colRecDate),
      invNum: splitColumn(colInvNum),
      invDate: splitColumn(colInvDate),
      invTotal: splitColumn(colInvTotal),
      payDate: splitColumn(colPayDate),
      payAmount: splitColumn(colPayAmount),
      note: splitColumn(colNote),
    }),
    [
      colUnit,
      colMinutes,
      colAmount,
      colPctThis,
      colPct,
      colRecDate,
      colInvNum,
      colInvDate,
      colInvTotal,
      colPayDate,
      colPayAmount,
      colNote,
    ],
  );

  const nRows = cols.unit.length;
  const rowCountMismatch = (): string | null => {
    const checks: [string, number][] = [
      ["Số biên bản", cols.minutes.length],
      ["Số tiền", cols.amount.length],
      ["%PMG đợt này", cols.pctThis.length],
      ["%PMG lũy kế", cols.pct.length],
      ["Ngày ĐC", cols.recDate.length],
      ["Số HĐ", cols.invNum.length],
      ["Ngày HĐ", cols.invDate.length],
      ["Giá trị HĐ", cols.invTotal.length],
      ["Ngày nhận", cols.payDate.length],
      ["Số tiền thực nhận", cols.payAmount.length],
      ["Ghi chú", cols.note.length],
    ];
    const mismatched = checks.filter(([, n]) => n > 0 && n !== nRows);
    if (mismatched.length === 0) return null;
    return mismatched.map(([name, n]) => `${name}: ${n} dòng`).join(", ");
  };

  const applyPaste = () => {
    if (nRows === 0) {
      alert("Cần paste ít nhất cột 'Mã căn'.");
      return;
    }
    const mismatch = rowCountMismatch();
    if (mismatch) {
      const ok = confirm(
        `⚠ Số dòng các cột không khớp — Mã căn ${nRows}, ${mismatch}.\n\n` +
          `Nếu tiếp tục, dòng thiếu sẽ để trống. OK?`,
      );
      if (!ok) return;
    }

    const newRows: Row[] = [];
    const missing: string[] = [];
    for (let i = 0; i < nRows; i++) {
      const unit = cols.unit[i];
      if (!unit) continue;
      const norm = unit.replace(/[\s.\-]/g, "").toLowerCase();
      const productId = unitCodeToId.get(norm);
      if (!productId) {
        missing.push(unit);
        continue;
      }
      newRows.push({
        productId,
        reconciliationDate: cols.recDate[i] ? parseDate(cols.recDate[i]) : defaultDate,
        minutesNumber: cols.minutes[i] ?? "",
        reconType: defaultReconType,
        amount: cols.amount[i] ? parseMoney(cols.amount[i]) : 0,
        phasePctThisTime: cols.pctThis[i] ? parsePctDisplay(cols.pctThis[i]) : "",
        pmgCumulativePct: cols.pct[i] ? parsePctDisplay(cols.pct[i]) : "",
        invoiceNumber: cols.invNum[i] ?? "",
        invoiceDate: cols.invDate[i] ? parseDate(cols.invDate[i]) : "",
        invoiceTotalVat: cols.invTotal[i] ? parseMoney(cols.invTotal[i]) : 0,
        paymentDate: cols.payDate[i] ? parseDate(cols.payDate[i]) : "",
        paymentAmount: cols.payAmount[i] ? parseMoney(cols.payAmount[i]) : 0,
        note: cols.note[i] ?? "",
      });
    }

    if (newRows.length === 0) {
      alert(
        `Không tìm ra căn hợp lệ nào. Các mã không match:\n${missing.slice(0, 10).join(", ") || "(rỗng)"}`,
      );
      return;
    }
    let msg = `Import ${newRows.length} dòng.`;
    if (missing.length > 0) {
      msg +=
        `\n\n⚠ ${missing.length} mã căn không tìm thấy trong DB (đã bỏ qua):\n` +
        `${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`;
    }
    if (!confirm(msg + "\n\nOK để tiếp tục?")) return;
    setRows(replaceMode ? newRows : [...rows.filter((r) => r.productId), ...newRows]);
    setShowPaste(false);
    setColUnit("");
    setColMinutes("");
    setColAmount("");
    setColPctThis("");
    setColPct("");
    setColRecDate("");
    setColInvNum("");
    setColInvDate("");
    setColInvTotal("");
    setColPayDate("");
    setColPayAmount("");
    setColNote("");
  };

  const productBySaleType = (id: number | "") =>
    id ? products.find((p) => p.id === id)?.saleType : null;

  const update = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const submit = () => {
    // Filter out empty rows (no productId or amount = 0)
    const validRows: BulkRevenueRow[] = rows
      .filter((r) => r.productId && r.amount > 0)
      .map((r) => ({
        productId: r.productId as number,
        reconciliationDate: r.reconciliationDate || null,
        minutesNumber: r.minutesNumber || undefined,
        reconType: r.reconType,
        amount: r.amount,
        phasePctThisTime: r.phasePctThisTime ? Number(r.phasePctThisTime) : undefined,
        pmgCumulativePct: r.pmgCumulativePct ? Number(r.pmgCumulativePct) : undefined,
        invoiceNumber: r.invoiceNumber || undefined,
        invoiceDate: r.invoiceDate || null,
        invoiceTotalVat: r.invoiceTotalVat || undefined,
        paymentDate: r.paymentDate || null,
        paymentAmount: r.paymentAmount || undefined,
        note: r.note || undefined,
      }));
    if (validRows.length === 0) {
      alert("Chưa có dòng nào hợp lệ (cần chọn căn + số tiền > 0)");
      return;
    }
    start(async () => {
      try {
        const res = await onSave(validRows);
        if (res.errors.length > 0) {
          alert(
            `Đã tạo ${res.ok} dòng. ${res.errors.length} dòng lỗi:\n` +
              res.errors.map((e) => `  Dòng ${e.index + 1}: ${e.message}`).join("\n"),
          );
        } else {
          alert(`✅ Đã tạo ${res.ok} đợt đối chiếu`);
          router.push("/revenues");
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "Lỗi");
      }
    });
  };

  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.unitCode,
    sublabel: `${p.projectName ?? ""}${p.partnerName && p.partnerName !== "Chợ thứ cấp" ? ` · ${p.partnerName}` : ""}`,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm text-slate-600">
          Nhập 1 loạt đợt đối chiếu doanh thu (dùng khi admin nhập tháng/quý cho nhiều căn). Dòng
          rỗng sẽ tự bỏ qua khi lưu.
        </div>
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="text-sm bg-blue-50 border border-blue-300 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-100 whitespace-nowrap"
        >
          📋 {showPaste ? "Đóng" : "Dán từ Excel"}
        </button>
      </div>

      {showPaste && (
        <div className="border-2 border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
          <div className="text-xs text-slate-600">
            <b>Cách dùng:</b> mở file Excel CĐT gửi → click header cột (VD "MÃ CĂN") để select
            toàn bộ cột → Ctrl+C → paste vào ô "Mã căn" bên dưới. Lặp lại cho từng field cần nhập.
            Các cột phải có <b>cùng số dòng</b> và thứ tự dòng khớp nhau.
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs bg-white border border-slate-200 rounded-lg p-2">
            <label>
              Loại đợt áp cho tất cả:{" "}
              <select
                value={defaultReconType}
                onChange={(e) => setDefaultReconType(e.target.value)}
                className="input py-1 inline-block"
              >
                <option value="commission">Hoa hồng</option>
                <option value="bonus_sale">Thưởng nóng sale</option>
                <option value="bonus_manager">Thưởng nóng QL</option>
              </select>
            </label>
            <label>
              Ngày ĐC mặc định (nếu không paste cột Ngày ĐC):{" "}
              <input
                type="date"
                value={defaultDate}
                onChange={(e) => setDefaultDate(e.target.value)}
                className="input py-1 inline-block"
              />
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={replaceMode}
                onChange={(e) => setReplaceMode(e.target.checked)}
              />
              Thay bảng (bỏ tick để append)
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ColBox
              label="Mã căn"
              required
              value={colUnit}
              onChange={setColUnit}
              placeholder="A.10.10&#10;B.03.16&#10;..."
              nRows={cols.unit.length}
              nExpected={nRows}
              accent="orange"
            />
            <ColBox
              label="Số biên bản (BB)"
              value={colMinutes}
              onChange={setColMinutes}
              placeholder="BB001&#10;BB002&#10;..."
              nRows={cols.minutes.length}
              nExpected={nRows}
            />
            <ColBox
              label="Số tiền"
              value={colAmount}
              onChange={setColAmount}
              placeholder="65,105,193&#10;68,203,145&#10;..."
              nRows={cols.amount.length}
              nExpected={nRows}
            />
            <ColBox
              label="%PMG đợt này"
              value={colPctThis}
              onChange={setColPctThis}
              placeholder="2,5%&#10;2,5%&#10;..."
              nRows={cols.pctThis.length}
              nExpected={nRows}
            />
            <ColBox
              label="%PMG lũy kế"
              value={colPct}
              onChange={setColPct}
              placeholder="5,5%&#10;5,5%&#10;..."
              nRows={cols.pct.length}
              nExpected={nRows}
            />
            <ColBox
              label="Ngày ĐC"
              value={colRecDate}
              onChange={setColRecDate}
              placeholder="24/06/2026&#10;24/06/2026&#10;..."
              nRows={cols.recDate.length}
              nExpected={nRows}
            />
            <ColBox
              label="Số HĐ"
              value={colInvNum}
              onChange={setColInvNum}
              placeholder="0001234&#10;0001235&#10;..."
              nRows={cols.invNum.length}
              nExpected={nRows}
            />
            <ColBox
              label="Ngày HĐ"
              value={colInvDate}
              onChange={setColInvDate}
              placeholder="24/06/2026&#10;..."
              nRows={cols.invDate.length}
              nExpected={nRows}
            />
            <ColBox
              label="Giá trị HĐ (gồm VAT)"
              value={colInvTotal}
              onChange={setColInvTotal}
              placeholder="143,231,425&#10;..."
              nRows={cols.invTotal.length}
              nExpected={nRows}
            />
            <ColBox
              label="Ngày nhận tiền"
              value={colPayDate}
              onChange={setColPayDate}
              placeholder="24/06/2026&#10;..."
              nRows={cols.payDate.length}
              nExpected={nRows}
            />
            <ColBox
              label="Số tiền thực nhận"
              value={colPayAmount}
              onChange={setColPayAmount}
              placeholder="65,105,193&#10;..."
              nRows={cols.payAmount.length}
              nExpected={nRows}
            />
            <ColBox
              label="Ghi chú"
              value={colNote}
              onChange={setColNote}
              placeholder="Đợt 3&#10;Đợt 1&#10;..."
              nRows={cols.note.length}
              nExpected={nRows}
            />
          </div>

          <div className="flex justify-end items-center gap-2">
            <div className="text-xs text-slate-500 mr-auto">
              {nRows > 0 && rowCountMismatch() && (
                <span className="text-red-600">⚠ {rowCountMismatch()} — không khớp {nRows} dòng của Mã căn</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setColUnit("");
                setColMinutes("");
                setColAmount("");
                setColPctThis("");
                setColPct("");
                setColRecDate("");
                setColInvNum("");
                setColInvDate("");
                setColInvTotal("");
                setColPayDate("");
                setColPayAmount("");
                setColNote("");
              }}
              className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5"
            >
              Xóa hết
            </button>
            <button
              type="button"
              onClick={applyPaste}
              disabled={nRows === 0}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Áp dụng vào bảng ({nRows} dòng)
            </button>
          </div>
        </div>
      )}

      <div className="bg-white overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-slate-600 text-[11px]">
            <tr>
              <th className="text-left p-2 min-w-56">Căn</th>
              <th className="text-left p-2 min-w-32">Ngày ĐC</th>
              <th className="text-left p-2 min-w-28">Số BB</th>
              <th className="text-left p-2 min-w-40">Loại đợt</th>
              <th className="text-right p-2 min-w-32">Số tiền</th>
              <th className="text-right p-2 min-w-20">%PMG đợt này</th>
              <th className="text-right p-2 min-w-20">%PMG lũy kế</th>
              <th className="text-left p-2 min-w-28">Số HĐ</th>
              <th className="text-left p-2 min-w-32">Ngày HĐ</th>
              <th className="text-right p-2 min-w-32">Giá trị HĐ</th>
              <th className="text-left p-2 min-w-32">Ngày nhận</th>
              <th className="text-right p-2 min-w-32">Tiền nhận</th>
              <th className="text-left p-2 min-w-40">Ghi chú</th>
              <th className="text-center p-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const isSecondary = productBySaleType(r.productId) === "secondary";
              return (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="p-1">
                    <SearchableSelect
                      value={r.productId}
                      onChange={(v) => update(idx, { productId: v ? Number(v) : "" })}
                      placeholder="Gõ mã căn..."
                      emptyOption="— Chọn căn —"
                      options={productOptions}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="date"
                      value={r.reconciliationDate}
                      onChange={(e) => update(idx, { reconciliationDate: e.target.value })}
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      value={r.minutesNumber}
                      onChange={(e) => update(idx, { minutesNumber: e.target.value })}
                      placeholder="—"
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1">
                    <select
                      value={r.reconType}
                      onChange={(e) => update(idx, { reconType: e.target.value })}
                      className="input text-xs py-1"
                    >
                      <option value="commission">Hoa hồng</option>
                      <option value="bonus_sale">Thưởng nóng sale</option>
                      <option value="bonus_manager">Thưởng nóng QL</option>
                    </select>
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.amount ? r.amount.toLocaleString("vi-VN") : ""}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        update(idx, { amount: digits ? Number(digits) : 0 });
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="0"
                      className="input text-xs py-1 text-right tabular-nums"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="number"
                      step="any"
                      value={r.phasePctThisTime}
                      onChange={(e) => update(idx, { phasePctThisTime: e.target.value })}
                      placeholder="vd: 2.5"
                      disabled={r.reconType.startsWith("bonus")}
                      className="input text-xs py-1 text-right"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="number"
                      step="any"
                      value={r.pmgCumulativePct}
                      onChange={(e) => update(idx, { pmgCumulativePct: e.target.value })}
                      placeholder="vd: 5.5"
                      disabled={r.reconType.startsWith("bonus")}
                      className="input text-xs py-1 text-right"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      value={r.invoiceNumber}
                      onChange={(e) => update(idx, { invoiceNumber: e.target.value })}
                      placeholder="—"
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="date"
                      value={r.invoiceDate}
                      onChange={(e) => update(idx, { invoiceDate: e.target.value })}
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.invoiceTotalVat ? r.invoiceTotalVat.toLocaleString("vi-VN") : ""}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        update(idx, { invoiceTotalVat: digits ? Number(digits) : 0 });
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="0"
                      className="input text-xs py-1 text-right tabular-nums"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="date"
                      value={r.paymentDate}
                      onChange={(e) => update(idx, { paymentDate: e.target.value })}
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.paymentAmount ? r.paymentAmount.toLocaleString("vi-VN") : ""}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        update(idx, { paymentAmount: digits ? Number(digits) : 0 });
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="0"
                      className="input text-xs py-1 text-right tabular-nums"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      value={r.note}
                      onChange={(e) => update(idx, { note: e.target.value })}
                      placeholder="—"
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="p-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="text-red-500 hover:bg-red-50 rounded px-1"
                      title="Xoá dòng"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={addRow}
          className="text-sm bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-200"
        >
          + Thêm dòng
        </button>
        <button
          type="button"
          onClick={() => setRows([])}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Reset
        </button>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">
          {rows.filter((r) => r.productId && r.amount > 0).length}/{rows.length} dòng hợp lệ
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-blue-600 text-white rounded-lg px-6 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Lưu tất cả"}
        </button>
      </div>
    </div>
  );
}

function ColBox({
  label,
  value,
  onChange,
  placeholder,
  nRows,
  nExpected,
  required,
  accent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  nRows: number;
  nExpected: number;
  required?: boolean;
  accent?: "orange";
}) {
  const mismatch = nRows > 0 && nExpected > 0 && nRows !== nExpected;
  const empty = nRows === 0;
  return (
    <div>
      <div
        className={`text-xs font-medium mb-1 flex justify-between ${
          accent === "orange" ? "text-orange-700" : "text-slate-700"
        }`}
      >
        <span>
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        {!empty && (
          <span className={mismatch ? "text-red-600" : "text-slate-500"}>{nRows} dòng</span>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input font-mono text-xs w-full min-h-24 ${
          accent === "orange" ? "border-orange-300" : ""
        } ${mismatch ? "border-red-400" : ""}`}
      />
    </div>
  );
}
