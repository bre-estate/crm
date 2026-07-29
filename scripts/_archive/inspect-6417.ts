import * as XLSX from "xlsx";

const wb = XLSX.readFile("data-excel/SO SACH BRE 2025.xlsx");
const fmt = (n: number) => (isNaN(n) ? "-" : Math.round(n).toLocaleString("vi-VN"));

// Dump sheet 6417 full structure
const sheet = "6417";
console.log(`═════════════════════════════════════════════════`);
console.log(`  Sheet "${sheet}" — Chi phí dịch vụ mua ngoài (BÁN HÀNG)`);
console.log(`═════════════════════════════════════════════════\n`);
const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheet], {
  header: 1,
  blankrows: false,
});

// Show header first
for (let i = 0; i < Math.min(10, rows.length); i++) {
  const cells = (rows[i] ?? []).map((c: any) => {
    if (c === null || c === undefined) return "";
    return String(c).substring(0, 55);
  });
  console.log(`  [${String(i).padStart(3)}] ${cells.join(" | ")}`);
}
console.log(`  ...`);

// Try to find data rows (skip header). Detect by having numeric col
let dataStart = -1;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i] ?? [];
  const lastNum = Number(r[r.length - 1] ?? 0);
  if (lastNum > 100000) {
    dataStart = i;
    break;
  }
}
console.log(`\n  Data starts row ~${dataStart}`);

// Try parsing structure: seem sổ chi tiết TK format
// Typical cols: Ngày | Số CT | Loại CT | Diễn giải | TK đối ứng | PS Nợ | PS Có
console.log(`\n=== 6417 detail (dump all data rows) ===\n`);
console.log(`  Ngày       | Loại CT | Số | Diễn giải                                        | TK đứng | PS Nợ`);
let sumPsNo = 0;
const byDescBucket = new Map<string, { total: number; cnt: number }>();
const byMonth = new Map<string, { total: number; cnt: number }>();

for (let i = dataStart; i < rows.length; i++) {
  const r = rows[i] ?? [];
  if (!r || r.length === 0) continue;
  const cells = (r as any[]).map((c) => (c === null || c === undefined ? "" : String(c)));

  // Extract numeric fields at end
  const nums: number[] = [];
  for (let k = 0; k < r.length; k++) {
    const n = Number(r[k]);
    if (!isNaN(n) && n > 0 && String(r[k]).length > 3) nums.push(n);
  }
  const lastNum = nums.length > 0 ? nums[nums.length - 1] : 0;
  if (lastNum < 1000) continue;

  // Try to parse date (likely col 0 or 1)
  let date = "";
  for (let k = 0; k < 3; k++) {
    const v = r[k];
    if (typeof v === "number" && v > 40000 && v < 50000) {
      // Excel serial date
      const jsDate = new Date(Math.round((v - 25569) * 86400 * 1000));
      date = jsDate.toISOString().slice(0, 10);
      break;
    }
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      date = v.slice(0, 10);
      break;
    }
  }

  // Find description (longest text field)
  let desc = "";
  for (const c of cells) {
    if (c.length > desc.length && !/^\d/.test(c)) desc = c;
  }

  // Print
  const shortDesc = desc.substring(0, 60);
  console.log(`  ${date.padEnd(10)} | ${fmt(lastNum).padStart(14)} | ${shortDesc}`);

  sumPsNo += lastNum;

  // Bucket by description keyword
  const dLower = desc.toLowerCase();
  let bucket = "khác";
  if (dLower.includes("hoa hồng") || dLower.includes("hh")) bucket = "1_HH_sale";
  else if (dLower.includes("thưởng")) bucket = "2_thưởng";
  else if (
    dLower.includes("quảng cáo") ||
    dLower.includes("marketing") ||
    dLower.includes("ads") ||
    dLower.includes("facebook") ||
    dLower.includes("google")
  )
    bucket = "3_marketing";
  else if (dLower.includes("hỗ trợ khách") || dLower.includes("chiết khấu"))
    bucket = "4_hỗ_trợ_KH";
  else if (dLower.includes("kpi")) bucket = "5_KPI";

  const cur = byDescBucket.get(bucket) ?? { total: 0, cnt: 0 };
  cur.total += lastNum;
  cur.cnt++;
  byDescBucket.set(bucket, cur);

  if (date) {
    const m = date.slice(0, 7);
    const cm = byMonth.get(m) ?? { total: 0, cnt: 0 };
    cm.total += lastNum;
    cm.cnt++;
    byMonth.set(m, cm);
  }
}

console.log(`\n=== TOTAL PS Nợ 6417 (kiểm tra): ${fmt(sumPsNo)} (CDPS: 3,088,940,192) ===`);

console.log(`\n=== Bucket theo keyword ===`);
for (const [k, v] of [...byDescBucket.entries()].sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${k.padEnd(20)} · ${fmt(v.total).padStart(16)} · ${v.cnt} rows`);
}

console.log(`\n=== Theo tháng ===`);
for (const [k, v] of [...byMonth.entries()].sort()) {
  console.log(`  ${k} · ${fmt(v.total).padStart(16)} · ${v.cnt} rows`);
}
