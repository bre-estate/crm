import { describe, test, expect } from "vitest";

// Reproduce diff() từ lib/audit.ts để test standalone. Nếu logic đổi cập nhật cả 2.
function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const b = before ?? {};
  const a = after ?? {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const k of keys) {
    const bv = b[k];
    const av = a[k];
    const bn = bv == null || bv === "" ? null : bv;
    const an = av == null || av === "" ? null : av;
    if (bn === an) continue;
    if (typeof bn === "number" && typeof an === "number") {
      if (Math.abs(bn - an) < 1e-9) continue;
    }
    if (JSON.stringify(bn) === JSON.stringify(an)) continue;
    out[k] = { from: bn, to: an };
  }
  return out;
}

describe("diff() — audit trail helper", () => {
  test("field không đổi → không có trong diff", () => {
    const d = diff({ pmgRate: 0.07 }, { pmgRate: 0.07 });
    expect(d).toEqual({});
  });

  test("field đổi → có trong diff với from/to", () => {
    const d = diff({ pmgRate: 0.07 }, { pmgRate: 0.075 });
    expect(d).toEqual({ pmgRate: { from: 0.07, to: 0.075 } });
  });

  test("null/undefined/'' xem như equivalent (không tạo noise)", () => {
    expect(diff({ note: null }, { note: undefined })).toEqual({});
    expect(diff({ note: "" }, { note: null })).toEqual({});
    expect(diff({ note: null }, { note: "" })).toEqual({});
  });

  test("null → giá trị thật = có change", () => {
    const d = diff({ pmgRate: null }, { pmgRate: 0.07 });
    expect(d).toEqual({ pmgRate: { from: null, to: 0.07 } });
  });

  test("float tolerance < 1e-9 = coi như bằng", () => {
    const d = diff({ x: 0.1 + 0.2 }, { x: 0.3 }); // 0.30000000000000004 vs 0.3
    expect(d).toEqual({});
  });

  test("object shallow: JSON stringify equal → không diff", () => {
    const d = diff(
      { data: { a: 1, b: 2 } },
      { data: { a: 1, b: 2 } },
    );
    expect(d).toEqual({});
  });

  test("nhiều field cùng đổi", () => {
    const d = diff(
      { pmgRate: 0.07, adminFee: 3_850_000, note: "cũ" },
      { pmgRate: 0.08, adminFee: 4_000_000, note: "cũ" },
    );
    expect(d).toEqual({
      pmgRate: { from: 0.07, to: 0.08 },
      adminFee: { from: 3_850_000, to: 4_000_000 },
    });
    expect(d.note).toBeUndefined();
  });

  test("create (before null) → tất cả field là to-only", () => {
    const d = diff(null, { pmgRate: 0.07, adminFee: 3_850_000 });
    expect(d).toEqual({
      pmgRate: { from: null, to: 0.07 },
      adminFee: { from: null, to: 3_850_000 },
    });
  });

  test("delete (after null) → tất cả field là from-only", () => {
    const d = diff({ pmgRate: 0.07 }, null);
    expect(d).toEqual({ pmgRate: { from: 0.07, to: null } });
  });

  test("empty object → empty diff", () => {
    expect(diff({}, {})).toEqual({});
    expect(diff(null, null)).toEqual({});
  });
});
