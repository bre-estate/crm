import { describe, test, expect } from "vitest";
import * as XLSX from "xlsx";
import { summarizePeriod, buildRetroInserts } from "@/lib/period-commission-core";
import { buildHhSaleWorkbook, buildKpiTpkdWorkbook, hhSaleRows, workbookToBase64 } from "@/lib/period-excel";
import { makeCtx } from "./fixtures/period-ctx";

const ctx = makeCtx();
const s = summarizePeriod(ctx, "2026-P3")!;

describe("buildRetroInserts (dòng ĐC hồi tố, không đụng ĐC cũ)", () => {
  test("tạo đúng 2 dòng: hồi tố HH +5tr (rate 55%), hoàn KPI TPKD −1tr (rate 2%)", () => {
    const rows = buildRetroInserts(ctx, s, "all", "2026-09-10");
    expect(rows).toHaveLength(2);
    const sale = rows.find((r) => r.sourceReconId === 101)!;
    expect(sale).toMatchObject({
      kind: "Hồi tố",
      productId: 1,
      employeeName: "Trần Minh Nhật",
      costType: "sale_commission",
      commissionRate: 0.55,
      kpiRate: 0,
      amountPayableThisTime: 5_000_000,
      kpiAmount: 0,
      paymentProgressPct: 0.7,
      pmgLkSaleRate: 0.07,
      pmgBasePriceSale: 2_000_000_000,
      adminFeeSale: 3_850_000,
      reconciliationDate: "2026-09-10",
      fiscalYear: 2026,
    });
    expect(sale.note).toBe("Hồi tố kỳ 2026-P3: 50% → 55% (từ ĐC #101)");

    const kpi = rows.find((r) => r.sourceReconId === 102)!;
    expect(kpi).toMatchObject({
      kind: "Hoàn chi dư",
      costType: "kpi_tpkd",
      kpiRate: 0.02,
      amountPayableThisTime: -1_000_000,
      kpiAmount: -1_000_000,
    });
    expect(kpi.note).toBe("Hoàn chi dư kỳ 2026-P3: 3% → 2% (từ ĐC #102)");
  });

  test("chọn 1 ĐC cụ thể; ĐC đúng rate không có dòng nào", () => {
    expect(buildRetroInserts(ctx, s, [101], "2026-09-10").map((r) => r.sourceReconId)).toEqual([101]);
    expect(buildRetroInserts(ctx, s, [103], "2026-09-10")).toHaveLength(0);
  });

  test("sau khi đã tạo hồi tố (note có 'từ ĐC #id') thì không tạo lại", () => {
    const ctx2 = makeCtx();
    ctx2.recons.push({
      ...ctx2.recons[0],
      id: 999,
      commissionRate: 0.55,
      amount: 5_000_000,
      note: "Hồi tố kỳ 2026-P3: 50% → 55% (từ ĐC #101)",
    });
    const s2 = summarizePeriod(ctx2, "2026-P3")!;
    expect(s2.retro.find((r) => r.reconId === 101)?.alreadyRetro).toBe(true);
    expect(buildRetroInserts(ctx2, s2, "all", "2026-09-10").map((r) => r.sourceReconId)).toEqual([102]);
    // Tổng HH của Nhật sau hồi tố đúng = 55% base
    expect(s2.nvkd.find((r) => r.name === "Trần Minh Nhật")!.diff).toBe(0);
  });
});

describe("Excel theo mẫu HR", () => {
  test("Bảng HH Sale: header + dòng NVKD + thưởng", () => {
    const rows = hhSaleRows(s);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stt: 1, name: "Trần Minh Nhật", contract: "HĐLĐ", position: "NVKD", revenue: 450_000_000, rate: 0.55, bonus: 8_000_000, remaining: 8_000_000 });

    const wb = buildHhSaleWorkbook(s, new Date(2026, 8, 10));
    expect(wb.SheetNames).toEqual(["ty le hh"]);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["ty le hh"], { header: 1 });
    expect(aoa[0][0]).toBe("CÔNG TY TNHH SÀN GIAO DỊCH BẤT ĐỘNG SẢN BRE");
    expect(aoa[2][4]).toBe("Kỳ:");
    expect(aoa[2][5]).toBe("Tháng 5+6/2026");
    expect(aoa[3][5]).toBe("10/9/2026");
    expect(aoa[5]).toEqual([
      "STT", "Tên NVKD", "Loại hợp đồng", "Chức vụ", "Doanh thu sản phẩm đã cọc (VNĐ)", "% Hoa hồng NVKD",
      "Thưởng doanh số tháng 5+6/2026", "Đã thanh toán", "Còn phải thanh toán", "Ghi chú",
    ]);
    expect(aoa[6].slice(0, 9)).toEqual([1, "Trần Minh Nhật", "HĐLĐ", "NVKD", 450_000_000, 0.55, 8_000_000, 0, 8_000_000]);
    expect(aoa[4][6]).toBe(8_000_000); // TỔNG CỘNG thưởng
    expect(workbookToBase64(wb).length).toBeGreaterThan(100);
  });

  test("QĐ KPI TPKD: 1 sheet / phòng, tổng doanh thu phòng, % KPI theo tier", () => {
    const wb = buildKpiTpkdWorkbook(s, new Date(2026, 8, 10));
    expect(wb.SheetNames).toEqual(["Kinh doanh - Hồ Gia"]);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(aoa[4][0]).toBe("QUYẾT ĐỊNH VỀ MỨC % THƯỞNG KPI CHO TRƯỞNG PHÒNG KINH DOANH");
    expect(aoa[5][5]).toBe("Tháng 5+6/2026");
    expect(aoa[12][2]).toBe("KINH DOANH - HỒ GIA");
    expect(aoa[13][2]).toBe("HỒ NGUYỄN CÔNG THÀNH");
    expect(aoa[13][5]).toBe(450_000_000);
    expect(aoa[14]).toEqual(["MÃ SP", "MÃ SP", "DỰ ÁN", "TÊN NHÂN VIÊN", "NGÀY CỌC", "DOANH THU", "% KPI "]);
    expect(aoa[15].slice(0, 4)).toEqual([1, "A", "THE EMERALD GARDEN VIEW", "TRẦN MINH NHẬT"]);
    expect(aoa[15][5]).toBe(250_000_000);
    expect(aoa[15][6]).toBe(0.02);
    expect(aoa[16][1]).toBe("B");
  });

  test("QĐ KPI TPKD throw khi kỳ không có phòng", () => {
    const empty = summarizePeriod(makeCtx(), "2025-P1")!;
    expect(() => buildKpiTpkdWorkbook(empty)).toThrow();
  });
});
