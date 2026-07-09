"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney, fmtPct } from "@/lib/format";

type ProductSnapshot = {
  id: number;
  pmgBasePrice: number;
  pmgRate: number;
  adminFee: number;
};

type FieldDef = {
  key: keyof Omit<ProductSnapshot, "id">;
  label: string;
  type: "money" | "percent";
};

// Trước mắt chỉ cho điều chỉnh 3 trường liên quan tới CĐT
// (giá + %HH CĐT trả BRE + phí admin CĐT trừ).
// Các trường nội bộ (%HH sale, KPI, thưởng...) sửa trực tiếp qua ProductForm.
const FIELDS: FieldDef[] = [
  { key: "pmgBasePrice", label: "Giá tính PMG (= giá bán căn)", type: "money" },
  { key: "pmgRate", label: "%PMG_LK (CĐT trả BRE)", type: "percent" },
  { key: "adminFee", label: "Phí admin (CĐT giữ, gồm VAT)", type: "money" },
];

const fmtValue = (v: number, type: "money" | "percent") =>
  type === "money" ? fmtMoney(v) : fmtPct(v);

export default function AdjustmentDialog({
  product,
  action,
}: {
  product: ProductSnapshot;
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, string>>({});
  const [effectiveDate, setEffectiveDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = () => {
    if (checked.size === 0) {
      alert("Chọn ít nhất 1 trường muốn điều chỉnh");
      return;
    }
    const fd = new FormData();
    fd.append("effectiveDate", effectiveDate);
    fd.append("note", note);
    for (const key of checked) {
      fd.append(`change_${key}`, "on");
      fd.append(key, values[key] ?? "");
    }
    start(async () => {
      try {
        await action(fd);
        setOpen(false);
        setChecked(new Set());
        setValues({});
        setNote("");
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Lỗi khi lưu");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
      >
        + Thêm điều chỉnh
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200">
              <div className="text-lg font-bold">Thêm điều chỉnh config căn</div>
              <div className="text-xs text-slate-500 mt-1">
                Chọn field muốn đổi, nhập giá trị mới. App sẽ giữ history và cập
                nhật product config.
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Ngày điều chỉnh *
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Ghi chú
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="input"
                    placeholder="VD: CĐT tăng %HH sau khi bán 5 căn"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-600 mb-2">
                  Trường điều chỉnh
                </div>
                <div className="space-y-1.5">
                  {FIELDS.map((f) => {
                    const isChecked = checked.has(f.key);
                    const currentVal = Number(product[f.key] ?? 0);
                    return (
                      <div
                        key={f.key}
                        className={`flex items-center gap-3 p-2 rounded ${
                          isChecked ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(f.key)}
                          className="scale-110 cursor-pointer"
                        />
                        <label
                          className="flex-1 text-sm cursor-pointer"
                          onClick={() => toggle(f.key)}
                        >
                          {f.label}
                        </label>
                        <div className="text-xs text-slate-500 tabular-nums min-w-24 text-right">
                          {fmtValue(currentVal, f.type)}
                        </div>
                        <span className="text-slate-400">→</span>
                        <div className="min-w-32">
                          {isChecked ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={values[f.key] ?? ""}
                              onChange={(e) =>
                                setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                              }
                              placeholder={
                                f.type === "money"
                                  ? "VD: 25000000"
                                  : `VD: ${(currentVal * 100).toFixed(2)}`
                              }
                              className="input text-xs py-1"
                              autoFocus
                            />
                          ) : (
                            <div className="text-xs text-slate-400 italic">
                              (giữ nguyên)
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm rounded-lg bg-slate-100 hover:bg-slate-200"
                disabled={pending}
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || checked.size === 0}
                className="px-6 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? "Đang lưu..." : `Lưu điều chỉnh (${checked.size} trường)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
