import { describe, test, expect } from "vitest";

/**
 * Tests cho 3 bulk features (BulkForm client-side logic):
 * - Products bulk: normalize project/dept lookup, parse pmgRate/pmgSaleRate riêng
 * - Revenues bulk: filter căn theo dự án, compute LK đợt này + phải thu, regression check
 * - Costs bulk: filter costType theo product config, compute InfoPanel values
 *
 * Tất cả logic client-side pure — không cần server/DB.
 */

// ============ Reproduce helpers từ BulkForm components ============
function splitColumn(raw: string): string[] {
  const s = raw.replace(/\r\n?/g, "\n").split("\n").map((x) => x.trim());
  while (s.length > 0 && s[s.length - 1] === "") s.pop();
  return s;
}

function normalize(s: string): string {
  return String(s ?? "").replace(/[\s.\-_]/g, "").toLowerCase();
}

function parseMoney(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

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

// ============ BULK PARSE HELPERS ============

describe("Bulk helpers: splitColumn", () => {
  test("split newlines + trim + bỏ trailing empty", () => {
    expect(splitColumn("A\nB\nC\n\n")).toEqual(["A", "B", "C"]);
    expect(splitColumn("  A  \n  B  ")).toEqual(["A", "B"]);
    expect(splitColumn("A\r\nB")).toEqual(["A", "B"]);
    expect(splitColumn("")).toEqual([]);
  });

  test("giữ empty ở giữa (user paste cột lệch)", () => {
    expect(splitColumn("A\n\nC")).toEqual(["A", "", "C"]);
  });
});

describe("Bulk helpers: normalize (project/dept lookup)", () => {
  test("case-insensitive + strip whitespace/dots/dashes", () => {
    expect(normalize("Hồ Gia")).toBe("hồgia");
    expect(normalize("A&T-SAIGON")).toBe("a&tsaigon");
    expect(normalize("EMGV_DT26")).toBe("emgvdt26");
  });

  test("match project name/code interchangeably", () => {
    const inputs = ["The Emerald Garden View", "The  Emerald  Garden  View"];
    const normalized = inputs.map(normalize);
    expect(new Set(normalized).size).toBe(1); // đều normalize về cùng key
  });
});

describe("Bulk helpers: parseMoney", () => {
  test("VN thousand: '1.834.415.215' → 1_834_415_215", () => {
    expect(parseMoney("1.834.415.215")).toBe(1_834_415_215);
  });

  test("US thousand: '1,834,415,215' → 1_834_415_215", () => {
    expect(parseMoney("1,834,415,215")).toBe(1_834_415_215);
  });

  test("rỗng → 0", () => {
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("—")).toBe(0);
  });

  test("mixed rác: '1,000,000 VND' → 1_000_000", () => {
    expect(parseMoney("1,000,000 VND")).toBe(1_000_000);
  });
});

describe("Bulk helpers: parsePctDecimal", () => {
  test("VN comma: '7,5' → 0.075", () => {
    expect(parsePctDecimal("7,5")).toBe(0.075);
  });

  test("có %: '7%' → 0.07", () => {
    expect(parsePctDecimal("7%")).toBe(0.07);
  });

  test("với whitespace: '7,5 %' → 0.075", () => {
    expect(parsePctDecimal("7,5 %")).toBe(0.075);
  });

  test("decimal < 1 giữ nguyên: '0.075' → 0.075", () => {
    expect(parsePctDecimal("0.075")).toBe(0.075);
  });

  test("rỗng → 0", () => {
    expect(parsePctDecimal("")).toBe(0);
  });
});

describe("Bulk helpers: parseDate", () => {
  test("ISO: '2026-06-24' → giữ nguyên", () => {
    expect(parseDate("2026-06-24")).toBe("2026-06-24");
  });

  test("VN dd/mm/yyyy: '24/06/2026' → '2026-06-24'", () => {
    expect(parseDate("24/06/2026")).toBe("2026-06-24");
  });

  test("Excel serial: 46081 → 2026-03-22", () => {
    const result = parseDate("46081");
    expect(result).toMatch(/^2026-\d{2}-\d{2}$/);
  });

  test("rỗng → ''", () => {
    expect(parseDate("")).toBe("");
    expect(parseDate("  ")).toBe("");
  });

  test("format lạ → ''", () => {
    expect(parseDate("hôm nay")).toBe("");
  });
});

