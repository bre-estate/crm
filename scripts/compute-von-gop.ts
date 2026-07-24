/**
 * Tính VỐN GÓP founder (Triết + Bách) từ data hiện có.
 *
 * Nguồn:
 *  - Chi Phí - Cá nhân MERGED.xlsx (Triết + Bách sheets, đã sửa tay + invoice)
 *  - SỔ TẠM ỨNG BRE.xlsx (Nga_HR + Tường Vi_admin, chỉ những row KHÔNG match
 *    với MERGED để tránh double count)
 *
 * Loại trừ (theo framework 2026-07-24):
 *  - Chi phí thứ cấp: khớp keyword "sang nhượng" hoặc "thưởng doanh số"
 *
 * Chưa loại: hóa đơn không hợp lệ (chờ file kế toán, sẽ có sau 1 tuần).
 * Do đó số này = ~90-95% chính xác, coi như vốn góp ước tính.
 *
 * Output: bảng theo tháng + tổng, group theo hạng mục.
 */
import * as XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";

const dir = path.join(process.cwd(), "data-excel");
const MERGED = path.join(dir, "Chi phí", "Chi Phí - Cá nhân MERGED.xlsx");
const TAM_UNG = path.join(dir, "Chi phí", "SỔ TẠM ỨNG BRE.xlsx");
const OUT = path.join(dir, "_von-gop-report.txt");

const clean = (v: unknown) => (v == null ? "" : String(v).trim());
const toNum = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const excelSerialToMonth = (n: number): string => {
  const ms = (n - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 7);
};
const normNoiDung = (s: string) =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, "")
    .replace(/[.,;:'"()]/g, "");

// Filter loại chi phí thứ cấp (khỏi công ty)
const SECONDARY_KEYWORDS = [
  "sang nhượng",
  "sang nhuong",
  "thưởng doanh số",
  "thuong doanh so",
];
const isSecondaryCost = (text: string): boolean => {
  const lower = text.toLowerCase();
  return SECONDARY_KEYWORDS.some((kw) => lower.includes(kw));
};

type Item = {
  thang: string;
  hangMuc: string;
  chiTiet: string;
  soTien: number;
  nguoi: string; // Triết / Bách
  source: string;
  isSecondary: boolean;
};

function readMerged(): Item[] {
  const wb = XLSX.readFile(MERGED);
  const out: Item[] = [];
  for (const nguoi of ["Triết", "Bách"]) {
    const ws = wb.Sheets[nguoi];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const hangMuc = clean(r[1]);
      if (hangMuc === "TỔNG") break;
      const chiTiet = clean(r[2]);
      const soTien = toNum(r[4]);
      const thang = clean(r[0]);
      if (!thang || soTien === 0) continue;
      const text = `${hangMuc} ${chiTiet}`;
      out.push({
        thang,
        hangMuc,
        chiTiet,
        soTien,
        nguoi,
        source: "MERGED",
        isSecondary: isSecondaryCost(text),
      });
    }
  }
  return out;
}

function readTamUng(): Item[] {
  const wb = XLSX.readFile(TAM_UNG);
  const out: Item[] = [];
  for (const sheetName of ["Nga_HR", "Tường Vi_admin"]) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    for (let i = 7; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const chi = toNum(r[3]);
      if (chi === 0) continue;
      const ngayRaw = r[0];
      const month = typeof ngayRaw === "number" ? excelSerialToMonth(ngayRaw) : "";
      if (!month) continue;
      const noiDung = clean(r[1]);
      out.push({
        thang: month,
        hangMuc: "",
        chiTiet: noiDung,
        soTien: chi,
        nguoi: "Bách", // Tất cả TU đều từ Bách (user confirm)
        source: `TU-${sheetName}`,
        isSecondary: isSecondaryCost(noiDung),
      });
    }
  }
  return out;
}

/**
 * Với TU rows, giữ CHỈ những row không match MERGED (tránh double count).
 * Match key: soTien + normalize nội dung.
 */
function dedupeTU(tu: Item[], merged: Item[]): Item[] {
  const mergedKeys = new Set<string>();
  for (const m of merged) {
    mergedKeys.add(`${m.soTien}|${normNoiDung(m.chiTiet)}`);
    if (m.hangMuc) mergedKeys.add(`${m.soTien}|${normNoiDung(m.hangMuc)}`);
  }
  return tu.filter(
    (t) => !mergedKeys.has(`${t.soTien}|${normNoiDung(t.chiTiet)}`),
  );
}

