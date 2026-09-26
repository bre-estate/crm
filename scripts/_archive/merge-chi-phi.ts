/**
 * Merge Chi Phí Cá nhân 1 + 2 → 1 file duy nhất, format giống file 1
 * (2 sheet Triết + Bách), thêm cột "Tháng" (YYYY-MM) từ nguồn.
 *
 * Cross-check: match từng row giữa file 1 và file 2 để tìm delta.
 *
 * Output:
 *   data-excel/Chi Phí - Cá nhân MERGED.xlsx
 *   data-excel/_delta-report.txt
 *
 * Run: npx tsx scripts/merge-chi-phi.ts
 */
import * as XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";

const dir = path.join(process.cwd(), "data-excel");
const OUT_FILE = path.join(dir, "Chi Phí - Cá nhân MERGED.xlsx");
const REPORT_FILE = path.join(dir, "_delta-report.txt");

type Row = {
  hangMuc: string;
  chiTiet: string;
  note: string;
  soTien: number;
  ncc: string; // Nhà cung cấp
  source: string;
  ngayChi: string; // normalized YYYY-MM-DD or "" if invalid
  ngayChiRaw: string; // original for display
  hoaDon: string;
  nguoi: string; // Triết / Bách
  thang: string; // YYYY-MM
  origin: string; // Nguồn: F1-Triết / F1-Bách / F2-<sheet>
  flags: string[]; // ["ngày lệch tháng sheet", "0đ", "trống hạng mục"...]
};

const clean = (v: unknown): string => {
  if (v == null) return "";
  const s = String(v).trim();
  return s.replace(/\s+/g, " ");
};

const toNum = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/**
 * Chuẩn hoá ngày chi. Excel có thể trả về:
 *  - number (serial date 45331 = 30/09/2024)
 *  - string "30/09/2024"
 *  - "26/09/2024" mix
 *  - "" hoặc null
 * Return YYYY-MM-DD hoặc "".
 */
