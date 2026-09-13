import { describe, test, expect } from "vitest";
import { buildCashPnl, classifyCashLeg, type CashLeg } from "@/lib/cash-pnl-core";

const P = { start: "2025-01-01", end: "2025-12-31" };
const leg = (o: Partial<CashLeg> & { amount: number; direction: "in" | "out"; counterAccount: string }): CashLeg => ({
  date: "2025-06-01", channel: "bank", description: "", ...o,
});

describe("classifyCashLeg theo TK đối ứng", () => {
  test("thu 131 là doanh thu, 3388 là giữ chỗ, 1111 là chuyển nội bộ, 515 là thu khác", () => {
    expect(classifyCashLeg(leg({ direction: "in", counterAccount: "131", amount: 1 }))).toBe("dt_hh_so_cap");
    expect(classifyCashLeg(leg({ direction: "in", counterAccount: "3388", amount: 1, description: "DKTV EGV" }))).toBe("giu_cho_ho_khach");
    expect(classifyCashLeg(leg({ direction: "in", counterAccount: "1111", amount: 1 }))).toBe("chuyen_noi_bo");
    expect(classifyCashLeg(leg({ direction: "in", counterAccount: "515", amount: 1 }))).toBe("khac_thu");
  });
  test("chi: thuế theo TK, BHXH dòng riêng, 335 hỗ trợ khách, 244 ký quỹ, 3388 nộp thay là giữ chỗ, hoàn là hoàn khách", () => {
    expect(classifyCashLeg(leg({ direction: "out", counterAccount: "3335", amount: 1 }))).toBe("thue_tncn");
    expect(classifyCashLeg(leg({ direction: "out", counterAccount: "33311", amount: 1 }))).toBe("thue_vat");
    expect(classifyCashLeg(leg({ direction: "out", counterAccount: "3383", amount: 1 }))).toBe("bhxh");
    expect(classifyCashLeg(leg({ direction: "out", counterAccount: "335", amount: 1, description: "thanh toan ho tro khach hang To Thi Nga" }))).toBe("ho_tro_khach");
    expect(classifyCashLeg(leg({ direction: "out", counterAccount: "244", amount: 1 }))).toBe("ky_quy");
    expect(classifyCashLeg(leg({ direction: "out", counterAccount: "3388", amount: 1, description: "Nop thay Phan Thi Huyen B.16.11" }))).toBe("giu_cho_ho_khach");
    expect(classifyCashLeg(leg({ direction: "out", counterAccount: "3388", amount: 1, description: "Hoan tien YCTV du an ATR" }))).toBe("hoan_khach");
  });
  test("trả nhà cung cấp 331 đọc diễn giải", () => {
    const c = (d: string) => classifyCashLeg(leg({ direction: "out", counterAccount: "331", amount: 1, description: d }));
    expect(c("BRE thanh toan tien thue nha T1.2025")).toBe("thue_vp");
    expect(c("BRE nap tien cho BDS39466099 (PROPERTYGURUVN)")).toBe("marketing");
    expect(c("Bre thanh toan thu lao CTV thang 7 2025")).toBe("luong_nvkd");
    expect(c("BRE thanh toan phi dich vu thang 12.2024")).toBe("luong_admin");
    expect(c("Chi tiền công ty VTMH-HD44")).toBe("tiep_khach");
    expect(c("Bre thanh toan cuoc van chuyen tu Phuong Binh Hoa")).toBe("di_lai");
    expect(c("Cong ty BRE thanh toan bo may tinh theo bao gia")).toBe("do_dung_vp");
    expect(c("NTDT+KB:0144-KBNN Khu vuc II")).toBe("thue_vp");
    expect(c("Chi tiền chi phí không rõ")).toBe("dich_vu_ngoai");
  });
  test("chi thẳng TK chi phí dùng classifier NKC; hoàn chi phí vào bank là giảm chi", () => {
    expect(classifyCashLeg(leg({ direction: "out", counterAccount: "6417", amount: 1, description: "BRE thanh toan hoa hong can 14.16" }))).toBe("hh_sale");
    expect(classifyCashLeg(leg({ direction: "out", counterAccount: "811", amount: 1, description: "Chi tiền chi phí không hóa đơn" }))).toBe("opex_khac");
    expect(classifyCashLeg(leg({ direction: "in", counterAccount: "6417", amount: 1, description: "vib hoan tra" }))).toBe("hh_sale");
  });
  test("category có sẵn thì giữ nguyên", () => {
    expect(classifyCashLeg(leg({ direction: "out", counterAccount: "", amount: 1, category: "marketing" }))).toBe("marketing");
  });
});

