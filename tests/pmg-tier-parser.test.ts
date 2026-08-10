import { describe, it, expect } from "vitest";
import { parsePmgStructure, tierAt } from "../lib/pmg-tier-parser";

describe("parsePmgStructure", () => {
  it("parses percent tiers (Bcons Y-based, both directions)", () => {
    const p = parsePmgStructure("+ Y < 50%: 4,5% + 50% =< Y =< 90%: 5% + 90% =< Y: 5,5% Hồi tố toàn phần");
    expect(p?.metric).toBe("percent");
    expect(p?.retroactive).toBe(true);
    expect(p?.tiers).toEqual([
      { min: 0, max: 0.5, rate: 0.045 },
      { min: 0.5, max: 0.9, rate: 0.05 },
      { min: 0.9, max: null, rate: 0.055 },
    ]);
  });

  it("parses count tiers with từ...đến/trở lên", () => {
    const p = parsePmgStructure("+ Từ 01 đến 02 căn: 4% + Từ 03 đến 04 căn: 4,5% + Từ 05 căn trở lên: 5%");
    expect(p?.metric).toBe("count");
    expect(p?.tiers).toEqual([
      { min: 1, max: 2, rate: 0.04 },
      { min: 3, max: 4, rate: 0.045 },
      { min: 5, max: null, rate: 0.05 },
    ]);
  });

  it("parses X < N SP form and extracts sale cap", () => {
    const p = parsePmgStructure("x<30 SP: 6% 30=<X<60 SP: 6,25% X>=60SP: 6,75-7% (Phí tính doanh thu cho NVKD không quá 5%)");
    expect(p?.metric).toBe("count");
    expect(p?.notes).toBe("NVKD ≤ 5%");
    expect(p?.tiers?.[0].saleCap).toBe(0.05);
  });

  it("tierAt returns correct tier for value", () => {
    const tiers = [
      { min: 0, max: 29, rate: 0.06 },
      { min: 30, max: 60, rate: 0.0625 },
      { min: 60, max: null, rate: 0.0675 },
    ];
    expect(tierAt(tiers, 15)?.rate).toBe(0.06);
    expect(tierAt(tiers, 45)?.rate).toBe(0.0625);
    expect(tierAt(tiers, 100)?.rate).toBe(0.0675);
  });
});
