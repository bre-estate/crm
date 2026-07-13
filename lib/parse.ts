/**
 * Shared parse helpers cho form input → DB value.
 *
 * Trước: duplicated 4 lần trong lib/actions/{products,costs,revenues,projects}.ts
 * + reproduced trong tests. Bug "7%" sửa 4 lần. Giờ 1 nguồn.
 *
 * Đồng thời export type FormValue để không phải viết `FormDataEntryValue | null`
 * lặp lại.
 */

export type FormValue = FormDataEntryValue | null;

/**
 * Parse tiền / số nguyên từ form input.
 * Chấp nhận: "1000000", "1.000.000" (VN), "1,000,000" (US),
 *            "104957611.61" (float — giữ decimal)
 * Rỗng / null → 0
 */
export function toNum(v: FormValue): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // Heuristic phân biệt decimal vs thousand separator:
  // - "104957611.61363636" (float từ JS) → decimal, giữ phần thập phân
  // - "3.249.476.520" (Vietnamese thousand) → strip hết
  // - "104,957,611" (US thousand) → strip hết
  // Rule: nếu có ĐÚNG 1 dấu . và phần sau có ≥ 4 chữ số hoặc < 3 → decimal float
  //       (VN thousand có exactly 3 digits between dots)
  const dots = (s.match(/\./g) || []).length;
  if (dots === 1) {
    const parts = s.split(".");
    if (parts[1].length >= 4 || parts[1].length < 3) {
      const n = Number(s.replace(/[,\s]/g, ""));
      return isNaN(n) ? 0 : n;
    }
  }
  const n = Number(s.replace(/[.,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

/**
 * Parse % rate từ form input.
 * Form input là raw percent (5.5 = 5.5%); DB stores decimal (0.055).
 * Chấp nhận: "7", "7.5", "7,5" (VN), "7%", "7,5 %"
 * Rỗng / null → 0
 * Invalid ("abc", "xyz%") → THROW (không silent 0 — đã sai bug căn 655)
 */
export function toPct(v: FormValue): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace(/[%\s]/g, "").replace(/,/g, ".");
  if (!s) return 0;
  const n = Number(s);
  if (isNaN(n)) throw new Error(`Giá trị "${v}" không phải số hợp lệ`);
  return n / 100;
}

/** Trim string, giữ empty string. Dùng cho note, name, code fields. */
export function toStr(v: FormValue): string {
  return v === null ? "" : String(v).trim();
}

/** Trim, empty → null. Cho các field text nullable. */
export function toStrOrNull(v: FormValue): string | null {
  const s = toStr(v);
  return s === "" ? null : s;
}

/**
 * Validate returnTo param — chỉ nhận relative path bắt đầu /, không //.
 * Chống open-redirect: user submit `//evil.com/foo` sẽ bị reject.
 */
export function safeReturnTo(v: FormValue): string | null {
  const s = toStr(v);
  if (!s || !s.startsWith("/") || s.startsWith("//")) return null;
  return s;
}
