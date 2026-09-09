"use server";

import { db } from "@/lib/db";
import { costReconciliations } from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { costTypeLabel } from "@/lib/format";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import {
  loadAllContext,
  summarizePeriod,
  periodMonths,
  type PeriodSummary,
} from "@/lib/period-commission";

const fmtPctVi = (v: number) => `${(v * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/**
 * Tạo đối chiếu hồi tố (hoặc hoàn chi dư) cho các ĐC có chênh trong kỳ.
 * Quy tắc: không sửa ĐC cũ, tạo ĐC mới amount = chênh, rate = rate mong đợi,
 * N / M / phí admin sao chép từ ĐC gốc. Note tự động chứa "từ ĐC #id" để nhận diện.
 */
export async function createRetroRecons(
  periodKey: string,
  reconIds: number[] | "all",
): Promise<{ created: number; skipped: number }> {
  await requirePermission("periods", "edit");
  const ctx = await loadAllContext();
  const summary = summarizePeriod(ctx, periodKey);
  if (!summary) throw new Error("Kỳ không hợp lệ");

  const wanted = summary.retro.filter(
    (r) => !r.alreadyRetro && (reconIds === "all" || reconIds.includes(r.reconId)),
  );
  const srcById = new Map(ctx.recons.map((r) => [r.id, r]));
  const today = new Date().toISOString().slice(0, 10);
  let created = 0;

  for (const item of wanted) {
    const src = srcById.get(item.reconId);
    if (!src) continue;
    const isSale = item.costType === "sale_commission";
    const kind = item.diff > 0 ? "Hồi tố" : "Hoàn chi dư";
    const note = `${kind} kỳ ${periodKey}: ${fmtPctVi(item.actualRate)} → ${fmtPctVi(item.expectedRate)} (từ ĐC #${item.reconId})`;
    const data: typeof costReconciliations.$inferInsert = {
      productId: item.productId,
      reconciliationDate: today,
      employeeName: item.employeeName,
      costType: item.costType as typeof costReconciliations.$inferInsert.costType,
      pmgBasePriceSale: src.pmgBasePriceSale,
      pmgLkSaleRate: src.pmgLkSaleRate,
      commissionRate: isSale ? item.expectedRate : src.commissionRate,
      kpiRate: isSale ? src.kpiRate : item.expectedRate,
      adminFeeSale: src.adminFeeSale,
      customerSupport: src.customerSupport,
      paymentProgressPct: src.paymentProgressPct,
      amountPayableThisTime: item.diff,
      kpiAmount: isSale ? 0 : item.diff,
      fiscalYear: Number(periodKey.slice(0, 4)),
      note,
    };
    const [rec] = await db
      .insert(costReconciliations)
      .values(data)
      .returning({ id: costReconciliations.id });
    await logActivity({
      entityType: "cost_reconciliation",
      entityId: rec.id,
      productId: item.productId,
      action: "create",
      after: data as Record<string, unknown>,
      summary: `${kind} ${costTypeLabel(item.costType)} cho ${item.employeeName} — ${item.diff.toLocaleString("vi-VN")} (kỳ ${periodKey})`,
    });
    created++;
  }

  revalidatePath("/periods");
  revalidatePath(`/periods/${periodKey}`);
  revalidatePath("/costs");
  const requested = reconIds === "all" ? summary.retro.filter((r) => !r.alreadyRetro).length : reconIds.length;
  return { created, skipped: requested - created };
}

// ───────────── Excel export theo mẫu HR ─────────────

