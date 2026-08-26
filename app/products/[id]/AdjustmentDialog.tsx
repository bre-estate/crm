"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney, fmtPct } from "@/lib/format";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PercentInput from "@/components/PercentInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ProductSnapshot = {
  id: number;
  pmgBasePrice: number;
  pmgRate: number;
  adminFee: number;
  saleCommissionRate: number;
  kpiCeoRate: number;
  kpiTpkdRate: number;
  kpiAdminRate: number;
};

type FieldDef = {
  key: keyof Omit<ProductSnapshot, "id">;
  label: string;
  type: "money" | "percent";
};

// Mọi field ảnh hưởng đối chiếu — khi căn đã có recon, phải qua đây (giữ history).
const FIELDS: FieldDef[] = [
  { key: "pmgBasePrice", label: "Giá tính PMG (= giá bán căn)", type: "money" },
  { key: "pmgRate", label: "%PMG_LK (CĐT trả BRE)", type: "percent" },
  { key: "adminFee", label: "Phí admin (CĐT giữ, gồm VAT)", type: "money" },
  { key: "saleCommissionRate", label: "%HH sale (NVKD)", type: "percent" },
  { key: "kpiTpkdRate", label: "%KPI TPKD", type: "percent" },
  { key: "kpiCeoRate", label: "%KPI CEO", type: "percent" },
  { key: "kpiAdminRate", label: "%KPI Admin", type: "percent" },
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
      toast.error("Chọn ít nhất 1 trường muốn điều chỉnh");
      return;
    }
    // Guard: ô check nhưng bỏ trống / gõ 0 → chặn (bug hôm nay 655: user
    // check %PMG_LK nhưng gõ nhầm empty → server toPct("") = 0 → lưu 0%).
    const empty: string[] = [];
    for (const key of checked) {
      const raw = (values[key] ?? "").trim();
      if (!raw) empty.push(key);
    }
    if (empty.length > 0) {
      const labels = empty
        .map((k) => FIELDS.find((f) => f.key === k)?.label ?? k)
        .join(", ");
      toast.error("Chưa nhập giá trị", {
        description: `Bỏ tick hoặc điền: ${labels}`,
      });
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
        toast.error(e instanceof Error ? e.message : "Lỗi khi lưu");
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-orange-500 hover:bg-orange-600 text-white whitespace-nowrap"
      >
        + Thêm
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Thêm điều chỉnh config căn
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Chọn field muốn đổi, nhập giá trị mới. App sẽ giữ history và cập
              nhật product config.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
                          f.type === "percent" ? (
                            <PercentInput
                              value={values[f.key] ?? ""}
                              onChange={(e) =>
                                setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                              }
                              placeholder={`VD: ${(currentVal * 100).toFixed(2)}`}
                              className="input text-xs py-1"
                              autoComplete="off"
                              data-1p-ignore
                              data-lpignore="true"
                              data-form-type="other"
                              autoFocus
                            />
                          ) : (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={values[f.key] ?? ""}
                              onChange={(e) =>
                                setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                              }
                              placeholder="VD: 25000000"
                              className="input text-xs py-1"
                              autoComplete="off"
                              data-1p-ignore
                              data-lpignore="true"
                              data-form-type="other"
                              autoFocus
                            />
                          )
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
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 mt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending || checked.size === 0}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {pending ? "Đang lưu..." : `Lưu điều chỉnh (${checked.size} trường)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
