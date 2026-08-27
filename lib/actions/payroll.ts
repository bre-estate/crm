"use server";

import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { and, asc, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { requirePermission } from "@/lib/auth";
import {
  computeHhCoBan,
  computeHhLkDot,
  loadCommissionRows,
  positionToLayout,
  type CommissionRow,
  type PayrollLayout,
} from "@/lib/payroll";

/**
 * Load danh sách nhân viên có thể xuất bảng HH (nvkd/ctv/tpkd/admin, active).
 */
export async function loadPayrollEmployees() {
  await requirePermission("payroll.commissions", "view");
  const rows = await db
    .select({
      name: employees.name,
      position: employees.position,
    })
    .from(employees)
    .where(and(eq(employees.active, true)))
    .orderBy(asc(employees.name));
  return rows
    .filter((e) => positionToLayout(e.position) !== null)
    .map((e) => ({
      name: e.name,
      position: e.position,
      layout: positionToLayout(e.position) as PayrollLayout,
    }));
}

/**
 * Server action: build Excel + trả về base64 để client trigger download.
 * (Không dùng Response stream vì server action Next 16 return serializable data.)
 */
export async function exportCommissionsExcel(input: {
  employeeName: string;
  layout: PayrollLayout;
  fromDate: string;
  toDate: string;
  periodLabel?: string; // VD "Tháng 08 năm 2026" hoặc "Tháng 7+8 năm 2026"
}): Promise<{ filename: string; base64: string }> {
  await requirePermission("payroll.commissions", "edit");
  const rows = await loadCommissionRows(input);
  const period = input.periodLabel || `Từ ${input.fromDate} đến ${input.toDate}`;

  const wb = XLSX.utils.book_new();
  const ws =
    input.layout === "nvkd"
      ? buildSheetNvkd(rows, input.employeeName, period)
      : input.layout === "tpkd"
        ? buildSheetTpkd(rows, input.employeeName, period)
        : buildSheetAdmin(rows, input.employeeName, period);

  XLSX.utils.book_append_sheet(wb, ws, "SHEET 1");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const base64 = buf.toString("base64");

  const filename = `${input.fromDate.replace(/-/g, "")}_${input.employeeName}_Bang_${labelForLayout(input.layout)}.xlsx`;
  return { filename, base64 };
}

function labelForLayout(l: PayrollLayout): string {
  return l === "nvkd" ? "TTHH" : l === "tpkd" ? "KPI_TPKD" : "HH_Admin";
}

// ============ 3 LAYOUT BUILDERS ============

function buildSheetNvkd(
  rows: CommissionRow[],
  employeeName: string,
  period: string,
): XLSX.WorkSheet {
  const HEADER_ROWS = [
    ["CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE"],
    ["MST: 0318827539"],
    [],
    [],
    ["BẢNG ĐỐI CHIẾU PHÍ MÔI GIỚI"],
    [`Kỳ đối chiếu: ${period}`],
    ["Tên NVKD:", employeeName],
    [`Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`],
    [
      "STT",
      "Tên khách hàng",
      "Tên Nhân Viên",
      "Tên Quản lý",
      "Dự Án",
      "Mã căn",
      "Giá tính phí",
      "% PMG cơ bản",
      "% HH của NVKD",
      "% thu phí đợt này",
      "Phí hành chính",
      "Hỗ trợ khách",
      "Tổng HH cơ bản",
      "HH lũy kế đợt này",
      "HH đã trả",
      "HH còn phải trả đợt này",
      "Thưởng nóng NVKD",
      "Cty thưởng QL sàn",
      "Tổng thu nhập",
      "HH còn lại đợt sau",
      "Ghi chú",
    ],
  ];

  const dataRows = rows.map((r, i) => {
    const M = computeHhCoBan(r);
    const N = computeHhLkDot(r);
    const O = r.paidLK;
    const P = Math.max(0, N - O);
    const Q = 0; // Thưởng nóng — chưa có subtype, để 0 (admin tự fill)
    const R = 0; // CTY thưởng QL — chưa có
    const S = P + Q + R;
    const T = Math.max(0, M - N);
    return [
      i + 1,
      r.customerName ?? "",
      employeeName,
      "",
      r.projectName ?? "",
      r.unitCode ?? "",
      r.pmgBasePrice,
      r.pmgLkSaleRate,
      r.commissionRate,
      r.paymentProgressPct,
      r.adminFeeSale,
      r.customerSupport,
      Math.round(M),
      Math.round(N),
      Math.round(O),
      Math.round(P),
      Q,
      R,
      Math.round(S),
      Math.round(T),
      r.note ?? "",
    ];
  });

  // Tổng cộng row
  const totalRow = [
    "",
    "TỔNG CỘNG",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    sumCol(dataRows, 12),
    sumCol(dataRows, 13),
    sumCol(dataRows, 14),
    sumCol(dataRows, 15),
    sumCol(dataRows, 16),
    sumCol(dataRows, 17),
    sumCol(dataRows, 18),
    sumCol(dataRows, 19),
    "",
  ];

  return XLSX.utils.aoa_to_sheet([...HEADER_ROWS, ...dataRows, totalRow]);
}

function buildSheetTpkd(
  rows: CommissionRow[],
  employeeName: string,
  period: string,
): XLSX.WorkSheet {
  const HEADER_ROWS = [
    ["CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE"],
    ["MST: 0318827539"],
    [],
    [],
    ["BẢNG ĐỐI CHIẾU PHÍ MÔI GIỚI (KPI TPKD)"],
    [`Kỳ đối chiếu: ${period}`],
    ["Tên TPKD:", employeeName],
    [],
    [],
    [
      "STT",
      "Mã căn",
      "Dự án",
      "Giá tính PMG",
      "% PMG",
      "% thu PMG LK",
      "Phí hành chính",
      "Hỗ trợ khách",
      "% thưởng KPI TPKD",
      "KPI lũy kế",
      "KPI đã thanh toán LK",
      "KPI còn thanh toán đợt này",
      "Ngày cọc",
      "Nhân viên bán căn",
    ],
  ];

  const dataRows = rows.map((r, i) => {
    const M = computeHhCoBan(r);
    const N = computeHhLkDot(r);
    const O = r.paidLK;
    const L = Math.max(0, N - O);
    return [
      i + 1,
      r.unitCode ?? "",
      r.projectName ?? "",
      r.pmgBasePrice,
      r.pmgLkSaleRate,
      r.paymentProgressPct,
      r.adminFeeSale,
      r.customerSupport,
      r.commissionRate,
      Math.round(M),
      Math.round(O),
      Math.round(L),
      r.depositDate ?? "",
      r.salesPerson ?? "",
    ];
  });

  const totalRow = [
    "",
    "TỔNG CỘNG",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    sumCol(dataRows, 9),
    sumCol(dataRows, 10),
    sumCol(dataRows, 11),
    "",
    "",
  ];

  return XLSX.utils.aoa_to_sheet([...HEADER_ROWS, ...dataRows, totalRow]);
}

function buildSheetAdmin(
  rows: CommissionRow[],
  employeeName: string,
  period: string,
): XLSX.WorkSheet {
  const HEADER_ROWS = [
    ["CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE"],
    ["MST: 0318827539"],
    [],
    [],
    ["BẢNG ĐỐI CHIẾU THƯỞNG ADMIN"],
    [`Kỳ đối chiếu: ${period}`],
    ["Tên Admin:", employeeName],
    [],
    [
      "STT",
      "Admin",
      "Mã căn",
      "Dự án",
      "Giá tính phí",
      "% PMG",
      "Phí hành chính",
      "Hỗ trợ khách",
      "% HH Admin",
      "Đã thanh toán LK",
      "Tổng thu nhập đợt này",
      "Ghi chú",
    ],
  ];

  const dataRows = rows.map((r, i) => {
    // Admin: KHÔNG có %thu — tính trên full PMG
    const gross = r.pmgBasePrice * r.pmgLkSaleRate;
    const base = Math.max(0, (gross - r.adminFeeSale) / 1.1 - r.customerSupport);
    const K = Math.round(base * r.commissionRate - r.paidLK);
    return [
      i + 1,
      employeeName,
      r.unitCode ?? "",
      r.projectName ?? "",
      r.pmgBasePrice,
      r.pmgLkSaleRate,
      r.adminFeeSale,
      r.customerSupport,
      r.commissionRate,
      Math.round(r.paidLK),
      Math.max(0, K),
      r.note ?? "",
    ];
  });

  const totalRow = [
    "",
    "TỔNG CỘNG",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    sumCol(dataRows, 9),
    sumCol(dataRows, 10),
    "",
  ];

  return XLSX.utils.aoa_to_sheet([...HEADER_ROWS, ...dataRows, totalRow]);
}

function sumCol(rows: (string | number)[][], col: number): number {
  let total = 0;
  for (const r of rows) {
    const v = r[col];
    if (typeof v === "number") total += v;
  }
  return Math.round(total);
}