const cellMoney = (v: number): XLSX.CellObject => ({ v: Math.round(v), t: "n", z: "#,##0" });
const cellPct = (v: number): XLSX.CellObject => ({ v, t: "n", z: "0.00%" });
const cellText = (v: string): XLSX.CellObject => ({ v, t: "s" });
const cellInt = (v: number): XLSX.CellObject => ({ v, t: "n" });
const cellDate = (v: string | null): XLSX.CellObject => {
  if (!v) return { v: "", t: "s" };
  const d = new Date(v);
  return isNaN(d.getTime()) ? { v, t: "s" } : { v: d, t: "d", z: "dd/mm/yyyy" };
};
const todayVi = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${d.getMonth() + 1}/${d.getFullYear()}`;
};
const kyLabel = (s: PeriodSummary) => {
  const [m1, m2] = periodMonths(s.ref);
  return `Tháng ${m1}+${m2}/${s.ref.year}`;
};
const positionLabel = (p: string) =>
  p === "nvkd" ? "NVKD" : p === "tpkd" ? "TPKD" : p === "ctv" ? "CTV" : p === "ceo" ? "CEO" : p.toUpperCase();

async function loadSummaryOrThrow(periodKey: string) {
  const ctx = await loadAllContext();
  const s = summarizePeriod(ctx, periodKey);
  if (!s) throw new Error("Kỳ không hợp lệ");
  return s;
}

function toBase64(wb: XLSX.WorkBook): string {
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf.toString("base64");
}

/** "Bảng HH Sale" — mẫu sample/HH & KPI/Bảng HH Sale T6.2026.xlsx */
export async function exportPeriodHhSale(periodKey: string): Promise<{ filename: string; base64: string }> {
  await requirePermission("periods", "edit");
  const s = await loadSummaryOrThrow(periodKey);
  const rows = s.nvkd.filter((r) => r.role !== null);
  const totalBonus = rows.reduce((a, r) => a + r.bonus, 0);

  const aoa: (XLSX.CellObject | string | null)[][] = [
    ["CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE"],
    ["BẢNG TÍNH TỶ LỆ HOA HỒNG VÀ THƯỞNG DOANH SỐ"],
    [null, null, null, null, "Kỳ:", kyLabel(s)],
    [null, null, null, null, "Ngày lập:", todayVi()],
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
    ...rows.map((r, i) => [
      cellInt(i + 1),
      cellText(r.name),
      cellText(r.position === "ctv" ? "CTV" : "HĐLĐ"),
      cellText(positionLabel(r.position)),
      cellMoney(r.revenue),
      cellPct(r.expectedRate ?? 0),
      cellMoney(r.bonus),
      cellMoney(0),
      cellMoney(r.bonus),
      cellText(r.position === "tpkd" ? "Quản lý" : r.diff !== 0 ? `Chênh HH ${r.diff.toLocaleString("vi-VN")}` : ""),
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
  return { filename: `Bang_HH_Sale_${periodKey}.xlsx`, base64: toBase64(wb) };
}

/** "Quyết định KPI TPKD" — mẫu sample/HH & KPI/Quyết định KPI TPKD T5-6.xlsx, 1 sheet / phòng */
export async function exportPeriodKpiTpkd(periodKey: string): Promise<{ filename: string; base64: string }> {
  await requirePermission("periods", "edit");
  const s = await loadSummaryOrThrow(periodKey);
  const wb = XLSX.utils.book_new();
  const depts = s.depts.filter((d) => d.units.length > 0);
  if (depts.length === 0) throw new Error("Kỳ này chưa có căn thuộc phòng nào");

  for (const d of depts) {
    const aoa: (XLSX.CellObject | string | null)[][] = [
      [null, null, null, "CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE"],
      [null, null, null, "Địa chỉ: 65/6 Nguyễn Xí, P. 26, Q. Bình Thạnh"],
      [null, null, null, "MST: 0318622404"],
      [],
      ["QUYẾT ĐỊNH VỀ MỨC % THƯỞNG KPI CHO TRƯỞNG PHÒNG KINH DOANH"],
      [null, null, null, "Kỳ đối chiếu:", null, kyLabel(s)],
      [null, null, null, "Ngày lập:", null, todayVi()],
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
    XLSX.utils.book_append_sheet(wb, ws, d.deptName.replace(/[\\/?*[\]:]/g, " ").slice(0, 30));
  }
  return { filename: `QD_KPI_TPKD_${periodKey}.xlsx`, base64: toBase64(wb) };
}
