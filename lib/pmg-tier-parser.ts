/**
 * Parse cột "BIỂU PMG" (text tự do) → JSON tiers có cấu trúc.
 * Hỗ trợ 3 metric:
 *   - 'count':   theo số căn X (VD "X < 30 SP: 6%")
 *   - 'percent': theo % giỏ hàng Y (VD "Y < 50%: 4,5%")
 *   - 'other':   dạng phức tạp (PDV + PQLKD + PLT, hồi tố tự do) — không parse được
 *
 * Trả về null nếu không match → operator xem raw text.
 */

export type PmgTier = {
  min: number;
  max: number | null;
  rate: number;
  saleRate?: number | null;
  saleCap?: number | null;
  note?: string;
};

export type ParsedPmg = {
  tiers: PmgTier[] | null;
  metric: "count" | "percent" | "combined" | "other";
  retroactive: boolean;
  notes: string | null;
  raw: string;
};

// "4,5%" | "5%" | "6,75%" | "6.5%" → 0.045
// Range "6,75-7%" | "6-6,25%" | "6,25%-6,75%-7%" → lấy MAX (7% / 6.25% / 7%)
function parsePct(s: string): number | null {
  s = s.trim().replace(/,/g, ".").replace(/%/g, "");
  const nums = s.split(/\s*-\s*/).map(x => Number(x)).filter(n => !isNaN(n));
  if (nums.length === 0) return null;
  return Math.max(...nums) / 100;
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/=</g, "<=")
    .replace(/=>/g, ">=")
    // Collapse "6,25% - 6,75% - 7%" → "6,25%-6,75%-7%" (rate ranges)
    .replace(/(\d)\s*%\s*-\s*(\d)/g, "$1%-$2")
    .replace(/(\d)\s*-\s*(\d)\s*%/g, "$1-$2%")
    .trim();
}

/**
 * Detect metric từ text:
 *   - có "%" trong condition (VD "Y < 50%") → percent
 *   - có "căn" hoặc "SP" hoặc "sản phẩm" → count
 */
function detectMetric(raw: string): "count" | "percent" | "combined" | "other" {
  const t = raw.toLowerCase();
  const hasCombined = /pdv|pqlkd|plt|qlkd/i.test(raw);
  if (hasCombined) return "combined";

  const percentCond = /[xy]\s*[<>]=?\s*\d+\s*%/i.test(t);
  const countCond = /\b(căn|sp|sản\s*phẩm)\b/i.test(t) && /[xy]?\s*[<>]?=?\s*\d/.test(t);

  if (percentCond && !countCond) return "percent";
  if (countCond && !percentCond) return "count";
  if (percentCond && countCond) return "combined";
  return "other";
}

function detectRetroactive(raw: string): boolean {
  return /hồi\s*tố|hoi\s*to/i.test(raw);
}

/**
 * Parse dạng bậc theo count: "X < 30: 6% | 30 <= X < 60: 6,25% | X >= 60: 6,75%"
 * hoặc "Từ 1-2 căn: 4% | Từ 3-4 căn: 4,5% | Từ 5 căn trở lên: 5%"
 */