describe("buildCashPnl", () => {
  const legs: CashLeg[] = [
    leg({ direction: "in", counterAccount: "131", amount: 1_000 }),
    leg({ direction: "in", counterAccount: "515", amount: 10 }),
    leg({ direction: "out", counterAccount: "6417", amount: 400, description: "thanh toan hoa hong can A.01" }),
    leg({ direction: "in", counterAccount: "6417", amount: 50, description: "hoan tra hoa hong" }),   // hoàn chi phí
    leg({ direction: "out", counterAccount: "3341", amount: 100, description: "thanh toan luong T5" }),
    leg({ direction: "out", counterAccount: "3383", amount: 20 }),
    leg({ direction: "out", counterAccount: "3335", amount: 30 }),
    leg({ direction: "out", counterAccount: "3388", amount: 500, description: "Nop thay khach" }),
    leg({ direction: "in", counterAccount: "3388", amount: 700, description: "DKTV" }),
    leg({ direction: "out", counterAccount: "1111", amount: 200, channel: "bank" }),                  // bank → két
    leg({ direction: "in", counterAccount: "11211", amount: 200, channel: "cash" }),                  // két nhận
    leg({ direction: "out", counterAccount: "811", amount: 60, channel: "cash", description: "chi khong hoa don" }),
    leg({ date: "2026-01-05", direction: "in", counterAccount: "131", amount: 99_999 }),              // ngoài kỳ
  ];
  const r = buildCashPnl(legs, P, true, { kinhDoanh: 3, quanLy: 1 });

  test("thu, giá vốn (trừ hoàn), cố định, thuế, ròng", () => {
    expect(r.totals.thu).toBe(1_010);
    expect(r.byLine.chi_hh_sale).toBe(350);
    expect(r.totals.chiGiaVon).toBe(350);
    expect(r.byLine.chi_luong).toBe(100);
    expect(r.byLine.chi_bhxh).toBe(20);
    expect(r.byLine.chi_khac).toBe(60);
    expect(r.totals.chiCoDinh).toBe(180);
    expect(r.totals.hoatDongTruocThue).toBe(1_010 - 350 - 180);
    expect(r.totals.thue).toBe(30);
    expect(r.totals.hoatDongRong).toBe(450);
  });
  test("ngoài hoạt động: giữ chỗ ròng +200, chuyển nội bộ triệt tiêu; thay đổi tiền khớp tổng kênh", () => {
    expect(r.byLine.giu_cho).toBe(200);
    expect(r.byLine.chuyen_noi_bo).toBe(0);
    expect(r.totals.ngoaiHoatDong).toBe(200);
    expect(r.totals.thayDoiTien).toBe(650);
    const kenh = r.totals.bankIn - r.totals.bankOut + r.totals.cashIn - r.totals.cashOut;
    expect(kenh).toBe(650);
  });
  test("dòng lương chia theo tỷ lệ sao kê 3:1, tổng giữ nguyên", () => {
    expect(r.luongSplit).toEqual({ kinhDoanh: 75, quanLy: 25, basis: "sao_ke" });
    expect(r.lines.find((l) => l.code === "4.1a")!.value).toBe(75);
    expect(buildCashPnl(legs, P).luongSplit.basis).toBe("khong_tach");
  });
  test("bỏ chân ngoài kỳ, không có chưa phân loại", () => {
    expect(r.unclassified).toHaveLength(0);
    expect(r.lines.find((l) => l.code === "7")!.value).toBe(450);
  });
});

describe("monthsOf, buildCashMonthly, computeRatios", () => {
  test("cắt kỳ theo tháng và cắt biên", async () => {
    const { monthsOf, buildCashMonthly, computeRatios } = await import("@/lib/cash-pnl-core");
    const ms = monthsOf({ start: "2025-11-15", end: "2026-01-10" });
    expect(ms.map((m) => `${m.label}:${m.period.start}..${m.period.end}`)).toEqual([
      "T11:2025-11-15..2025-11-30", "T12:2025-12-01..2025-12-31", "T1:2026-01-01..2026-01-10",
    ]);
    const legs: CashLeg[] = [
      leg({ date: "2025-01-05", direction: "in", counterAccount: "131", amount: 1_000 }),
      leg({ date: "2025-02-05", direction: "in", counterAccount: "131", amount: 500 }),
      leg({ date: "2025-02-06", direction: "out", counterAccount: "6417", amount: 200, description: "hoa hong" }),
    ];
    const rows = buildCashMonthly(legs, { start: "2025-01-01", end: "2025-02-28" });
    expect(rows.map((r) => [r.label, r.thu, r.chiGiaVon])).toEqual([["T1", 1_000, 0], ["T2", 500, 200]]);
    const r = computeRatios(1_500, 1_300, 650, 600, 2);
    expect(r.bienGop).toBeCloseTo(1_300 / 1_500);
    expect(r.hoaVonThu).toBe(750);
    expect(r.hoaVonThuThang).toBe(375);
    expect(r.thuBinhQuanThang).toBe(750);
    expect(r.anToan).toBeCloseTo(0.5);
    expect(computeRatios(0, 0, 100, -100, 1).hoaVonThu).toBeNull();
    const u = computeRatios(1_500, 1_300, 650, 600, 2, 10);
    expect(u.thuMoiCan).toBe(150);
    expect(u.canBinhQuanThang).toBe(5);
    expect(u.canCanMoiThang).toBe(2.5); // 375 mỗi tháng ÷ 150 mỗi căn
  });
});

describe("monthsWithData", () => {
  test("kỳ đang dở chỉ đếm tới tháng có dữ liệu cuối", async () => {
    const { monthsWithData } = await import("@/lib/cash-pnl-core");
    const Y = { start: "2026-01-01", end: "2026-12-31" };
    expect(monthsWithData(Y, "2026-08-03")).toBe(8);
    expect(monthsWithData(Y, "2026-12-31")).toBe(12);
    expect(monthsWithData(Y, null)).toBe(1);
    expect(monthsWithData({ start: "2026-04-01", end: "2026-06-30" }, "2026-05-15")).toBe(2);
  });
});
