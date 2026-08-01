"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BulkProductRow } from "@/lib/actions/products";
import SearchableSelect from "@/components/SearchableSelect";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ProjectOpt = {
  id: number;
  code: string;
  name: string;
  partnerName: string | null;
};

type DeptOpt = {
  id: number;
  code: string;
  name: string;
};

type SaleType = "primary" | "secondary";

// ============ Helpers parse ============
function splitColumn(raw: string): string[] {
  const s = raw.replace(/\r\n?/g, "\n").split("\n").map((x) => x.trim());
  while (s.length > 0 && s[s.length - 1] === "") s.pop();
  return s;
}

function parseMoney(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

// Trả về decimal (0.055) từ input "5.5" / "5,5" / "5,5%" / "0.055"
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

// Lookup helper: normalize project/dept name để so
function normalize(s: string): string {
  return s.replace(/[\s.\-_]/g, "").toLowerCase();
}

// ============ Component ============

export default function BulkProductForm({
  projects,
  departments,
  onSave,
}: {
  projects: ProjectOpt[];
  departments: DeptOpt[];
  onSave: (rows: BulkProductRow[]) => Promise<{
    ok: number;
    createdIds: number[];
    errors: { index: number; message: string }[];
  }>;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const [saleType, setSaleType] = useState<SaleType>("primary");
  const isSecondary = saleType === "secondary";

  // 1 lần bulk = 1 dự án. Chọn ở dropdown, KHÔNG paste cột.
  const [projectId, setProjectId] = useState<string>("");
  const [defaultDepositDate, setDefaultDepositDate] = useState<string>("");

  // Cột paste (bỏ Dự án — dùng dropdown ở trên)
  const [colUnit, setColUnit] = useState("");
  const [colCustomer, setColCustomer] = useState("");
  const [colSales, setColSales] = useState("");
  const [colDept, setColDept] = useState("");
  const [colPayMethod, setColPayMethod] = useState("");
  const [colDeposit, setColDeposit] = useState("");
  const [colPmgBase, setColPmgBase] = useState("");
  const [colPmgRate, setColPmgRate] = useState("");
  const [colPmgSaleRate, setColPmgSaleRate] = useState("");
  const [colAdmin, setColAdmin] = useState("");
  const [colCdtSale, setColCdtSale] = useState("");
  const [colCdtMgr, setColCdtMgr] = useState("");
  const [colHhSale, setColHhSale] = useState("");
  const [colCtySale, setColCtySale] = useState("");
  const [colCtyMgr, setColCtyMgr] = useState("");
  const [colNote, setColNote] = useState("");

  // ============ Lookup maps ============
  const deptByKey = useMemo(() => {
    const m = new Map<string, DeptOpt>();
    for (const d of departments) {
      m.set(normalize(d.name), d);
      m.set(normalize(d.code), d);
    }
    return m;
  }, [departments]);

  const cols = useMemo(
    () => ({
      unit: splitColumn(colUnit),
      customer: splitColumn(colCustomer),
      sales: splitColumn(colSales),
      dept: splitColumn(colDept),
      payMethod: splitColumn(colPayMethod),
      deposit: splitColumn(colDeposit),
      pmgBase: splitColumn(colPmgBase),
      pmgRate: splitColumn(colPmgRate),
      pmgSaleRate: splitColumn(colPmgSaleRate),
      admin: splitColumn(colAdmin),
      cdtSale: splitColumn(colCdtSale),
      cdtMgr: splitColumn(colCdtMgr),
      hhSale: splitColumn(colHhSale),
      ctySale: splitColumn(colCtySale),
      ctyMgr: splitColumn(colCtyMgr),
      note: splitColumn(colNote),
    }),
    [
      colUnit, colCustomer, colSales, colDept, colPayMethod,
      colDeposit, colPmgBase, colPmgRate, colPmgSaleRate, colAdmin, colCdtSale, colCdtMgr,
      colHhSale, colCtySale, colCtyMgr, colNote,
    ],
  );

  const nRows = cols.unit.length;

  // ============ Preview: parse thành BulkProductRow[] ============
  const preview = useMemo(() => {
    const out: {
      row: BulkProductRow;
      raw: { dept: string };
      warnings: string[];
    }[] = [];
    const pid = projectId ? Number(projectId) : 0;
    for (let i = 0; i < nRows; i++) {
      const warnings: string[] = [];
      const unit = cols.unit[i];
      if (!unit) continue;

      if (!pid) warnings.push("Chưa chọn dự án");

      // Department: optional
      const deptRaw = cols.dept[i] ?? "";
      let departmentId: number | null = null;
      if (deptRaw) {
        const found = deptByKey.get(normalize(deptRaw));
        if (found) departmentId = found.id;
        else warnings.push(`Không tìm thấy phòng "${deptRaw}"`);
      }

      const row: BulkProductRow = {
        projectId: pid,
        unitCode: unit,
        saleType,
        customerName: cols.customer[i] || null,
        salesPerson: cols.sales[i] || null,
        departmentId,
        paymentMethod: cols.payMethod[i] || null,
        depositDate: cols.deposit[i] ? parseDate(cols.deposit[i]) : defaultDepositDate || null,
        pmgBasePrice: cols.pmgBase[i] ? parseMoney(cols.pmgBase[i]) : 0,
        pmgRate: cols.pmgRate[i] ? parsePctDecimal(cols.pmgRate[i]) : 0,
        pmgSaleRate: cols.pmgSaleRate[i] ? parsePctDecimal(cols.pmgSaleRate[i]) : 0,
        adminFee: cols.admin[i] ? parseMoney(cols.admin[i]) : 0,
        cdtBonusSale: cols.cdtSale[i] ? parseMoney(cols.cdtSale[i]) : 0,
        cdtBonusManager: cols.cdtMgr[i] ? parseMoney(cols.cdtMgr[i]) : 0,
        saleCommissionRate: cols.hhSale[i] ? parsePctDecimal(cols.hhSale[i]) : 0,
        bonusSale: cols.ctySale[i] ? parseMoney(cols.ctySale[i]) : 0,
        bonusManager: cols.ctyMgr[i] ? parseMoney(cols.ctyMgr[i]) : 0,
        note: cols.note[i] || undefined,
      };
      out.push({
        row,
        raw: { dept: deptRaw },
        warnings,
      });
    }
    return out;
  }, [nRows, cols, projectId, deptByKey, defaultDepositDate, saleType]);

  const validCount = preview.filter((p) => p.warnings.length === 0 && p.row.projectId > 0).length;
  const totalWarnings = preview.reduce((s, p) => s + p.warnings.length, 0);

  const submit = () => {
    const validRows = preview
      .filter((p) => p.row.projectId > 0 && p.row.unitCode)
      .map((p) => p.row);
    if (validRows.length === 0) {
      toast.error("Không có dòng hợp lệ", {
        description: "Cần Dự án + Mã căn cho mỗi dòng",
      });
      return;
    }
    if (totalWarnings > 0) {
      const ok = confirm(
        `Có ${totalWarnings} cảnh báo trong ${preview.length} dòng. ${validRows.length} dòng sẽ được lưu. Tiếp tục?`,
      );
      if (!ok) return;
    }
    start(async () => {
      try {
        const res = await onSave(validRows);
        if (res.errors.length > 0) {
          toast.error(`Đã tạo ${res.ok} căn, ${res.errors.length} lỗi`, {
            description: res.errors
              .slice(0, 5)
              .map((e) => `Dòng ${e.index + 1}: ${e.message}`)
              .join(" · "),
          });
        } else {
          toast.success(`Đã tạo ${res.ok} căn`);
          const qs =
            res.createdIds.length > 0
              ? `?justCreated=${res.createdIds.join(",")}`
              : "";
          router.push(`/products${qs}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  };

  const clearAll = () => {
    if (!confirm("Xóa hết dữ liệu đã paste?")) return;
    setColUnit("");
    setColCustomer("");
    setColSales("");
    setColDept("");
    setColPayMethod("");
    setColDeposit("");
    setColPmgBase("");
    setColPmgRate("");
    setColPmgSaleRate("");
    setColAdmin("");
    setColCdtSale("");
    setColCdtMgr("");
    setColHhSale("");
    setColCtySale("");
    setColCtyMgr("");
    setColNote("");
  };

  return (
    <div className="space-y-4">
      {/* Sale type toggle */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 flex items-center gap-4">
        <div className="text-sm font-semibold">Loại giao dịch:</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSaleType("primary")}
            className={`px-4 py-2 rounded-lg text-sm border ${saleType === "primary" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
          >
            Sơ cấp
          </button>
          <button
            type="button"
            onClick={() => setSaleType("secondary")}
            className={`px-4 py-2 rounded-lg text-sm border ${saleType === "secondary" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
          >
            Thứ cấp
          </button>
        </div>
      </div>

      {isSecondary && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
          Nhập hàng loạt giao dịch <b>Thứ cấp</b> sẽ làm sau. Tạm thời dùng
          form đơn <a href="/products/new" className="underline">Thêm giao dịch</a>.
        </div>
      )}

      {!isSecondary && (
        <>
          {/* Hướng dẫn */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
            <div className="font-semibold mb-1">Cách dùng</div>
            <div className="text-xs">
              Mở file Excel/Google Sheet → chọn cột (VD "Mã căn") → Ctrl+C →
              paste vào ô "Mã căn" bên dưới. Lặp lại cho từng cột. Các cột
              phải có <b>cùng số dòng</b> và thứ tự khớp nhau.
              Cột <span className="text-red-600 font-semibold">Mã căn *</span>
              {" "}bắt buộc; dự án có thể để chung 1 cột hoặc dùng default áp cho tất cả.
            </div>
          </div>

          {/* Dự án (bắt buộc, áp cho toàn bộ dòng paste) + Ngày cọc default */}
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
                Ngày cọc mặc định (nếu không paste cột)
              </label>
              <input
                type="date"
                value={defaultDepositDate}
                onChange={(e) => setDefaultDepositDate(e.target.value)}
                className="input"
              />
            </div>
          </div>

          {/* Paste columns */}
          <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <ColTextarea
                label="Mã căn"
                value={colUnit}
                onChange={setColUnit}
                placeholder="A.10.10 B.03.16 ..."
                required
              />
              <ColTextarea
                label="Khách hàng"
                value={colCustomer}
                onChange={setColCustomer}
                placeholder="Nguyễn Văn A ..."
              />
              <ColTextarea
                label="NVKD"
                value={colSales}
                onChange={setColSales}
                placeholder="Trần Thị B ..."
              />
              <ColTextarea
                label="Phòng"
                value={colDept}
                onChange={setColDept}
                placeholder="Hồ Gia ..."
                hint="Tên phòng KD"
              />
              <ColTextarea
                label="Phương thức TT"
                value={colPayMethod}
                onChange={setColPayMethod}
                placeholder="Chuyển khoản ..."
              />
              <ColTextarea
                label="Ngày cọc"
                value={colDeposit}
                onChange={setColDeposit}
                placeholder="24/06/2026 ..."
              />
              <ColTextarea
                label="Giá tính PMG"
                value={colPmgBase}
                onChange={setColPmgBase}
                placeholder="1.834.415.215 ..."
              />
              <ColTextarea
                label="%PMG_LK"
                value={colPmgRate}
                onChange={setColPmgRate}
                placeholder="7% 7% ..."
                hint="CĐT trả BRE"
              />
              <ColTextarea
                label="%PMG_LK_Sale"
                value={colPmgSaleRate}
                onChange={setColPmgSaleRate}
                placeholder="7% 7% ..."
                hint="Base tính HH sale + KPI"
              />
              <ColTextarea
                label="Phí admin"
                value={colAdmin}
                onChange={setColAdmin}
                placeholder="3.850.000 ..."
              />
              <ColTextarea
                label="CĐT thưởng sale"
                value={colCdtSale}
                onChange={setColCdtSale}
                placeholder="22.000.000 ..."
              />
              <ColTextarea
                label="CĐT thưởng QL"
                value={colCdtMgr}
                onChange={setColCdtMgr}
                placeholder="0 ..."
              />
              <ColTextarea
                label="%HH Sale"
                value={colHhSale}
                onChange={setColHhSale}
                placeholder="50% 55% ..."
              />
              <ColTextarea
                label="CTY thưởng NVKD"
                value={colCtySale}
                onChange={setColCtySale}
                placeholder="0 ..."
              />
              <ColTextarea
                label="CTY thưởng QL"
                value={colCtyMgr}
                onChange={setColCtyMgr}
                placeholder="0 ..."
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
                  <b>{nRows}</b> dòng đã paste · <b>{validCount}</b> hợp lệ ·{" "}
                  {totalWarnings > 0 && (
                    <span className="text-amber-700">{totalWarnings} cảnh báo</span>
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
              <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2 whitespace-nowrap">Mã căn</th>
                      <th className="text-left p-2 whitespace-nowrap">Khách</th>
                      <th className="text-left p-2 whitespace-nowrap">NVKD</th>
                      <th className="text-left p-2 whitespace-nowrap">Phòng</th>
                      <th className="text-left p-2 whitespace-nowrap">PT TT</th>
                      <th className="text-left p-2 whitespace-nowrap">Ngày cọc</th>
                      <th className="text-right p-2 whitespace-nowrap">Giá PMG</th>
                      <th className="text-right p-2">%PMG</th>
                      <th className="text-right p-2">%PMG Sale</th>
                      <th className="text-right p-2 whitespace-nowrap">Admin</th>
                      <th className="text-right p-2 whitespace-nowrap">CĐT sale</th>
                      <th className="text-right p-2 whitespace-nowrap">CĐT QL</th>
                      <th className="text-right p-2">%HH</th>
                      <th className="text-right p-2 whitespace-nowrap">CTY NVKD</th>
                      <th className="text-right p-2 whitespace-nowrap">CTY QL</th>
                      <th className="text-left p-2">Cảnh báo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => {
                      const deptName = p.row.departmentId
                        ? departments.find((d) => d.id === p.row.departmentId)?.name
                        : p.raw.dept || "—";
                      const bad = p.warnings.length > 0;
                      return (
                        <tr
                          key={i}
                          className={`border-t border-slate-100 ${bad ? "bg-amber-50" : ""}`}
                        >
                          <td className="p-2 text-slate-400">{i + 1}</td>
                          <td className="p-2 font-mono">{p.row.unitCode}</td>
                          <td className="p-2">{p.row.customerName ?? "—"}</td>
                          <td className="p-2">{p.row.salesPerson ?? "—"}</td>
                          <td className="p-2">{deptName ?? "—"}</td>
                          <td className="p-2">{p.row.paymentMethod ?? "—"}</td>
                          <td className="p-2 whitespace-nowrap">
                            {p.row.depositDate ?? "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {p.row.pmgBasePrice > 0
                              ? p.row.pmgBasePrice.toLocaleString("vi-VN")
                              : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {p.row.pmgRate > 0
                              ? (p.row.pmgRate * 100).toFixed(2) + "%"
                              : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {(p.row.pmgSaleRate ?? 0) > 0
                              ? ((p.row.pmgSaleRate ?? 0) * 100).toFixed(2) + "%"
                              : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {p.row.adminFee > 0
                              ? p.row.adminFee.toLocaleString("vi-VN")
                              : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {p.row.cdtBonusSale > 0
                              ? p.row.cdtBonusSale.toLocaleString("vi-VN")
                              : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {p.row.cdtBonusManager > 0
                              ? p.row.cdtBonusManager.toLocaleString("vi-VN")
                              : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {(p.row.saleCommissionRate ?? 0) > 0
                              ? ((p.row.saleCommissionRate ?? 0) * 100).toFixed(2) + "%"
                              : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {(p.row.bonusSale ?? 0) > 0
                              ? (p.row.bonusSale ?? 0).toLocaleString("vi-VN")
                              : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {(p.row.bonusManager ?? 0) > 0
                              ? (p.row.bonusManager ?? 0).toLocaleString("vi-VN")
                              : "—"}
                          </td>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/products")}
              disabled={pending}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending || validCount === 0}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {pending
                ? "Đang lưu..."
                : `Lưu ${validCount} căn`}
            </Button>
          </div>
        </>
      )}
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
  const nLines = value.trim() === "" ? 0 : value.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim()).length;
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