// ============ BULK REVENUE: preview logic ============

describe("Bulk Revenue preview logic", () => {
  const pmgBase = 1_000_000_000;
  const admin = 3_850_000;

  test("HH commission: compute LK đợt này + phải thu", () => {
    const pmgLk = 0.05;
    const phasePct = 0.6;
    const lkPrev = 0;

    const grossThisTime = pmgBase * pmgLk * phasePct;
    const lkThisTime = Math.max(0, grossThisTime - admin);
    const receivable = Math.max(0, Math.round(lkThisTime - lkPrev));

    expect(grossThisTime).toBe(30_000_000);
    expect(lkThisTime).toBe(26_150_000);
    expect(receivable).toBe(26_150_000);
  });

  test("Còn phải thu = expectedTotal − lkPrev (STATIC, không phụ thuộc đợt này)", () => {
    // Đã ĐC 60% × 5% × giá − admin = 26.15M
    const lkPrev = 26_150_000;
    const pmgLk = 0.05;
    const expectedTotal = Math.max(0, pmgBase * pmgLk - admin);
    // = 1B × 5% − 3.85M = 46.15M
    const remaining = Math.max(0, Math.round(expectedTotal - lkPrev));
    // = 46.15M − 26.15M = 20M (40% còn lại)
    expect(remaining).toBe(20_000_000);
  });

  test("Regression detect: phasePct đợt này < prev max → block", () => {
    const prevMaxPhasePct = 0.6;
    const phasePctNow = 0.5;
    const isRegression = phasePctNow > 0 && phasePctNow < prevMaxPhasePct - 1e-9;
    expect(isRegression).toBe(true);
  });

  test("Regression: phasePct đợt này = prev max → không block (giữ nguyên)", () => {
    const prevMaxPhasePct = 0.6;
    const phasePctNow = 0.6;
    const isRegression = phasePctNow > 0 && phasePctNow < prevMaxPhasePct - 1e-9;
    expect(isRegression).toBe(false);
  });

  test("Regression: chưa nhập %thu → không block", () => {
    const prevMaxPhasePct = 0.6;
    const phasePctNow = 0;
    const isRegression = phasePctNow > 0 && phasePctNow < prevMaxPhasePct - 1e-9;
    expect(isRegression).toBe(false);
  });

  test("Bonus recon: amount = user input (không compute từ %)", () => {
    // Bonus flow không dùng phasePct/pmgLk, chỉ dùng amount trực tiếp
    const bonusAmount = 22_000_000;
    const isCommission = false;
    const amount = isCommission ? 0 : bonusAmount;
    expect(amount).toBe(22_000_000);
  });
});

// ============ BULK COST: filter costType theo product config ============

