/**
 * Dựng workbook Excel theo mẫu HR (sample/HH & KPI/). Pure: nhận PeriodSummary,
 * trả XLSX.WorkBook. Test: tests/period-excel.test.ts.
 */
import * as XLSX from "xlsx";
import { periodMonths, type PeriodSummary } from "@/lib/period-commission-core";

const cellMoney = (v: number): XLSX.CellObject => ({ v: Math.round(v), t: "n", z: "#,##0" });
const cellPct = (v: number): XLSX.CellObject => ({ v, t: "n", z: "0.00%" });
const cellText = (v: string): XLSX.CellObject => ({ v, t: "s" });
const cellInt = (v: number): XLSX.CellObject => ({ v, t: "n" });
const cellDate = (v: string | null): XLSX.CellObject => {
  if (!v) return { v: "", t: "s" };
  const d = new Date(v);
  return isNaN(d.getTime()) ? { v, t: "s" } : { v: d, t: "d", z: "dd/mm/yyyy" };
};

export const positionLabel = (p: string) =>
  p === "nvkd" ? "NVKD" : p === "tpkd" ? "TPKD" : p === "ctv" ? "CTV" : p === "ceo" ? "CEO" : p.toUpperCase();

export const kyLabel = (s: PeriodSummary) => {
  const [m1, m2] = periodMonths(s.ref);
  return `Tháng ${m1}+${m2}/${s.ref.year}`;
};

export const formatDateVi = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${d.getMonth() + 1}/${d.getFullYear()}`;

export type HhSaleRow = {
  stt: number;
  name: string;
  contract: string;
  position: string;
  revenue: number;
  rate: number;
  bonus: number;
  paid: number;
  remaining: number;
  note: string;
};

/** Dòng dữ liệu "Bảng HH Sale" (để test + để dựng sheet). */
export function hhSaleRows(s: PeriodSummary): HhSaleRow[] {
  return s.nvkd
    .filter((r) => r.role !== null)
    .map((r, i) => ({
      stt: i + 1,
      name: r.name,
      contract: r.position === "ctv" ? "CTV" : "HĐLĐ",
      position: positionLabel(r.position),
      revenue: r.revenue,
      rate: r.expectedRate ?? 0,
      bonus: r.bonus,
      paid: 0,
      remaining: r.bonus,
      note: r.position === "tpkd" ? "Quản lý" : r.diff !== 0 ? `Chênh HH ${r.diff.toLocaleString("vi-VN")}` : "",
    }));
}

/** "Bảng HH Sale" — sheet "ty le hh". */
export function buildHhSaleWorkbook(s: PeriodSummary, today = new Date()): XLSX.WorkBook {
  const rows = hhSaleRows(s);
  const totalBonus = rows.reduce((a, r) => a + r.bonus, 0);
  const aoa: (XLSX.CellObject | string | null)[][] = [
    ["CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE"],
    ["BẢNG TÍNH TỶ LỆ HOA HỒNG VÀ THƯỞNG DOANH SỐ"],
    [null, null, null, null, "Kỳ:", kyLabel(s)],
    [null, null, null, null, "Ngày lập:", formatDateVi(today)],
    [null, null, null, null, "TỔNG CỘNG:", null, cellMoney(totalBonus), cellMoney(0), cellMoney(totalBonus)],
    [
      "STT",
      "Tên NVKD",
      "Loại hợp đồng",
      "Chức vụ",
      "Doanh thu sản phẩm đã cọc (VNĐ)",
      "% Hoa hồng NVKD",
      `Thưởng doanh số ${kyLabel(s).toLowerCase()}`,
      "Đã thanh toán",
      "Còn phải thanh toán",
      "Ghi chú",
    ],
    ...rows.map((r) => [
      cellInt(r.stt),
      cellText(r.name),
      cellText(r.contract),
      cellText(r.position),
      cellMoney(r.revenue),
      cellPct(r.rate),
      cellMoney(r.bonus),
      cellMoney(r.paid),
      cellMoney(r.remaining),
      cellText(r.note),
    ]),
    [],
    [],
    [null, null, null, null, null, "TỔNG GIÁM ĐỐC"],
    [],
    [],
    [],
    [null, null, null, null, null, "ĐOÀN LÊ BÁCH"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [5, 28, 14, 10, 24, 14, 22, 16, 18, 20].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ty le hh");
  return wb;
}

const safeSheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);

/** "Quyết định KPI TPKD" — 1 sheet / phòng có TPKD. Throw nếu kỳ không có phòng. */
export function buildKpiTpkdWorkbook(s: PeriodSummary, today = new Date()): XLSX.WorkBook {
  const depts = s.depts.filter((d) => d.units.length > 0);
  if (depts.length === 0) throw new Error("Kỳ này chưa có căn thuộc phòng kinh doanh nào");
  const wb = XLSX.utils.book_new();
  for (const d of depts) {
    const aoa: (XLSX.CellObject | string | null)[][] = [
      [null, null, null, "CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE"],
      [null, null, null, "Địa chỉ: 65/6 Nguyễn Xí, P. 26, Q. Bình Thạnh"],
      [null, null, null, "MST: 0318622404"],
      [],
      ["QUYẾT ĐỊNH VỀ MỨC % THƯỞNG KPI CHO TRƯỞNG PHÒNG KINH DOANH"],
      [null, null, null, "Kỳ đối chiếu:", null, kyLabel(s)],
      [null, null, null, "Ngày lập:", null, formatDateVi(today)],
      [],
      ["Căn cứ theo chính sách thưởng của Công ty dành cho Trưởng phòng kinh doanh."],
      [`Căn cứ theo kết quả thực hiện trong kỳ của phòng ${d.deptName}.`],
      [`Mức thưởng KPI của trưởng phòng kinh doanh trong kỳ là ${(d.expectedRate * 100).toFixed(0)}% trên doanh thu.`],
      [],
      ["PHÒNG :", null, d.deptName.toUpperCase()],
      ["TÊN TPKD: ", null, (d.leaderName ?? "").toUpperCase(), null, null, cellMoney(d.revenue)],
      ["MÃ SP", "MÃ SP", "DỰ ÁN", "TÊN NHÂN VIÊN", "NGÀY CỌC", "DOANH THU", "% KPI "],
      ...d.units.map((u, i) => [
        cellInt(i + 1),
        cellText(u.unitCode),
        cellText((u.projectName ?? "").toUpperCase()),
        cellText(u.ownerName.toUpperCase()),
        cellDate(u.depositDate),
        cellMoney(u.revenue),
        cellPct(d.expectedRate),
      ]),
      [],
      ["Giao phòng Kế toán và Phòng Nhân sự thực hiện quyết định này."],
      [],
      [null, null, null, null, "TỔNG GIÁM ĐỐC"],
      [null, null, null, null, "ĐOÀN LÊ BÁCH"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [8, 14, 30, 28, 14, 18, 10].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(d.deptName));
  }
  return wb;
}

export function workbookToBase64(wb: XLSX.WorkBook): string {
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf.toString("base64");
}
