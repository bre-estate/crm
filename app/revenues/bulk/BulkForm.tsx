"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
  reconType: string;
  amount: number;
  pmgCumulativePct: string; // display %
  invoiceNumber: string;
  invoiceDate: string;
  note: string;
};

const emptyRow = (): Row => ({
  productId: "",
  reconciliationDate: "",
  reconType: "phase:1",
  amount: 0,
  pmgCumulativePct: "",
  invoiceNumber: "",
  invoiceDate: "",
  note: "",
});

// Mapping options — cột trong TSV được gán field nào trong Row.
const COLUMN_FIELDS = [
  { key: "skip", label: "— Bỏ qua —" },
  { key: "unitCode", label: "Mã căn" },
  { key: "amount", label: "Số tiền" },
  { key: "pmgCumulativePct", label: "%PMG lũy kế" },
  { key: "reconciliationDate", label: "Ngày ĐC" },
  { key: "invoiceNumber", label: "Số HĐ" },
  { key: "invoiceDate", label: "Ngày HĐ" },
  { key: "note", label: "Ghi chú" },
] as const;
type ColumnField = (typeof COLUMN_FIELDS)[number]["key"];

// Parse TSV Excel-style: cell chứa \n hoặc \t được quote bằng "..." (RFC-4180).
// Double-quote bên trong = "".
function parseTSV(raw: string): string[][] {
  const s = raw.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === "\t") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  // Bỏ trailing empty rows
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  // Normalize header cell: gộp \n giữa cell thành space (do quoted multi-line cell)
  return rows.map((r) => r.map((c) => c.replace(/\s+/g, " ").trim()));
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
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);

  // === Paste TSV state ===
  const [showPaste, setShowPaste] = useState(false);
  const [tsvRaw, setTsvRaw] = useState("");
  const [skipRows, setSkipRows] = useState(0);
  const [colMap, setColMap] = useState<ColumnField[]>([]);
  const [defaultReconType, setDefaultReconType] = useState("phase:1");
  const [defaultDate, setDefaultDate] = useState("");
  const [replaceMode, setReplaceMode] = useState(true); // true = thay bảng, false = thêm vào

  // Reverse map: unitCode (normalized) → productId
  const unitCodeToId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      const key = p.unitCode.replace(/[\s.\-]/g, "").toLowerCase();
      m.set(key, p.id);
    }
    return m;
  }, [products]);

  const tsvGrid = useMemo(() => parseTSV(tsvRaw).slice(skipRows), [tsvRaw, skipRows]);
  const nCols = Math.max(0, ...tsvGrid.map((r) => r.length));
  // Auto-init colMap khi số cột đổi
  useEffect(() => {
    if (colMap.length !== nCols) {
      setColMap(Array.from({ length: nCols }, () => "skip"));
    }
  }, [nCols, colMap.length]);

  const applyPaste = () => {
    const idx = (field: ColumnField) => colMap.findIndex((c) => c === field);
    const iUnit = idx("unitCode");
    if (iUnit < 0) {
      alert("Cần map cột 'Mã căn' trước khi import.");
      return;
    }
    const iAmount = idx("amount");
    const iPct = idx("pmgCumulativePct");
    const iRecDate = idx("reconciliationDate");
    const iInvNum = idx("invoiceNumber");
    const iInvDate = idx("invoiceDate");
    const iNote = idx("note");

    const newRows: Row[] = [];
    const missing: string[] = [];
    for (const r of tsvGrid) {
      const unit = (r[iUnit] ?? "").trim();
      if (!unit) continue;
      const norm = unit.replace(/[\s.\-]/g, "").toLowerCase();
      const productId = unitCodeToId.get(norm);
      if (!productId) {
        missing.push(unit);
        continue;
      }
      newRows.push({
        productId,
        reconciliationDate: iRecDate >= 0 ? parseDate(r[iRecDate] ?? "") : defaultDate,
        reconType: defaultReconType,
        amount: iAmount >= 0 ? parseMoney(r[iAmount] ?? "") : 0,
        pmgCumulativePct: iPct >= 0 ? parsePctDisplay(r[iPct] ?? "") : "",
        invoiceNumber: iInvNum >= 0 ? (r[iInvNum] ?? "").trim() : "",
        invoiceDate: iInvDate >= 0 ? parseDate(r[iInvDate] ?? "") : "",
        note: iNote >= 0 ? (r[iNote] ?? "").trim() : "",
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
      msg += `\n\n⚠ ${missing.length} mã căn không tìm thấy trong DB (đã bỏ qua):\n${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`;
    }
    if (!confirm(msg + "\n\nOK để tiếp tục?")) return;
    setRows(replaceMode ? newRows : [...rows.filter((r) => r.productId), ...newRows]);
    setShowPaste(false);
    setTsvRaw("");
    setSkipRows(0);
    setColMap([]);
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
        reconType: r.reconType,
        amount: r.amount,
        pmgCumulativePct: r.pmgCumulativePct ? Number(r.pmgCumulativePct) : undefined,
        invoiceNumber: r.invoiceNumber || undefined,
        invoiceDate: r.invoiceDate || null,
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
            <b>Cách dùng:</b> mở file Excel CĐT gửi → select cả vùng dữ liệu (bao gồm header) →
            Ctrl+C → click vào ô textarea dưới → Ctrl+V. Rồi map từng cột.
          </div>
          <textarea
            value={tsvRaw}
            onChange={(e) => setTsvRaw(e.target.value)}
            placeholder={`Paste TSV ở đây. Ví dụ:\nSTT\tMã căn\t%PMG\tTiền đợt này\n1\tA.10.10\t5,5%\t65.105.193\n2\tA.10.11\t5,5%\t68.203.145`}
            className="input font-mono text-xs w-full min-h-32"
          />
          {tsvGrid.length > 0 && (
            <>
              <div className="flex items-center gap-4 text-xs">
                <label>
                  Bỏ N dòng đầu (header rác):{" "}
                  <input
                    type="number"
                    min="0"
                    value={skipRows}
                    onChange={(e) => setSkipRows(Math.max(0, Number(e.target.value)))}
                    className="input py-1 w-16 inline-block text-center"
                  />
                </label>
                <label>
                  Loại đợt áp cho tất cả:{" "}
                  <select
                    value={defaultReconType}
                    onChange={(e) => setDefaultReconType(e.target.value)}
                    className="input py-1 inline-block"
                  >
                    <option value="phase:1">Đợt 1</option>
                    <option value="phase:2">Đợt 2</option>
                    <option value="phase:3">Đợt 3</option>
                    <option value="phase:4">Đợt 4</option>
                    <option value="phase:5">Đợt 5</option>
                    <option value="bonus_sale">Thưởng nóng sale</option>
                    <option value="bonus_manager">Thưởng nóng QL</option>
                  </select>
                </label>
                <label>
                  Ngày ĐC mặc định (nếu file không có):{" "}
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

              <div className="text-xs text-slate-600">
                Preview {Math.min(5, tsvGrid.length)}/{tsvGrid.length} dòng. Map cột ở header:
              </div>
              <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
                <table className="text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      {Array.from({ length: nCols }).map((_, i) => (
                        <th key={i} className="p-1 border-r border-slate-200">
                          <select
                            value={colMap[i] ?? "skip"}
                            onChange={(e) => {
                              const next = [...colMap];
                              next[i] = e.target.value as ColumnField;
                              setColMap(next);
                            }}
                            className={`input text-[10px] py-0.5 ${colMap[i] && colMap[i] !== "skip" ? "bg-green-50 border-green-300" : ""}`}
                          >
                            {COLUMN_FIELDS.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tsvGrid.slice(0, 5).map((row, ri) => (
                      <tr key={ri} className="border-t border-slate-100">
                        {Array.from({ length: nCols }).map((_, ci) => (
                          <td
                            key={ci}
                            className="p-1 border-r border-slate-100 whitespace-nowrap max-w-40 truncate"
                          >
                            {row[ci] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTsvRaw("");
                    setSkipRows(0);
                    setColMap([]);
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5"
                >
                  Xóa paste
                </button>
                <button
                  type="button"
                  onClick={applyPaste}
                  className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700"
                >
                  Áp dụng vào bảng ({tsvGrid.length} dòng)
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-white">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-slate-600 text-[11px]">
            <tr>
              <th className="text-left p-2 min-w-56">Căn</th>
              <th className="text-left p-2">Ngày ĐC</th>
              <th className="text-left p-2 min-w-40">Loại đợt</th>
              <th className="text-right p-2 min-w-32">Số tiền</th>
              <th className="text-right p-2">%PMG lũy kế</th>
              <th className="text-left p-2">Số HĐ</th>
              <th className="text-left p-2">Ngày HĐ</th>
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
                    <select
                      value={r.reconType}
                      onChange={(e) => update(idx, { reconType: e.target.value })}
                      className="input text-xs py-1"
                    >
                      {!isSecondary && (
                        <>
                          <option value="phase:1">Đợt 1</option>
                          <option value="phase:2">Đợt 2</option>
                          <option value="phase:3">Đợt 3</option>
                          <option value="phase:4">Đợt 4</option>
                          <option value="phase:5">Đợt 5</option>
                        </>
                      )}
                      {isSecondary && <option value="phase:1">Đợt duy nhất</option>}
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
          onClick={() => setRows([emptyRow(), emptyRow(), emptyRow()])}
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
