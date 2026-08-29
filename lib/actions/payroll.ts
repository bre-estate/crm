"use server";

import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { and, asc, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { requirePermission } from "@/lib/auth";
import {
  computeHhCoBan,
  computeHhLkDot,
  effectiveRate,
  loadCommissionRows,
  positionToLayout,
  type CommissionRow,
  type PayrollLayout,
} from "@/lib/payroll";

/**
 * Load danh sách nhân viên có thể xuất bảng HH (nvkd/ctv/tpkd/admin/ceo/hr, active).
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
  periodLabel?: string;
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

// ============ CELL HELPERS ============
// Excel cell format: `#,##0` cho tiền, `0.00%` cho %, `@` cho text, `d/m/yyyy` cho ngày.

/** Cell tiền VND — hiển thị 65.212.352 (không thập phân). */
function cellMoney(v: number): XLSX.CellObject {
  return { v: Math.round(v), t: "n", z: "#,##0" };
}

/** Cell % — value giữ decimal (0.07), Excel hiển thị 7,00% hoặc 55,00%. */
function cellPct(v: number): XLSX.CellObject {
  return { v, t: "n", z: "0.00%" };
}

/** Cell text. */
function cellText(v: string): XLSX.CellObject {
  return { v, t: "s" };
}

/** Cell integer (STT). */
function cellInt(v: number): XLSX.CellObject {
  return { v, t: "n" };
}

/** Cell date (from YYYY-MM-DD string) — hiển thị dd/mm/yyyy. */
function cellDate(v: string | null): XLSX.CellObject {
  if (!v) return { v: "", t: "s" };
  const d = new Date(v);
  if (isNaN(d.getTime())) return { v, t: "s" };
  return { v: d, t: "d", z: "dd/mm/yyyy" };
}

// ============ 3 LAYOUT BUILDERS ============

function buildSheetNvkd(
  rows: CommissionRow[],
  employeeName: string,
  period: string,
): XLSX.WorkSheet {
  const HEADER_ROWS: (string | XLSX.CellObject | null)[][] = [
    [cellText("CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE")],
    [cellText("MST: 0318827539")],
    [],
    [],
    [cellText("BẢNG ĐỐI CHIẾU PHÍ MÔI GIỚI")],
    [cellText(`Kỳ đối chiếu: ${period}`)],
    [cellText("Tên NVKD:"), cellText(employeeName)],
    [
      cellText(
        `Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`,
      ),
    ],
    [
      cellText("STT"),
      cellText("Tên khách hàng"),
      cellText("Tên Nhân Viên"),
      cellText("Tên Quản lý"),
      cellText("Dự Án"),
      cellText("Mã căn"),
      cellText("Giá tính phí"),
      cellText("% PMG cơ bản"),
      cellText("% HH của NVKD"),
      cellText("% thu phí đợt này"),
      cellText("Phí hành chính"),
      cellText("Hỗ trợ khách"),
      cellText("Tổng HH cơ bản"),
      cellText("HH lũy kế đợt này"),
      cellText("HH đã trả"),
      cellText("HH còn phải trả đợt này"),
      cellText("Thưởng nóng NVKD"),
      cellText("Cty thưởng QL sàn"),
      cellText("Tổng thu nhập"),
      cellText("HH còn lại đợt sau"),
      cellText("Ghi chú"),
    ],
  ];

  const totalM = { M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0, T: 0 };
  const dataRows: XLSX.CellObject[][] = rows.map((r, i) => {
    const M = computeHhCoBan(r);
    const N = computeHhLkDot(r);
    const O = r.paidLK;
    const P = Math.max(0, N - O);
    const Q = 0;
    const R = 0;
    const S = P + Q + R;
    const T = Math.max(0, M - N);
    totalM.M += M;
    totalM.N += N;
    totalM.O += O;
    totalM.P += P;
    totalM.Q += Q;
    totalM.R += R;
    totalM.S += S;
    totalM.T += T;
    return [
      cellInt(i + 1),
      cellText(r.customerName ?? ""),
      cellText(employeeName),
      cellText(""),
      cellText(r.projectName ?? ""),
      cellText(r.unitCode ?? ""),
      cellMoney(r.pmgBasePrice),
      cellPct(r.pmgLkSaleRate),
      cellPct(r.commissionRate),
      cellPct(r.paymentProgressPct),
      cellMoney(r.adminFeeSale),
      cellMoney(r.customerSupport),
      cellMoney(M),
      cellMoney(N),
      cellMoney(O),
      cellMoney(P),
      cellMoney(Q),
      cellMoney(R),
      cellMoney(S),
      cellMoney(T),
      cellText(r.note ?? ""),
    ];
  });

  const totalRow: XLSX.CellObject[] = [
    cellText(""),
    cellText("TỔNG CỘNG"),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellMoney(totalM.M),
    cellMoney(totalM.N),
    cellMoney(totalM.O),
    cellMoney(totalM.P),
    cellMoney(totalM.Q),
    cellMoney(totalM.R),
    cellMoney(totalM.S),
    cellMoney(totalM.T),
    cellText(""),
  ];

  return sheetFromAoa([...HEADER_ROWS, ...dataRows, totalRow]);
}

function buildSheetTpkd(
  rows: CommissionRow[],
  employeeName: string,
  period: string,
): XLSX.WorkSheet {
  const HEADER_ROWS: (string | XLSX.CellObject | null)[][] = [
    [cellText("CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE")],
    [cellText("MST: 0318827539")],
    [],
    [],
    [cellText("BẢNG ĐỐI CHIẾU PHÍ MÔI GIỚI (KPI TPKD)")],
    [cellText(`Kỳ đối chiếu: ${period}`)],
    [cellText("Tên TPKD:"), cellText(employeeName)],
    [],
    [],
    [
      cellText("STT"),
      cellText("Mã căn"),
      cellText("Dự án"),
      cellText("Giá tính PMG"),
      cellText("% PMG"),
      cellText("% thu PMG LK"),
      cellText("Phí hành chính"),
      cellText("Hỗ trợ khách"),
      cellText("% thưởng KPI TPKD"),
      cellText("KPI lũy kế"),
      cellText("KPI đã thanh toán LK"),
      cellText("KPI còn thanh toán đợt này"),
      cellText("Ngày cọc"),
      cellText("Nhân viên bán căn"),
    ],
  ];

  const totals = { J: 0, K: 0, L: 0 };
  const dataRows: XLSX.CellObject[][] = rows.map((r, i) => {
    // Layout TPKD: rate là kpiRate (4%), formula tương tự nhưng thay commissionRate = kpiRate
    const J = effectiveKpiAmount(r, "tpkd");
    const K = r.paidLK;
    const L = Math.max(0, J - K);
    totals.J += J;
    totals.K += K;
    totals.L += L;
    return [
      cellInt(i + 1),
      cellText(r.unitCode ?? ""),
      cellText(r.projectName ?? ""),
      cellMoney(r.pmgBasePrice),
      cellPct(r.pmgLkSaleRate),
      cellPct(r.paymentProgressPct),
      cellMoney(r.adminFeeSale),
      cellMoney(r.customerSupport),
      cellPct(r.kpiRate),
      cellMoney(J),
      cellMoney(K),
      cellMoney(L),
      cellDate(r.depositDate),
      cellText(r.salesPerson ?? ""),
    ];
  });

  const totalRow: XLSX.CellObject[] = [
    cellText(""),
    cellText("TỔNG CỘNG"),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellMoney(totals.J),
    cellMoney(totals.K),
    cellMoney(totals.L),
    cellText(""),
    cellText(""),
  ];

  return sheetFromAoa([...HEADER_ROWS, ...dataRows, totalRow]);
}

function buildSheetAdmin(
  rows: CommissionRow[],
  employeeName: string,
  period: string,
): XLSX.WorkSheet {
  const HEADER_ROWS: (string | XLSX.CellObject | null)[][] = [
    [cellText("CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE")],
    [cellText("MST: 0318827539")],
    [],
    [],
    [cellText("BẢNG ĐỐI CHIẾU THƯỞNG ADMIN")],
    [cellText(`Kỳ đối chiếu: ${period}`)],
    [cellText("Tên Admin:"), cellText(employeeName)],
    [],
    [
      cellText("STT"),
      cellText("Admin"),
      cellText("Mã căn"),
      cellText("Dự án"),
      cellText("Giá tính phí"),
      cellText("% PMG"),
      cellText("Phí hành chính"),
      cellText("Hỗ trợ khách"),
      cellText("% HH Admin"),
      cellText("Đã thanh toán LK"),
      cellText("Tổng thu nhập đợt này"),
      cellText("Ghi chú"),
    ],
  ];

  const totals = { paid: 0, K: 0 };
  const dataRows: XLSX.CellObject[][] = rows.map((r, i) => {
    // Admin: không phụ thuộc %thu → tính trên full PMG
    const gross = r.pmgBasePrice * r.pmgLkSaleRate;
    const base = Math.max(0, (gross - r.adminFeeSale) / 1.1 - r.customerSupport);
    // Admin rate lưu trong commissionRate hoặc kpiRate — thử kpiRate trước (nếu > 0)
    const adminRate = r.kpiRate > 0 ? r.kpiRate : r.commissionRate;
    const K = Math.max(0, Math.round(base * adminRate - r.paidLK));
    totals.paid += r.paidLK;
    totals.K += K;
    return [
      cellInt(i + 1),
      cellText(employeeName),
      cellText(r.unitCode ?? ""),
      cellText(r.projectName ?? ""),
      cellMoney(r.pmgBasePrice),
      cellPct(r.pmgLkSaleRate),
      cellMoney(r.adminFeeSale),
      cellMoney(r.customerSupport),
      cellPct(adminRate),
      cellMoney(r.paidLK),
      cellMoney(K),
      cellText(r.note ?? ""),
    ];
  });

  const totalRow: XLSX.CellObject[] = [
    cellText(""),
    cellText("TỔNG CỘNG"),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellText(""),
    cellMoney(totals.paid),
    cellMoney(totals.K),
    cellText(""),
  ];

  return sheetFromAoa([...HEADER_ROWS, ...dataRows, totalRow]);
}

/** Effective KPI amount cho layout TPKD/Admin — override amountPayableThisTime nếu 0. */
function effectiveKpiAmount(r: CommissionRow, layout: PayrollLayout): number {
  if (r.amountPayableThisTime > 0) return r.amountPayableThisTime;
  const rate = effectiveRate(r, layout);
  const gross = r.pmgBasePrice * r.pmgLkSaleRate * (r.paymentProgressPct || 1);
  const base = Math.max(0, (gross - r.adminFeeSale) / 1.1 - r.customerSupport);
  return base * rate;
}

/** Build worksheet từ array-of-arrays với cell objects (giữ format). */
function sheetFromAoa(
  aoa: (string | XLSX.CellObject | null | undefined)[][],
): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxR = 0;
  let maxC = 0;
  for (let R = 0; R < aoa.length; R++) {
    const row = aoa[R];
    if (!row) continue;
    for (let C = 0; C < row.length; C++) {
      const cell = row[C];
      if (cell == null) continue;
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (typeof cell === "string") {
        ws[addr] = { v: cell, t: "s" };
      } else {
        ws[addr] = cell;
      }
      if (R > maxR) maxR = R;
      if (C > maxC) maxC = C;
    }
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  return ws;
}
