/**
 * Chuẩn số thập phân Việt Nam:
 * - Dấu phẩy "," = phần thập phân (VD 6,925 = six point nine two five)
 * - KHÔNG dùng dấu chấm "." (dễ nhầm với thousands separator)
 * - Số âm bắt đầu bằng "-" (VD -1000000)
 *
 * Chốt 2026-08-07 với user.
 */

// Cho phép digit, 1 dấu ",", 1 dấu "-" ở đầu. Chặn ký tự khác.
export function sanitizeDecimalInput(raw: string, allowNegative = false): string {
  if (!raw) return "";
  let s = raw;
  // Auto convert "." → "," (nếu user quen gõ chấm)
  s = s.replace(/\./g, ",");
  // Chỉ giữ digit + "," + "-"
  s = s.replace(/[^\d,\-]/g, "");
  // Chỉ được 1 dấu "-" và phải ở đầu
  if (allowNegative) {
    const hasNeg = s.startsWith("-");
    s = s.replace(/-/g, "");
    if (hasNeg) s = "-" + s;
  } else {
    s = s.replace(/-/g, "");
  }
  // Chỉ được 1 dấu ","
  const firstComma = s.indexOf(",");
  if (firstComma !== -1) {
    s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, "");
  }
  return s;
}

// Parse "6,925" → 6.925 (JS number)
export function parseDecimalVN(s: string): number {
  if (!s) return 0;
  const cleaned = sanitizeDecimalInput(s, true).replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