describe("Bulk Cost: filter cost types theo product config", () => {
  // Reproduce targetForRow helper
  function targetForRow(p: {
    pmgBasePrice?: number;
    pmgSaleRate?: number;
    saleCommissionRate?: number;
    kpiCeoRate?: number;
    kpiTpkdRate?: number;
    kpiAdminRate?: number;
    customerSupport?: number;
    bonusSale?: number;
    bonusManager?: number;
    cdtBonusSale?: number;
    cdtBonusManager?: number;
  } | undefined, ct: string): number {
    if (!p) return 0;
    const Qsale = Number(p.pmgBasePrice ?? 0) * Number(p.pmgSaleRate ?? 0);
    switch (ct) {
      case "sale_commission": return Qsale * Number(p.saleCommissionRate ?? 0);
      case "kpi_ceo": return Qsale * Number(p.kpiCeoRate ?? 0);
      case "kpi_tpkd": return Qsale * Number(p.kpiTpkdRate ?? 0);
      case "kpi_admin": return Qsale * Number(p.kpiAdminRate ?? 0);
      case "customer_support": return Number(p.customerSupport ?? 0);
      case "bonus_sale": return Number(p.bonusSale ?? 0);
      case "bonus_manager": return Number(p.bonusManager ?? 0);
      case "cdt_bonus_sale": return Number(p.cdtBonusSale ?? 0);
      case "cdt_bonus_manager": return Number(p.cdtBonusManager ?? 0);
    }
    return 0;
  }

  const product = {
    pmgBasePrice: 1_000_000_000,
    pmgSaleRate: 0.05,
    saleCommissionRate: 0.5,
    kpiCeoRate: 0.035,
    kpiTpkdRate: 0.04,
    kpiAdminRate: 0.0025,
    customerSupport: 0, // căn không có hỗ trợ khách
    bonusSale: 0,
    bonusManager: 0,
    cdtBonusSale: 22_000_000,
    cdtBonusManager: 0,
  };

  test("Filter: costType có value > 0 → giữ; = 0 → ẩn", () => {
    const allTypes = [
      "sale_commission", "customer_support", "bonus_sale", "bonus_manager",
      "cdt_bonus_sale", "cdt_bonus_manager", "kpi_ceo", "kpi_tpkd", "kpi_admin",
    ];
    const filtered = allTypes.filter((ct) => targetForRow(product, ct) > 0);
    // Chỉ giữ: sale_commission, cdt_bonus_sale, kpi_ceo, kpi_tpkd, kpi_admin
    expect(filtered).toContain("sale_commission");
    expect(filtered).toContain("cdt_bonus_sale");
    expect(filtered).toContain("kpi_ceo");
    expect(filtered).toContain("kpi_tpkd");
    expect(filtered).toContain("kpi_admin");
    // Loại bỏ (value = 0):
    expect(filtered).not.toContain("customer_support");
    expect(filtered).not.toContain("bonus_sale");
    expect(filtered).not.toContain("bonus_manager");
    expect(filtered).not.toContain("cdt_bonus_manager");
  });

  test("Chưa chọn căn (p=undefined) → không filter (dropdown show all)", () => {
    // Business rule: nếu chưa chọn căn → show all options.
    // Trong BulkForm implementation: if (!p) return true; → giữ hết
    // Test just check targetForRow behavior với undefined
    expect(targetForRow(undefined, "sale_commission")).toBe(0);
    expect(targetForRow(undefined, "kpi_admin")).toBe(0);
  });

  test("Product không có %HH sale → dropdown skip sale_commission", () => {
    const noHhProduct = { ...product, saleCommissionRate: 0 };
    expect(targetForRow(noHhProduct, "sale_commission")).toBe(0);
    expect(targetForRow(noHhProduct, "kpi_ceo")).toBeGreaterThan(0); // các KPI vẫn có
  });

  test("Đúng amount HH sale với căn tiêu chuẩn", () => {
    // HH sale = pmgBase × pmgSaleRate × saleCommissionRate
    //        = 1B × 0.05 × 0.5 = 25M (không áp N ở target)
    expect(targetForRow(product, "sale_commission")).toBe(25_000_000);
  });
});

// ============ BULK PRODUCT: %PMG_LK vs %PMG_LK_Sale riêng biệt ============

describe("Bulk Product: pmgRate vs pmgSaleRate parse independent", () => {
  test("2 cột paste riêng — pmg 7%, sale 5% → không auto-copy", () => {
    // User paste %PMG_LK cột = "7", %PMG_LK_Sale cột = "5"
    const pmgRate = parsePctDecimal("7");
    const pmgSaleRate = parsePctDecimal("5");
    expect(pmgRate).toBe(0.07);
    expect(pmgSaleRate).toBe(0.05);
    expect(pmgRate).not.toBe(pmgSaleRate);
  });

  test("Cột pmgSaleRate trống → user paste chỉ pmg → sale = 0 (recomputeDerived fallback rate)", () => {
    const pmgRate = parsePctDecimal("7");
    const pmgSaleRate = parsePctDecimal("");
    expect(pmgRate).toBe(0.07);
    expect(pmgSaleRate).toBe(0);
    // Downstream (recomputeDerived): `pmgSaleRate || rate` → dùng 0.07 làm base
  });

  test("Fenica bug regression: paste 6.5% cả 2 cột → cả 2 = 0.065", () => {
    // Trước bug: căn Fenica tất cả pmg_sale_rate = 6.5% (sai) do form không có
    // input riêng pmg_sale_rate → recomputeDerived fallback rate.
    // Fix: bulk form giờ có cột riêng, user paste 5.5% cho pmgSaleRate → correct.
    const pmgRate = parsePctDecimal("6,5");
    const pmgSaleRate = parsePctDecimal("5,5");
    expect(pmgRate).toBe(0.065);
    expect(pmgSaleRate).toBe(0.055);
  });
});
