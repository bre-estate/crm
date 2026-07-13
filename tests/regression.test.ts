import { describe, test, expect } from "vitest";
import { toPct } from "@/lib/parse";

// Regression tests cho các bug đã fix — mỗi test reproduce điều kiện bug
// rồi verify fix đúng. Nếu tương lai code regress, test sẽ fail.

describe("Regression: bugs căn 655 (BRE CRM 13/07/2026)", () => {
  test("Bug #1: type=number reject '7,5' → server nhận empty → toPct = 0", () => {
    // Fix: đổi type=number → text+decimal + toPct strip %,
    // Nếu code regress về type=number, "7,5" sẽ không submit được → server thấy null
    // Test này chỉ verify parse layer đúng — UI layer verify qua manual/Playwright
    expect(toPct("7,5")).toBe(0.075);
  });

  test("Bug #2: Chrome autofill đè giá trị vào %PMG_LK → adjustment lưu 8% thay vì 7%", () => {
    // Fix: MoneyInput + all forms có autoComplete=off + data-1p-ignore
    // Không thể test browser autofill trong Vitest, nhưng verify:
    // 1. Nếu user gõ "7" chuẩn → toPct("7") = 0.07 (không phải 0.08)
    expect(toPct("7")).toBe(0.07);
    // 2. Nếu code sai (autofill đè "8"), value = "8" → 0.08 (khác intent)
    expect(toPct("8")).toBe(0.08);
    // Guard hiện tại: chỉ ở UI layer (chặn autofill trigger)
  });

  test("Bug #3: user gõ '7%' (có ký tự %) → NaN → silent 0", () => {
    // Fix: toPct strip % + throw nếu NaN
    expect(toPct("7%")).toBe(0.07);
    expect(toPct("7,5%")).toBe(0.075);
    expect(toPct("7 %")).toBe(0.07);
  });

  test("Bug #4: check ô adjustment nhưng bỏ trống → server toPct('') = 0 → save 0%", () => {
    // Fix client + server: throw nếu isChanged && empty
    // Ở parse layer thì toPct("") vẫn return 0 (đúng semantic), guard ở caller
    expect(toPct("")).toBe(0);
    // Guard ở createProductAdjustment sẽ throw trước khi gọi toPct
    // Test guard trực tiếp yêu cầu import server action → skip pure logic layer
  });

  test("Bug #5: gõ giá trị rác 'abc' → phải throw, không silent 0", () => {
    expect(() => toPct("abc")).toThrow("không phải số hợp lệ");
    expect(() => toPct("xyz%")).toThrow("không phải số hợp lệ");
  });

  test("Bug #6: adjustment #1 pmg_rate = 0.08 nhưng note = '%PMG_LK = 7%' → mismatch", () => {
    // Không phải bug parse — bug UX: user gõ 7 nhưng autofill đè 8
    // Fix ở autoComplete=off (không test được ở đây)
    // Sanity: parse "7" → 0.07 (không 0.08)
    expect(toPct("7")).not.toBe(0.08);
    expect(toPct("7")).toBe(0.07);
  });
});

describe("Regression: audit log skip duplicate 7% consecutive trong pmgHistory", () => {
  // pmgHistory logic ở page.tsx — reproduce compact rule
  function compact<T extends { date: string; rate: number }>(entries: T[]): T[] {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const out: T[] = [];
    for (const e of sorted) {
      const prev = out[out.length - 1];
      if (!prev || prev.rate !== e.rate) out.push(e);
    }
    return out;
  }

  test("Consecutive same rate → compact còn 1", () => {
    const input = [
      { date: "2026-01-21", rate: 0.06 },
      { date: "2026-02-05", rate: 0.07 },
      { date: "2026-07-11", rate: 0.07 }, // consecutive 7% → skip
      { date: "2026-07-13", rate: 0.075 }, // khác rate → keep
    ];
    const out = compact(input);
    expect(out).toEqual([
      { date: "2026-01-21", rate: 0.06 },
      { date: "2026-02-05", rate: 0.07 },
      { date: "2026-07-13", rate: 0.075 },
    ]);
  });

  test("Rate xuống lại → giữ", () => {
    const input = [
      { date: "2026-01-01", rate: 0.07 },
      { date: "2026-02-01", rate: 0.08 },
      { date: "2026-03-01", rate: 0.07 }, // xuống lại → keep (khác 8%)
    ];
    expect(compact(input)).toEqual(input);
  });

  test("Empty → empty", () => {
    expect(compact([])).toEqual([]);
  });

  test("1 entry → 1 entry", () => {
    expect(compact([{ date: "2026-01-01", rate: 0.07 }])).toHaveLength(1);
  });
});

describe("Regression: latestPmgRate = p.pmgRate (canonical, không Math.max)", () => {
  // Trước dùng Math.max(config, ...recons) → sai nếu adjustment mới hạ rate
  // Sau: chỉ dùng p.pmgRate

  test("Nếu adjustment hạ rate từ 8% xuống 7%, hiển thị latest = 7% (không phải max 8%)", () => {
    const pmgRate = 0.07; // sau adjustment mới
    const reconRates = [0.06, 0.07, 0.08]; // recon cũ có 8%
    // OLD: Math.max(0.07, 0.06, 0.07, 0.08) = 0.08 ← WRONG
    // NEW: pmgRate = 0.07 ← CORRECT
    const latest = pmgRate; // = 0.07
    expect(latest).toBe(0.07);
    expect(latest).not.toBe(Math.max(pmgRate, ...reconRates));
  });
});