const excelSerialToDate = (n: number): string => {
  // Excel epoch: 1899-12-30. Cộng ngày → JS Date.
  const ms = (n - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const normDate = (raw: unknown): { iso: string; display: string } => {
  if (raw == null || raw === "") return { iso: "", display: "" };
  if (typeof raw === "number") {
    if (raw < 20000 || raw > 60000) return { iso: "", display: String(raw) };
    const iso = excelSerialToDate(raw);
    return { iso, display: iso ? formatVN(iso) : String(raw) };
  }
  const s = String(raw).trim();
  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const iso = `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
    return { iso, display: s };
  }
  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return { iso: s, display: formatVN(s) };
  return { iso: "", display: s };
};

const formatVN = (iso: string): string => {
  const [y, mo, d] = iso.split("-");
  return `${d}/${mo}/${y}`;
};

const monthOf = (iso: string): string => iso ? iso.slice(0, 7) : "";

// Convert "T9.2024" → "2024-09"
const sheetToMonth = (name: string): string => {
  const m = name.match(/^T(\d{1,2})\.(\d{4})$/);
  if (!m) return "";
  return `${m[2]}-${m[1].padStart(2, "0")}`;
};

function readMonthSheetF2(rows: any[][], sheetName: string): Row[] {
  const sheetMonth = sheetToMonth(sheetName);
  const out: Row[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const hangMuc = clean(r[0]);
    const chiTiet = clean(r[1]);
    const soTien = toNum(r[3]);
    if (!hangMuc && !chiTiet && soTien === 0) continue;
    // Ngày chi Excel serial hay bị lệch locale — không parse, giữ raw để user
    // xem tham khảo. Tháng dùng theo tab (source of truth).
    const display = r[6] == null ? "" : String(r[6]).trim();
    const flags: string[] = [];
    if (soTien === 0) flags.push("0đ");
    if (!hangMuc) flags.push("trống hạng mục");
    const nguoi = clean(r[7]);
    if (!nguoi) flags.push("trống người chi");
    out.push({
      hangMuc,
      chiTiet,
      note: clean(r[2]),
      soTien,
      ncc: clean(r[4]),
      source: clean(r[5]),
      ngayChi: "",
      ngayChiRaw: display,
      hoaDon: clean(r[8]),
      nguoi: nguoi || "?",
      thang: sheetMonth,
      origin: `F2-${sheetName}`,
      flags,
    });
  }
  return out;
}

function readPersonSheetF1(rows: any[][], nguoi: string): Row[] {
  const out: Row[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const hangMuc = clean(r[0]);
    const chiTiet = clean(r[1]);
    const soTien = toNum(r[3]);
    if (!hangMuc && !chiTiet && soTien === 0) continue;
    const display = r[6] == null ? "" : String(r[6]).trim();
    const flags: string[] = [];
    if (soTien === 0) flags.push("0đ");
    if (!display) flags.push("thiếu ngày");
    if (!hangMuc) flags.push("trống hạng mục");
    // F1 không có tab tháng → để trống tháng, chờ user cấp qua F2 hoặc
    // user tự điền. Row F1-only chỉ để cross-check với F2.
    out.push({
      hangMuc,
      chiTiet,
      note: clean(r[2]),
      soTien,
      ncc: clean(r[4]),
      source: clean(r[5]),
      ngayChi: "",
      ngayChiRaw: display,
      hoaDon: clean(r[7]),
      nguoi,
      thang: "",
      origin: `F1-${nguoi}`,
      flags,
    });
  }
  return out;
}

const rowKey = (r: Row): string => {
  // Key match: nguoi + soTien + normalized (hangMuc + chiTiet)
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").replace(/[.,;]/g, "");
  return `${r.nguoi}|${r.soTien}|${norm(r.hangMuc)}|${norm(r.chiTiet)}`;
};

// Invoice data extracted từ PDFs trong data-excel/Invoice/
// FX rate USD → VND: 26.000 (đơn giá tham chiếu, chỉnh trong cell nếu cần).
const FX = 26000;
const round = (v: number) => Math.round(v);
const invoiceRows: Row[] = [
  // === Google Workspace (bre.vn) — Triết trả bằng thẻ ===
  ...[
    { thang: "2024-10", usd: 4.40, so: "5096394450" },
    { thang: "2024-11", usd: 7.58, so: "5123720819" },
    { thang: "2024-12", usd: 7.58, so: "5139904547" },
    { thang: "2025-01", usd: 7.58, so: "5164458724" },
    { thang: "2025-02", usd: 7.58, so: "5187948137" },
    { thang: "2025-03", usd: 7.58, so: "5214015459" },
    { thang: "2025-04", usd: 7.58, so: "5235713237" },
    { thang: "2025-05", usd: 7.58, so: "5268030881" },
    { thang: "2025-06", usd: 7.58, so: "5291745473" },
    { thang: "2025-07", usd: 8.00, so: "5323325647" },
    { thang: "2025-08", usd: 8.00, so: "5346443492" },
    { thang: "2025-09", usd: 8.00, so: "5367582774" },
    { thang: "2025-10", usd: 11.09, so: "5393249324" },
    { thang: "2025-11", usd: 13.33, so: "5421709926" },
    { thang: "2025-12", usd: 13.33, so: "5450594521" },
    { thang: "2026-01", usd: 13.33, so: "5479344207" },
    { thang: "2026-02", usd: 13.33, so: "5501684958" },
    { thang: "2026-03", usd: 13.33, so: "5533373665" },
    { thang: "2026-04", usd: 13.33, so: "5559807833" },
    { thang: "2026-05", usd: 13.33, so: "5588286369" },
    { thang: "2026-06", usd: 13.33, so: "5615470592" },
  ].map<Row>(({ thang, usd, so }) => ({
    hangMuc: "Google Workspace",
    chiTiet: `Business Standard bre.vn (${usd.toFixed(2)} USD × ${FX.toLocaleString("vi-VN")})`,
    note: "",
    soTien: round(usd * FX),
    ncc: "Google Asia Pacific",
    source: "Cá nhân",
    ngayChi: "",
    ngayChiRaw: `Cuối ${thang.split("-")[1]}/${thang.split("-")[0].slice(2)}`,
    hoaDon: so,
    nguoi: "Triết",
    thang,
    origin: "F3-Invoice-GW",
    flags: ["từ invoice PDF"],
  })),

  // === Vultr server (bre-staging) — Triết trả ===
  {
    hangMuc: "Server",
    chiTiet: "Vultr 4GB bre-staging + Backup (28.80 USD − 5 credit + VAT ≈ 26.68 USD × 26.000)",
    note: "Kỳ 02/06 - 01/07/2026, chi phí thực sau credit",
    soTien: round(26.68 * FX),
    ncc: "Vultr",
    source: "Cá nhân",
    ngayChi: "",
    ngayChiRaw: "01/07/2026",
    hoaDon: "29773019",
    nguoi: "Triết",
    thang: "2026-06",
    origin: "F3-Invoice-Vultr",
    flags: ["từ invoice PDF"],
  },

  // === Envato — Houzez WordPress theme (mua 1 lần) ===
  {
    hangMuc: "Website",
    chiTiet: "Houzez theme + 6 tháng support (67.00 USD × 26.000)",
    note: "",
    soTien: round(67.0 * FX),
    ncc: "Envato / favethemes",
    source: "Cá nhân",
    ngayChi: "",
    ngayChiRaw: "31/05/2026",
    hoaDon: "IVIP56850549",
    nguoi: "Triết",
    thang: "2026-05",
    origin: "F3-Invoice-Envato",
    flags: ["từ invoice PDF"],
  },
  {
    hangMuc: "Website",
    chiTiet: "Envato Buyer Fee (12.00 USD × 26.000)",
    note: "",
    soTien: round(12.0 * FX),
    ncc: "Envato",
    source: "Cá nhân",
    ngayChi: "",
    ngayChiRaw: "31/05/2026",
    hoaDon: "IVBF56343576",
    nguoi: "Triết",
    thang: "2026-05",
    origin: "F3-Invoice-Envato",
    flags: ["từ invoice PDF"],
  },
  {
    hangMuc: "Website",
    chiTiet: "Envato Handling Fee (3.00 USD × 26.000)",
    note: "",
    soTien: round(3.0 * FX),
    ncc: "Envato",
    source: "Cá nhân",
    ngayChi: "",
    ngayChiRaw: "31/05/2026",
    hoaDon: "IVHF37080328",
    nguoi: "Triết",
    thang: "2026-05",
    origin: "F3-Invoice-Envato",
    flags: ["từ invoice PDF"],
  },
];

function main() {
  const wb1 = XLSX.readFile(path.join(dir, "Chi Phí - Cá nhân 1.xlsx"));
  const wb2 = XLSX.readFile(path.join(dir, "Chi Phí - Cá nhân 2.xlsx"));

  // === Đọc file 1 ===
  const f1Triet = readPersonSheetF1(
    XLSX.utils.sheet_to_json<any[]>(wb1.Sheets["Triết"], { header: 1, defval: null, raw: true }),
    "Triết",
  );
  const f1Bach = readPersonSheetF1(
    XLSX.utils.sheet_to_json<any[]>(wb1.Sheets["Bách"], { header: 1, defval: null, raw: true }),
    "Bách",
  );

  // === Đọc file 2 (mọi sheet Txx.YYYY) ===
  const monthSheets = wb2.SheetNames.filter((n) => /^T\d{1,2}\.\d{4}$/.test(n));
  const f2All: Row[] = [];
  for (const s of monthSheets) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb2.Sheets[s], { header: 1, defval: null, raw: true });
    f2All.push(...readMonthSheetF2(rows, s));
  }
  const f2Triet = f2All.filter((r) => r.nguoi === "Triết");
  const f2Bach = f2All.filter((r) => r.nguoi === "Bách");

  console.log(`File 1: Triết ${f1Triet.length}, Bách ${f1Bach.length} rows`);
  console.log(`File 2 (từ ${monthSheets.length} sheet): Triết ${f2Triet.length}, Bách ${f2Bach.length} rows`);

  // === Diff ===
  const report: string[] = [];
  report.push("BÁO CÁO DELTA GIỮA FILE 1 và FILE 2\n");
  report.push("Generated: " + new Date().toISOString() + "\n\n");

  function diff(list1: Row[], list2: Row[], who: string) {
    const map1 = new Map<string, Row[]>();
    const map2 = new Map<string, Row[]>();
    for (const r of list1) {
      const k = rowKey(r);
      (map1.get(k) ?? map1.set(k, []).get(k))!.push(r);
    }
    for (const r of list2) {
      const k = rowKey(r);
      (map2.get(k) ?? map2.set(k, []).get(k))!.push(r);
    }
    const onlyIn1: Row[] = [];
    const onlyIn2: Row[] = [];
    const inBoth: number = [...map1.keys()].filter((k) => map2.has(k)).length;
    for (const [k, rows] of map1) {
      if (!map2.has(k)) onlyIn1.push(...rows);
    }
    for (const [k, rows] of map2) {
      if (!map1.has(k)) onlyIn2.push(...rows);
    }
    report.push(`=== ${who.toUpperCase()} ===\n`);
    report.push(`File 1: ${list1.length} rows | File 2: ${list2.length} rows | Match key: ${inBoth}\n`);
    report.push(`\n[!] CHỈ CÓ Ở FILE 1 (${onlyIn1.length} rows) — cần dò xem F2 thiếu:\n`);
    for (const r of onlyIn1) {
      report.push(`  ${r.thang || "??"} · ${r.hangMuc} · ${r.chiTiet || "-"} · ${r.soTien.toLocaleString("vi-VN")} · ${r.ngayChiRaw}\n`);
    }
    report.push(`\n[!] CHỈ CÓ Ở FILE 2 (${onlyIn2.length} rows) — F1 thiếu:\n`);
    for (const r of onlyIn2) {
      report.push(`  ${r.thang || "??"} · ${r.hangMuc} · ${r.chiTiet || "-"} · ${r.soTien.toLocaleString("vi-VN")} · ${r.ngayChiRaw} (${r.origin})\n`);
    }
    report.push("\n");
    return { onlyIn1, onlyIn2 };
  }

  const dTriet = diff(f1Triet, f2Triet, "Triết");
  const dBach = diff(f1Bach, f2Bach, "Bách");

  // Row cần dò (có flag)
  function reportFlagged(list: Row[], who: string) {
    const flagged = list.filter((r) => r.flags.length > 0);
    report.push(`=== ${who.toUpperCase()} — CẦN DÒ (${flagged.length}) ===\n`);
    for (const r of flagged) {
      report.push(`  ${r.thang || "??"} · ${r.hangMuc || "(trống)"} · ${r.chiTiet || "-"} · ${r.soTien.toLocaleString("vi-VN")} · ${r.ngayChiRaw || "(trống)"} · [${r.flags.join(" | ")}] (${r.origin})\n`);
    }
    report.push("\n");
  }
  reportFlagged(f2Triet, "Triết F2");
  reportFlagged(f2Bach, "Bách F2");
  reportFlagged(f1Triet, "Triết F1");
  reportFlagged(f1Bach, "Bách F1");

  // === Merge: union — ưu tiên F2 (có Người chi + tháng rõ). F1-only đưa vào.
  //     Đánh dấu row bằng cột "Nguồn" để user dò.
  function mergeList(fromF1: Row[], fromF2: Row[]): Row[] {
    const mapF2 = new Map<string, Row>();
    for (const r of fromF2) mapF2.set(rowKey(r), r);
    const merged: Row[] = [...fromF2];
    for (const r of fromF1) {
      if (!mapF2.has(rowKey(r))) {
        merged.push({ ...r, flags: [...r.flags, "chỉ có ở F1"] });
      }
    }
    merged.sort((a, b) => {
      const t = (a.thang || "9999").localeCompare(b.thang || "9999");
      if (t !== 0) return t;
      return (a.ngayChi || "9999").localeCompare(b.ngayChi || "9999");
    });
    return merged;
  }

  const mergedTriet = mergeList(f1Triet, f2Triet);
  const mergedBach = mergeList(f1Bach, f2Bach);

  // Thêm invoice rows (chưa note trong file gốc — chi phí website/GW/server)
  const invTriet = invoiceRows.filter((r) => r.nguoi === "Triết");
  const invBach = invoiceRows.filter((r) => r.nguoi === "Bách");
  mergedTriet.push(...invTriet);
  mergedBach.push(...invBach);
  // Re-sort sau khi merge invoice
  const sortByThangNgay = (a: Row, b: Row) => {
    const t = (a.thang || "9999").localeCompare(b.thang || "9999");
    if (t !== 0) return t;
    return (a.ngayChi || "9999").localeCompare(b.ngayChi || "9999");
  };
  mergedTriet.sort(sortByThangNgay);
  mergedBach.sort(sortByThangNgay);
  console.log(`Thêm invoice: Triết ${invTriet.length}, Bách ${invBach.length}`);

  // === Ghi file output ===
  const HEADERS = [
    "Tháng",
    "Hạng mục",
    "Chi Tiết",
    "Note",
    "Số tiền",
    "Nhà cung cấp",
    "Source",
    "Ngày chi",
    "Hóa đơn",
    "Nguồn",
    "Cờ dò",
  ];

  const toAoA = (list: Row[]): any[][] => {
    const total = list.reduce((s, r) => s + r.soTien, 0);
    return [
      HEADERS,
      ...list.map((r) => [
        r.thang,
        r.hangMuc,
        r.chiTiet,
        r.note,
        r.soTien,
        r.ncc,
        r.source,
        r.ngayChiRaw,
        r.hoaDon,
        r.origin,
        r.flags.join(" · "),
      ]),
      [],
      ["", "TỔNG", "", "", total, "", "", "", "", "", ""],
    ];
  };

  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(toAoA(mergedTriet)), "Triết");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(toAoA(mergedBach)), "Bách");

  // Sheet Tổng Kết theo tháng
  const monthTotals = new Map<string, { triet: number; bach: number }>();
  for (const r of mergedTriet) {
    if (!r.thang) continue;
    const cur = monthTotals.get(r.thang) ?? { triet: 0, bach: 0 };
    cur.triet += r.soTien;
    monthTotals.set(r.thang, cur);
  }
  for (const r of mergedBach) {
    if (!r.thang) continue;
    const cur = monthTotals.get(r.thang) ?? { triet: 0, bach: 0 };
    cur.bach += r.soTien;
    monthTotals.set(r.thang, cur);
  }
  const sortedMonths = [...monthTotals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const summaryRows: any[][] = [["Tháng", "Tổng chi", "Triết", "Bách"]];
  let grandT = 0, grandB = 0;
  for (const [m, v] of sortedMonths) {
    summaryRows.push([m, v.triet + v.bach, v.triet, v.bach]);
    grandT += v.triet; grandB += v.bach;
  }
  summaryRows.push([]);
  summaryRows.push(["TỔNG", grandT + grandB, grandT, grandB]);
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(summaryRows), "Tổng Kết");

  XLSX.writeFile(wbOut, OUT_FILE);
  fs.writeFileSync(REPORT_FILE, report.join(""));

  console.log(`\n✅ Đã ghi:`);
  console.log(`   ${OUT_FILE}`);
  console.log(`   ${REPORT_FILE}`);
  console.log(`\nMerged Triết: ${mergedTriet.length}, Bách: ${mergedBach.length}`);
  console.log(`Delta F1-only: Triết ${dTriet.onlyIn1.length}, Bách ${dBach.onlyIn1.length}`);
  console.log(`Delta F2-only: Triết ${dTriet.onlyIn2.length}, Bách ${dBach.onlyIn2.length}`);
}

main();
