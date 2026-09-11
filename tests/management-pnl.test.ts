import { describe, test, expect } from "vitest";
import {
  assemblePnl, computeCogs, computeOpex, computeRevenue, compareToReference, normalizeUnit,
  type AccrualLite, type CostReconLite,
} from "@/lib/management-pnl-core";
import { KIM_PNL_2025 } from "@/lib/reference/kim-pnl-2025";

const Y2025 = { start: "2025-01-01", end: "2025-12-31" };
const Y2026 = { start: "2026-01-01", end: "2026-12-31" };

const recons: CostReconLite[] = [
  { date: "2025-11-19", unitCode: "B.28.18", costType: "sale_commission", amount: 300_000_000 },
  { date: "2025-11-19", unitCode: "B.26.20", costType: "kpi_tpkd", amount: 1_000_000 },
  { date: "2025-06-06", unitCode: "A.25.26", costType: "bonus_manager", amount: 50_000_000 },
  { date: "2025-12-31", unitCode: "X.01", costType: "bonus_sale", amount: 9_000_000 },       // thưởng doanh số, không phải giá vốn
  // 2026: chi thật cho căn đã trích trước 2025
  { date: "2026-01-08", unitCode: "B-26-20", costType: "sale_commission", amount: 70_000_000 }, // trích 80tr, chi 70tr
  { date: "2026-03-06", unitCode: "A-05-07", costType: "sale_commission", amount: 60_000_000 }, // trích 56tr, chi 60tr
  { date: "2026-03-06", unitCode: "C-01-01", costType: "sale_commission", amount: 10_000_000 }, // căn mới, không trích
];

const accruals: AccrualLite[] = [
  { date: "2025-12-31", unitCode: "B.26.20", amounts: { hh_sale: 80_000_000, cty_thuong_ceo: 5_000_000 } },
  { date: "2025-12-31", unitCode: "A-05-07", amounts: { hh_sale: 56_000_000, cdt_thuong_nvkd: 18_181_818 } },
];

describe("normalizeUnit", () => {
  test("B.26.20, B-26-20 và b 26 20 là một căn", () => {
    expect(normalizeUnit("B.26.20")).toBe("B-26-20");
    expect(normalizeUnit("b-26-20")).toBe("B-26-20");
    expect(normalizeUnit("B 26 20")).toBe("B-26-20");
  });
});

describe("computeCogs 2025: đối chiếu trong năm + trích trước 31/12", () => {
  const c = computeCogs(recons, accruals, Y2025);
  test("HH sale = ĐC 300tr + trích 136tr", () => {
    expect(c.hh_sale).toEqual({ recon: 300_000_000, accrual: 136_000_000, release: 0, total: 436_000_000 });
  });
  test("KPI TPKD chỉ có ĐC, CEO chỉ có trích trước, CĐT thưởng chỉ có trích trước", () => {
    expect(c.cty_thuong_tpkd.total).toBe(1_000_000);
    expect(c.cty_thuong_ceo.total).toBe(5_000_000);
    expect(c.cdt_thuong_nvkd.total).toBe(18_181_818);
    expect(c.cty_thuong_ql.total).toBe(50_000_000);
  });
  test("bonus_sale không vào giá vốn", () => {
    const sum = Object.values(c).reduce((s, x) => s + x.total, 0);
    expect(sum).toBe(436_000_000 + 1_000_000 + 5_000_000 + 18_181_818 + 50_000_000);
  });
});

describe("computeCogs 2026: hoàn nhập trích trước, không tính hai lần", () => {
  const c = computeCogs(recons, accruals, Y2026);
  test("chi 70tr cho căn trích 80tr thì hoàn nhập 70tr; chi 60tr cho căn trích 56tr thì hoàn nhập 56tr; căn mới tính đủ", () => {
    expect(c.hh_sale.recon).toBe(140_000_000);
    expect(c.hh_sale.release).toBe(126_000_000);
    expect(c.hh_sale.total).toBe(14_000_000); // 140 − 126 = 4tr chênh A-05-07 + 10tr căn mới
  });
  test("không có trích trước trong 2026", () => {
    expect(c.hh_sale.accrual).toBe(0);
    expect(c.cty_thuong_ceo.total).toBe(0);
  });
});

describe("computeRevenue", () => {
  test("không VAT = gồm VAT / 1,1; không gồm thưởng trừ thưởng đã quy về không VAT", () => {
    const r = computeRevenue({ gross: 1_100_000_000, bonusSale: 110_000_000, bonusMgr: 0 });
    expect(r.net).toBe(1_000_000_000);
    expect(r.netNoBonus).toBe(900_000_000);
  });
});

describe("computeOpex", () => {
  test("gom theo nhóm, bỏ dòng không phải chi phí cố định, tách thuế TNDN", () => {
    const o = computeOpex([
      { category: "luong_nvkd", amount: 100 },
      { category: "luong_nvkd", amount: 50 },
      { category: "thue_vp", amount: 30 },
      { category: "chuyen_noi_bo", amount: 999 },
      { category: "hh_sale", amount: 999 },
      { category: "thue_tndn", amount: 7 },
      { category: null, amount: 3 },
    ]);
    expect(o.luong_nvkd).toBe(150);
    expect(o.thue_vp).toBe(30);
    expect(o.opex_khac).toBe(3);
    expect(o.thue_tndn).toBe(7);
    expect("hh_sale" in o).toBe(false);
  });
});

describe("assemblePnl + compareToReference", () => {
  const revenue = computeRevenue({ gross: 4_681_373_087, bonusSale: 635_590_909, bonusMgr: 22_000_000 });
  const cogs = computeCogs(recons, accruals, Y2025);
  const opex = computeOpex([{ category: "luong_nvkd", amount: 345_221_721 }, { category: "thue_tndn", amount: 1 }]);
  const pnl = assemblePnl(Y2025, revenue, cogs, opex, true);

  test("tổng cộng đúng thứ tự: lãi gộp = DT không VAT − giá vốn; lợi nhuận = lãi gộp − cố định", () => {
    expect(pnl.totals.grossProfit).toBe(pnl.revenue.net - pnl.totals.cogs);
    expect(pnl.totals.profitBeforeTax).toBe(pnl.totals.grossProfit - pnl.totals.fixed);
    expect(pnl.lines.find((l) => l.code === "7")).toBeTruthy();
  });

  test("so với báo cáo kế toán: dòng khớp lệch 0, dòng kế toán không có thì null, ghi chú đi kèm", () => {
    const cmp = compareToReference(pnl, KIM_PNL_2025);
    const r11 = cmp.find((c) => c.code === "1.1")!;
    expect(r11.delta).toBe(0);
    expect(r11.note).toContain("DXMD");
    expect(cmp.find((c) => c.code === "4.1")!.delta).toBe(0);
    expect(cmp.find((c) => c.code === "4.5b")!.ref).toBeNull();
    expect(cmp.find((c) => c.code === "2.6")!.note).toContain("B.26.20");
  });
});