function parseCountTiers(raw: string): PmgTier[] | null {
  let t = normalizeText(raw);
  const tiers: PmgTier[] = [];

  const rangeRe = /(\d+)\s*<=?\s*x\s*<=?\s*(\d+)\s*(?:sp|sản\s*phẩm|căn(?:\s*hộ)?)?\s*:?\s*([\d.,\-%]+)/gi;
  const fromToRe = /(?:từ\s*)?0*(\d+)\s*(?:-|đến|tới)\s*0*(\d+)\s*(?:sp|sản\s*phẩm|căn(?:\s*hộ)?)\s*:?\s*([\d.,\-%]+)/gi;
  const oneSideRe = /x\s*(<=?|>=?)\s*(\d+)\s*(?:sp|sản\s*phẩm|căn(?:\s*hộ)?)?\s*:?\s*([\d.,\-%]+)/gi;
  const fromRe = /(?:từ\s*)?0*(\d+)\s*(?:sp|sản\s*phẩm|căn(?:\s*hộ)?)\s*(?:trở\s*lên)\s*:?\s*([\d.,\-%]+)/gi;

  // Order matters: parse ranges FIRST, then strip matched substring to avoid oneSideRe re-matching the tail
  const consume = (re: RegExp, handler: (m: RegExpExecArray) => void) => {
    const matches: Array<{ start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(t)) !== null) {
      handler(m);
      matches.push({ start: m.index, end: m.index + m[0].length });
    }
    // Strip in reverse to keep indices stable
    for (const { start, end } of matches.reverse()) {
      t = t.slice(0, start) + " ".repeat(end - start) + t.slice(end);
    }
  };

  consume(rangeRe, (m) => {
    const min = Number(m[1]), max = Number(m[2]);
    const rate = parsePct(m[3]);
    if (rate != null) tiers.push({ min, max, rate });
  });
  consume(fromToRe, (m) => {
    const min = Number(m[1]), max = Number(m[2]);
    const rate = parsePct(m[3]);
    if (rate != null) tiers.push({ min, max, rate });
  });
  consume(oneSideRe, (m) => {
    const op = m[1], n = Number(m[2]);
    const rate = parsePct(m[3]);
    if (rate == null) return;
    if (op === "<" || op === "<=") {
      tiers.push({ min: 0, max: op === "<" ? n - 1 : n, rate });
    } else {
      tiers.push({ min: op === ">" ? n + 1 : n, max: null, rate });
    }
  });
  consume(fromRe, (m) => {
    const min = Number(m[1]);
    const rate = parsePct(m[2]);
    if (rate != null) tiers.push({ min, max: null, rate });
  });

  if (tiers.length === 0) return null;
  const seen = new Set<string>();
  const dedup = tiers.filter(x => {
    const k = `${x.min}_${x.max}_${x.rate}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  dedup.sort((a, b) => a.min - b.min);
  return dedup;
}

/**
 * Parse dạng bậc theo percent: "Y < 50%: 4,5% | 50% <= Y <= 90%: 5% | 90% <= Y: 5,5%"
 */
function parsePercentTiers(raw: string): PmgTier[] | null {
  let t = normalizeText(raw);
  const tiers: PmgTier[] = [];

  const rangeRe = /(\d+(?:[.,]\d+)?)\s*%\s*<=?\s*y\s*<=?\s*(\d+(?:[.,]\d+)?)\s*%\s*:?\s*([\d.,\-%]+)/gi;
  const oneSideRe = /y\s*(<=?|>=?)\s*(\d+(?:[.,]\d+)?)\s*%\s*:?\s*([\d.,\-%]+)/gi;
  // "N% <=? Y : R%" (percent trước Y)
  const leftFirstRe = /(\d+(?:[.,]\d+)?)\s*%\s*(<=?|>=?)\s*y\s*:?\s*([\d.,\-%]+)/gi;

  const consume = (re: RegExp, handler: (m: RegExpExecArray) => void) => {
    const matches: Array<{ start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(t)) !== null) {
      handler(m);
      matches.push({ start: m.index, end: m.index + m[0].length });
    }
    for (const { start, end } of matches.reverse()) {
      t = t.slice(0, start) + " ".repeat(end - start) + t.slice(end);
    }
  };

  consume(rangeRe, (m) => {
    const min = Number(m[1].replace(",", ".")) / 100;
    const max = Number(m[2].replace(",", ".")) / 100;
    const rate = parsePct(m[3]);
    if (rate != null) tiers.push({ min, max, rate });
  });
  consume(oneSideRe, (m) => {
    const op = m[1];
    const n = Number(m[2].replace(",", ".")) / 100;
    const rate = parsePct(m[3]);
    if (rate == null) return;
    if (op === "<" || op === "<=") tiers.push({ min: 0, max: n, rate });
    else tiers.push({ min: n, max: null, rate });
  });
  // "N% <=? Y" — nghĩa là "Y >= N%", swap op
  consume(leftFirstRe, (m) => {
    const n = Number(m[1].replace(",", ".")) / 100;
    const op = m[2]; // op giữa N và Y
    const rate = parsePct(m[3]);
    if (rate == null) return;
    // "N <= Y" == "Y >= N"
    if (op === "<" || op === "<=") tiers.push({ min: n, max: null, rate });
    else tiers.push({ min: 0, max: n, rate });
  });

  if (tiers.length === 0) return null;
  const seen = new Set<string>();
  const dedup = tiers.filter(x => {
    const k = `${x.min}_${x.max}_${x.rate}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  dedup.sort((a, b) => a.min - b.min);
  return dedup;
}

/**
 * Extract sale_cap từ note (VD "Phí tính doanh thu cho NVKD không quá 5%")
 */
function extractSaleCap(raw: string): number | null {
  const m = raw.match(/nvkd[^0-9]*(\d+(?:[.,]\d+)?)\s*%/i);
  if (!m) return null;
  return Number(m[1].replace(",", ".")) / 100;
}

export function parsePmgStructure(raw: string | null | undefined): ParsedPmg | null {
  if (!raw || !raw.trim()) return null;
  const text = raw.trim();
  const metric = detectMetric(text);
  const retroactive = detectRetroactive(text);
  const saleCap = extractSaleCap(text);
  const notes = saleCap != null ? `NVKD ≤ ${(saleCap * 100).toFixed(1).replace(".0", "")}%` : null;

  let tiers: PmgTier[] | null = null;
  if (metric === "count") tiers = parseCountTiers(text);
  else if (metric === "percent") tiers = parsePercentTiers(text);
  else if (metric === "combined") {
    // Thử count trước, fallback percent
    tiers = parseCountTiers(text) ?? parsePercentTiers(text);
  }

  if (tiers && saleCap != null) {
    for (const t of tiers) {
      if (t.rate > saleCap) t.saleCap = saleCap;
    }
  }

  return {
    tiers,
    metric,
    retroactive,
    notes,
    raw: text,
  };
}

/**
 * Cho X (số căn đã bán) hoặc Y (% giỏ hàng bán), trả về tier tương ứng.
 */
export function tierAt(tiers: PmgTier[] | null | undefined, value: number): PmgTier | null {
  if (!tiers || tiers.length === 0) return null;
  for (const t of tiers) {
    if (value >= t.min && (t.max == null || value <= t.max)) return t;
  }
  return null;
}
