"use client";

import { useMemo, useState, useTransition } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtDate, fmtPct } from "@/lib/format";
import { exportCommissionsExcel } from "@/lib/actions/payroll";
import type { PayrollLayout } from "@/lib/payroll";
import { toast } from "sonner";

type Employee = { name: string; position: string; layout: PayrollLayout };

const LAYOUT_LABEL: Record<PayrollLayout, string> = {
  nvkd: "Bảng TTHH NVKD",
  tpkd: "Bảng KPI TPKD",
  admin: "Bảng HH Admin",
};

const POSITION_LABEL: Record<string, string> = {
  nvkd: "NVKD",
  tpkd: "TPKD",
  admin: "Admin",
  ctv: "CTV",
};

export default function PayrollCommissionsClient({ employees }: { employees: Employee[] }) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const defaultFrom = `${y}-${String(m).padStart(2, "0")}-01`;
  const defaultTo = new Date(y, m, 0).toISOString().slice(0, 10);

  const [employeeName, setEmployeeName] = useState("");
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [periodLabel, setPeriodLabel] = useState(`Tháng ${m} năm ${y}`);
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [pending, start] = useTransition();

  const selectedEmp = useMemo(
    () => employees.find((e) => e.name === employeeName),
    [employees, employeeName],
  );

  const options = employees.map((e) => ({
    value: e.name,
    label: e.name,
    sublabel: `${POSITION_LABEL[e.position] ?? e.position} · ${LAYOUT_LABEL[e.layout]}`,
  }));

  const handlePreview = () => {
    if (!selectedEmp) return toast.error("Chọn nhân viên trước");
    start(async () => {
      try {
        const rows = await fetchPreview({
          employeeName: selectedEmp.name,
          layout: selectedEmp.layout,
          fromDate,
          toDate,
        });
        setPreviewRows(rows);
        if (rows.length === 0) toast.info("Không có dòng đối chiếu trong kỳ này");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const handleDownload = () => {
    if (!selectedEmp) return toast.error("Chọn nhân viên trước");
    start(async () => {
      try {
        const { filename, base64 } = await exportCommissionsExcel({
          employeeName: selectedEmp.name,
          layout: selectedEmp.layout,
          fromDate,
          toDate,
          periodLabel,
        });
        // Trigger download từ base64
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Đã xuất ${filename}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 gap-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Nhân viên</label>
            <SearchableSelect
              value={employeeName}
              onChange={setEmployeeName}
              options={options}
              placeholder="Chọn NV..."
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Từ ngày</label>
            <DatePicker value={fromDate} onChange={setFromDate} className="w-full" />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Đến ngày</label>
            <DatePicker value={toDate} onChange={setToDate} className="w-full" />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">
              Nhãn kỳ (in trên bảng)
            </label>
            <input
              type="text"
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              className="input w-full"
              placeholder="VD: Tháng 08 năm 2026"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            onClick={handlePreview}
            disabled={pending || !employeeName}
            className="h-[36px] px-4 bg-slate-100 text-slate-900 border border-slate-300 hover:bg-slate-200"
          >
            {pending ? "Đang xử lý..." : "Xem trước"}
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={pending || !employeeName}
            className="h-[36px] px-4 bg-orange-500 hover:bg-orange-600 text-white"
          >
            📥 Tải Excel
          </Button>
          {selectedEmp && (
            <span className="text-xs text-slate-500 self-center ml-2">
              Layout: <b>{LAYOUT_LABEL[selectedEmp.layout]}</b>
            </span>
          )}
        </div>
      </Card>

      {previewRows && (
        <Card className="p-0 gap-0 overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between text-sm">
            <div>
              <span className="font-semibold">{previewRows.length}</span> dòng đối chiếu
            </div>
            <div className="text-slate-500">
              Tổng HH LK đợt này:{" "}
              <span className="font-semibold text-slate-800 tabular-nums">
                {fmtMoney(previewRows.reduce((s, r) => s + r.amountLK, 0))}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="text-left p-2">Mã căn</th>
                  <th className="text-left p-2">Dự án</th>
                  <th className="text-left p-2">Loại</th>
                  <th className="text-right p-2">Giá PMG</th>
                  <th className="text-right p-2">%PMG</th>
                  <th className="text-right p-2">%HH</th>
                  <th className="text-right p-2">%Thu</th>
                  <th className="text-right p-2">HH LK đợt này</th>
                  <th className="text-right p-2">Đã trả LK</th>
                  <th className="text-right p-2">Còn phải trả</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.reconId} className="border-t border-slate-100">
                    <td className="p-2 font-mono text-xs">{r.unitCode ?? "—"}</td>
                    <td className="p-2 text-xs">{r.projectName ?? "—"}</td>
                    <td className="p-2 text-xs">{r.costType}</td>
                    <td className="p-2 text-right tabular-nums text-xs">
                      {fmtMoney(r.pmgBasePrice)}
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs">
                      {fmtPct(r.pmgLkSaleRate, 2)}
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs">
                      {fmtPct(r.commissionRate, 2)}
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs">
                      {r.paymentProgressPct > 0 ? fmtPct(r.paymentProgressPct, 0) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold">
                      {fmtMoney(r.amountLK)}
                    </td>
                    <td className="p-2 text-right tabular-nums text-green-700">
                      {r.paidLK > 0 ? fmtMoney(r.paidLK) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-red-600">
                      {fmtMoney(Math.max(0, r.amountLK - r.paidLK))}
                    </td>
                  </tr>
                ))}
                {previewRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-slate-500 text-sm">
                      Không có dòng đối chiếu trong kỳ này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

type PreviewRow = {
  reconId: number;
  unitCode: string | null;
  projectName: string | null;
  costType: string;
  pmgBasePrice: number;
  pmgLkSaleRate: number;
  commissionRate: number;
  paymentProgressPct: number;
  amountLK: number;
  paidLK: number;
};

async function fetchPreview(input: {
  employeeName: string;
  layout: PayrollLayout;
  fromDate: string;
  toDate: string;
}): Promise<PreviewRow[]> {
  // Reuse export server action nhưng chỉ lấy rows (không build Excel).
  // Sinh 1 dummy layout để load rows rồi map ra preview.
  const { loadPayrollPreview } = await import("@/lib/actions/payroll-preview");
  return loadPayrollPreview(input);
}
