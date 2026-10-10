import { describe, it, expect } from "vitest";
import { luyKeDoanhThu, soTienDotNay } from "@/lib/doanh-thu-core";

describe("công thức doanh thu lũy kế", () => {
  it("lấy %PMG ghi trên đợt, không lấy mốc cuối hợp đồng", () => {
    // Căn B.23.24 thật: đợt gần nhất ghi 5,75% trong khi hợp đồng mốc cuối là
    // 6,5%. Dùng 6,5% thì trang Soát báo thiếu 16.170.247 một cách oan uổng,
    // dùng 5,75% thì khớp đúng số đã ghi.
    const lk = luyKeDoanhThu({
      pmgBasePrice: 2_395_592_169,
      pmgCumulativePct: 0.0575,
      phasePct: 0.9,
      adminFee: 8_800_000,
    });
    expect(Math.round(lk)).toBe(115_171_895);
  });

  it("phí admin chỉ trừ một lần trong lũy kế", () => {
    expect(
      luyKeDoanhThu({
        pmgBasePrice: 1_000_000_000,
        pmgCumulativePct: 0.05,
        phasePct: 1,
        adminFee: 5_000_000,
      }),
    ).toBe(45_000_000);
  });

  it("ưu tiên phí admin ghi trên đợt hơn phí của căn", () => {
    const chung = { pmgBasePrice: 1_000_000_000, pmgCumulativePct: 0.05, phasePct: 1 };
    expect(luyKeDoanhThu({ ...chung, adminFeeVat: 2_000_000, adminFee: 5_000_000 })).toBe(48_000_000);
    expect(luyKeDoanhThu({ ...chung, adminFeeVat: 0, adminFee: 5_000_000 })).toBe(45_000_000);
  });

  it("số tiền đợt này là phần tăng thêm so với các đợt trước", () => {
    const t = { pmgBasePrice: 1_000_000_000, pmgCumulativePct: 0.05, phasePct: 0.9, adminFee: 0 };
    expect(soTienDotNay(t, 30_000_000)).toBe(15_000_000);
  });

  it("không trả số âm khi đợt trước đã thu nhiều hơn", () => {
    const t = { pmgBasePrice: 1_000_000_000, pmgCumulativePct: 0.05, phasePct: 0.5, adminFee: 0 };
    expect(soTienDotNay(t, 40_000_000)).toBe(0);
  });
});
