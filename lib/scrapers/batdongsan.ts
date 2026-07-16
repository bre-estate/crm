/**
 * Parser cho trang dự án Batdongsan.com.vn.
 * URL format: https://batdongsan.com.vn/du-an/[slug]-prj-[id]
 *
 * Fetch HTML + regex extract 4 field:
 *   - Tổng căn hộ
 *   - Khoảng giá (min/max VND)
 *   - Địa chỉ (parse ra quận + TP)
 *   - Bàn giao dự kiến
 *
 * Regex-based (không dùng cheerio) — tránh dep nặng cho script CI.
 * Nếu Batdongsan đổi cấu trúc HTML → parser trả null, cần update pattern.
 *
 * ⚠️ Anti-bot: Batdongsan có ToS §1.2 cấm automated access. Rủi ro IP ban.
 * Mitigation: fetch với User-Agent bình thường, delay giữa requests khi chạy batch.
 */

export type BatdongsanData = {
  totalUnits: number | null;
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  district: string | null;
  city: string | null;
  handoverExpected: string | null;
  scrapedAt: string;
  rawSize: number;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Parse số Việt có dấu . ngăn cách (VD "1.234" → 1234).
function parseIntVn(s: string | null | undefined): number | null {
  if (!s) return null;
  const clean = s.replace(/[.,\s]/g, "");
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Parse giá dạng "2,5 tỷ" / "3.5 tỷ" / "1.200.000.000" → VND number.
function parsePriceVn(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.toLowerCase().trim();
  // Match number với dấu . hoặc , thập phân + đơn vị tỷ/triệu
  const m = t.match(/([\d.,]+)\s*(tỷ|triệu|tr|nghìn|k)?/i);
  if (!m) return null;
  const numStr = m[1].replace(/,/g, ".");
  const num = Number(numStr);
  if (!Number.isFinite(num)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "tỷ") return Math.round(num * 1_000_000_000);
  if (unit === "triệu" || unit === "tr") return Math.round(num * 1_000_000);
  if (unit === "nghìn" || unit === "k") return Math.round(num * 1000);
  // Không có đơn vị: nếu số nhỏ (< 100) → có thể là tỷ; nếu lớn (>1M) → là VND raw
  if (num < 100) return Math.round(num * 1_000_000_000);
  if (num >= 1_000_000) return Math.round(num);
  return null;
}

// Extract text giữa label "Field name" và value tiếp theo trong HTML.
// Batdongsan dùng div class re__pr-specs-content-item với 2 span:
//   <span class="re__pr-specs-content-item-title">Số căn hộ</span>
//   <span class="re__pr-specs-content-item-value">800 căn</span>
function extractField(html: string, label: string): string | null {
  // Pattern 1: dạng span title + span value (Batdongsan project page)
  const re1 = new RegExp(
    `title[^>]*>\\s*${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*<[^>]*>\\s*<span[^>]*value[^>]*>([^<]+)<`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1) return m1[1].trim();

  // Pattern 2: td/th kiểu bảng generic
  const re2 = new RegExp(
    `<t[dh][^>]*>\\s*${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*</t[dh]>\\s*<t[dh][^>]*>([^<]+)<`,
    "i",
  );
  const m2 = html.match(re2);
  if (m2) return m2[1].trim();

  // Pattern 3: strong/label loose match
  const re3 = new RegExp(
    `${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[^<]*<[^>]*>\\s*([^<]{1,80})<`,
    "i",
  );
  const m3 = html.match(re3);
  if (m3) return m3[1].trim();

  return null;
}

function parseAddress(html: string): { district: string | null; city: string | null } {
  const raw = extractField(html, "Địa chỉ") ?? extractField(html, "Địa Chỉ");
  if (!raw) return { district: null, city: null };
  // "Đường X, Phường Y, Quận Z, TP HCM" → extract Quận + TP
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  let district: string | null = null;
  let city: string | null = null;
  for (const p of parts) {
    const low = p.toLowerCase();
    if (/^(quận|huyện|thị xã|q\.|h\.)/i.test(low)) district = p;
    else if (/^(tp\.?|thành phố|tỉnh|province|city)/i.test(low)) city = p;
  }
  // Fallback: nếu chưa có district → phần thứ 3 từ cuối, city → phần cuối
  if (!district && parts.length >= 3) district = parts[parts.length - 2];
  if (!city && parts.length >= 2) city = parts[parts.length - 1];
  return { district, city };
}

function parseHandover(html: string): string | null {
  const raw =
    extractField(html, "Ngày hoàn thành") ??
    extractField(html, "Bàn giao") ??
    extractField(html, "Dự kiến bàn giao");
  if (!raw) return null;
  // Convert "Q2/2027" hoặc "06/2027" hoặc "2027" → chuẩn hoá
  const q = raw.match(/Q\s*(\d)\s*[\/\-\s]\s*(\d{4})/i);
  if (q) return `Q${q[1]} ${q[2]}`;
  const my = raw.match(/(\d{1,2})[\/\-](\d{4})/);
  if (my) return `${my[2]}-${my[1].padStart(2, "0")}`;
  const y = raw.match(/(\d{4})/);
  if (y) return y[1];
  return raw;
}

function parsePriceRange(html: string): { min: number | null; max: number | null } {
  const raw =
    extractField(html, "Giá bán") ??
    extractField(html, "Mức giá") ??
    extractField(html, "Giá");
  if (!raw) return { min: null, max: null };
  // "2,5 tỷ - 5 tỷ" hoặc "2 - 5 tỷ" hoặc "từ 2 tỷ"
  const rangeMatch = raw.match(/([\d.,]+\s*(?:tỷ|triệu|tr)?)\s*[-–—]\s*([\d.,]+\s*(?:tỷ|triệu|tr)?)/i);
  if (rangeMatch) {
    return {
      min: parsePriceVn(rangeMatch[1] + (rangeMatch[1].match(/tỷ|triệu|tr/i) ? "" : " tỷ")),
      max: parsePriceVn(rangeMatch[2]),
    };
  }
  const single = parsePriceVn(raw);
  return { min: single, max: single };
}

export async function scrapeBatdongsanProject(url: string): Promise<BatdongsanData> {
  if (!url.includes("batdongsan.com.vn")) {
    throw new Error("URL không phải batdongsan.com.vn");
  }
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    // Tránh cache của Next.js fetch layer
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} khi fetch ${url}`);
  }
  const html = await res.text();

  const totalRaw = extractField(html, "Số căn hộ") ?? extractField(html, "Tổng số căn");
  const totalUnits = parseIntVn(totalRaw?.replace(/[^\d.,]/g, ""));
  const { min, max } = parsePriceRange(html);
  const { district, city } = parseAddress(html);
  const handoverExpected = parseHandover(html);

  return {
    totalUnits,
    priceRangeMin: min,
    priceRangeMax: max,
    district,
    city,
    handoverExpected,
    scrapedAt: new Date().toISOString(),
    rawSize: html.length,
  };
}
