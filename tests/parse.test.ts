import { describe, test, expect } from "vitest";
import { toPct, toNum } from "@/lib/parse";

describe("toPct — parse %rate từ form input", () => {
  test("số nguyên: '7' → 0.07", () => {
    expect(toPct("7")).toBe(0.07);
  });

  test("decimal dấu chấm: '7.5' → 0.075", () => {
    expect(toPct("7.5")).toBe(0.075);
  });

  test("decimal dấu phẩy VN: '7,5' → 0.075 (bug căn 655)", () => {
    expect(toPct("7,5")).toBe(0.075);
  });

  test("có % symbol: '7%' → 0.07 (bug căn 655 lần 3)", () => {
    expect(toPct("7%")).toBe(0.07);
  });

  test("VN + %: '7,5%' → 0.075", () => {
    expect(toPct("7,5%")).toBe(0.075);
  });

  test("có whitespace: '7,5 %' → 0.075", () => {
    expect(toPct("7,5 %")).toBe(0.075);
  });

  test("rỗng '' → 0 (không throw)", () => {
    expect(toPct("")).toBe(0);
  });

  test("null → 0", () => {
    expect(toPct(null)).toBe(0);
  });

  test("chữ 'abc' → THROW (không silent 0)", () => {
    expect(() => toPct("abc")).toThrow("không phải số hợp lệ");
  });

  test("chỉ '%' → 0 (rỗng sau strip)", () => {
    expect(toPct("%")).toBe(0);
  });

  test("số 0 explicit → 0", () => {
    expect(toPct("0")).toBe(0);
  });

  test("small decimal: '0.5' → 0.005", () => {
    expect(toPct("0.5")).toBe(0.005);
  });
});

describe("toNum — parse tiền/số nguyên từ form input", () => {
  test("số thường: '1000000' → 1_000_000", () => {
    expect(toNum("1000000")).toBe(1_000_000);
  });

  test("VN thousand sep: '1.993.053.847' → 1_993_053_847", () => {
    expect(toNum("1.993.053.847")).toBe(1_993_053_847);
  });

  test("US thousand sep: '1,993,053,847' → 1_993_053_847", () => {
    expect(toNum("1,993,053,847")).toBe(1_993_053_847);
  });

  test("mixed: '2.093.053.847' → 2_093_053_847", () => {
    expect(toNum("2.093.053.847")).toBe(2_093_053_847);
  });

  test("float JS: '104957611.61363636' → 104957611.61 (giữ decimal)", () => {
    expect(toNum("104957611.61363636")).toBeCloseTo(104957611.61, 1);
  });

  test("empty → 0", () => {
    expect(toNum("")).toBe(0);
  });

  test("null → 0", () => {
    expect(toNum(null)).toBe(0);
  });

  test("có whitespace: ' 1000 ' → 1000", () => {
    expect(toNum(" 1000 ")).toBe(1000);
  });
});