function main() {
  const merged = readMerged();
  const tuAll = readTamUng();
  const tuOnly = dedupeTU(tuAll, merged);
  const all = [...merged, ...tuOnly];

  const totalRaw = all.reduce((s, i) => s + i.soTien, 0);
  const secondary = all.filter((i) => i.isSecondary);
  const secondarySum = secondary.reduce((s, i) => s + i.soTien, 0);
  const company = all.filter((i) => !i.isSecondary);
  const companySum = company.reduce((s, i) => s + i.soTien, 0);

  // Vốn góp per founder
  const byNguoi = new Map<string, number>();
  for (const i of company) {
    byNguoi.set(i.nguoi, (byNguoi.get(i.nguoi) ?? 0) + i.soTien);
  }

  // Vốn góp per founder per month
  const byNguoiThang = new Map<string, Map<string, number>>();
  const months = new Set<string>();
  for (const i of company) {
    months.add(i.thang);
    if (!byNguoiThang.has(i.nguoi)) byNguoiThang.set(i.nguoi, new Map());
    const m = byNguoiThang.get(i.nguoi)!;
    m.set(i.thang, (m.get(i.thang) ?? 0) + i.soTien);
  }

  // Chi phí thứ cấp per month (để user biết đã loại bao nhiêu)
  const secByThang = new Map<string, number>();
  for (const i of secondary) {
    secByThang.set(i.thang, (secByThang.get(i.thang) ?? 0) + i.soTien);
  }

  // Group theo hạng mục (chi phí công ty)
  const byHangMuc = new Map<string, number>();
  for (const i of company) {
    // Nếu hạng mục rỗng (từ TU), fallback dùng chi tiết
    const cat = i.hangMuc || i.chiTiet || "(không rõ)";
    byHangMuc.set(cat, (byHangMuc.get(cat) ?? 0) + i.soTien);
  }

  const lines: string[] = [];
  const fmt = (n: number) => n.toLocaleString("vi-VN").padStart(16);
  lines.push("BÁO CÁO VỐN GÓP FOUNDER + CHI PHÍ CÔNG TY\n");
  lines.push(`Generated: ${new Date().toISOString()}\n`);
  lines.push(`Nguồn: MERGED (Triết + Bách) + Tạm Ứng (không trùng MERGED)\n`);
  lines.push(`Note: ước tính ~90-95%. Chưa loại hóa đơn không hợp lệ (chờ file kế toán).\n\n`);

  lines.push(`== TỔNG ==\n`);
  lines.push(`Tổng chi phí thô             : ${fmt(totalRaw)} VND\n`);
  lines.push(`Trừ chi phí thứ cấp (Bách)   : ${fmt(-secondarySum)} VND (${secondary.length} khoản)\n`);
  lines.push(`═════════════════════════════════════════\n`);
  lines.push(`CHI PHÍ CÔNG TY (= vốn góp) : ${fmt(companySum)} VND\n\n`);

  lines.push(`== VỐN GÓP TỪNG NGƯỜI ==\n`);
  for (const [ng, sum] of byNguoi) {
    lines.push(`  ${ng.padEnd(10)}: ${fmt(sum)} VND (${((sum / companySum) * 100).toFixed(1)}%)\n`);
  }
  lines.push("\n");

  lines.push(`== VỐN GÓP THEO THÁNG ==\n`);
  const sortedMonths = [...months].sort();
  lines.push(`Tháng    | Triết            | Bách             | Thứ cấp (loại)   | Tổng cty tháng\n`);
  lines.push(`---------+------------------+------------------+------------------+---------------\n`);
  for (const m of sortedMonths) {
    const t = byNguoiThang.get("Triết")?.get(m) ?? 0;
    const b = byNguoiThang.get("Bách")?.get(m) ?? 0;
    const sec = secByThang.get(m) ?? 0;
    lines.push(`${m}  | ${fmt(t)} | ${fmt(b)} | ${fmt(sec)} | ${fmt(t + b)}\n`);
  }
  lines.push(`---------+------------------+------------------+------------------+---------------\n`);
  const tTotal = byNguoi.get("Triết") ?? 0;
  const bTotal = byNguoi.get("Bách") ?? 0;
  lines.push(`TỔNG     | ${fmt(tTotal)} | ${fmt(bTotal)} | ${fmt(secondarySum)} | ${fmt(companySum)}\n\n`);

  lines.push(`== CHI PHÍ CÔNG TY THEO HẠNG MỤC (top 30) ==\n`);
  const sortedCats = [...byHangMuc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [cat, sum] of sortedCats) {
    lines.push(`  ${cat.padEnd(50).slice(0, 50)} ${fmt(sum)} VND (${((sum / companySum) * 100).toFixed(1)}%)\n`);
  }
  lines.push("\n");

  lines.push(`== CHI PHÍ THỨ CẤP ĐÃ LOẠI (${secondary.length} khoản) ==\n`);
  for (const i of secondary.sort((a, b) => a.thang.localeCompare(b.thang))) {
    lines.push(`  ${i.thang} · ${i.chiTiet.slice(0, 60).padEnd(60)} · ${fmt(i.soTien)}\n`);
  }

  fs.writeFileSync(OUT, lines.join(""));
  console.log(lines.join(""));
  console.log(`\n✅ Report: ${OUT}`);
}

main();
