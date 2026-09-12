/**
 * Đọc bảng lương từng tháng trên Drive → payroll_months (từng người: lương cơ bản, phụ cấp, hoa hồng, thưởng).
 * Sheet đọc: "3-Bangluong-HĐLĐ" (nhân viên hợp đồng) và "Bangluong-CTV-*" / "CTV-*" (cộng tác viên).
 * Cột nhận diện theo tiêu đề dòng phụ (LƯƠNG CƠ BẢN, HOA HỒNG, THƯỞNG..., THÙ LAO), vì mỗi tháng thứ tự cột khác nhau.
 *
 *   npx tsx scripts/import-payroll.ts            # xem trước
 *   npx tsx scripts/import-payroll.ts --apply    # ghi (upsert theo tháng + loại + tên)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

const ROOT = process.env.PAYROLL_DIR ?? path.resolve(process.env.HOME ?? "", "Documents/Company/BRE/App/Drive/4-Kế Toán - BRE/4.1-Bảng lương");
const APPLY = process.argv.includes("--apply");
const nfc = (s: string) => s.normalize("NFC");
const up = (v: unknown) => nfc(String(v ?? "")).toUpperCase().replace(/\s+/g, " ").trim();
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^-?[\d.,]+$/.test(v.trim()) ? Number(v.replace(/,/g, "")) : 0);

export interface PayrollRow { month: string; kind: "hdld" | "ctv"; code: string | null; name: string; position: string | null; baseSalary: number; allowances: number; commission: number; bonus: number; grossTotal: number | null; sourceFile: string }

const ALLOWANCE_HEADS = ["PHỤ CẤP", "CHUYÊN CẦN", "KHOÁN CHI", "TIỀN HỖ TRỢ", "HỖ TRỢ XĂNG", "HỖ TRỢ ĐIỆN", "CHI PHÍ ĐI LẠI", "CHI PHÍ GIẤY TỜ", "TRANG BỊ", "CHI PHÍ HỖ TRỢ", "LƯƠNG TĂNG CA", "TRUY LÃNH"];
const BONUS_HEADS = ["THƯỞNG"];
const BASE_HEADS_HDLD = ["LƯƠNG CƠ BẢN"];
const BASE_HEADS_CTV = ["THÙ LAO"];

function parseSheet(rows: unknown[][], kind: "hdld" | "ctv", month: string, sourceFile: string): PayrollRow[] {
  // Tìm dòng tiêu đề chính (có "HỌ VÀ TÊN") và dòng tiêu đề phụ ngay dưới
  const hi = rows.findIndex((r) => r.some((c) => up(c).startsWith("HỌ VÀ TÊN")));
  if (hi < 0) return [];
  const h1 = rows[hi].map(up), h2 = (rows[hi + 1] ?? []).map(up);
  const head = h1.map((a, i) => (h2[i] && !/^\d+$/.test(h2[i]) ? h2[i] : a)); // ưu tiên tiêu đề phụ
  const col = (pred: (h: string) => boolean) => head.map((h, i) => (pred(h) ? i : -1)).filter((i) => i >= 0);
  const nameCol = h1.findIndex((h) => h.startsWith("HỌ VÀ TÊN"));
  const codeCol = h1.findIndex((h) => h.startsWith("MÃ SỐ"));
  const posCol = h1.findIndex((h) => h.startsWith("VỊ TRÍ"));
  const baseCols = col((h) => (kind === "hdld" ? BASE_HEADS_HDLD : BASE_HEADS_CTV).some((k) => h.startsWith(k)));
  const allowCols = col((h) => ALLOWANCE_HEADS.some((k) => h.startsWith(k)));
  const commCols = col((h) => h.startsWith("HOA HỒNG"));
  const bonusCols = col((h) => BONUS_HEADS.some((k) => h.startsWith(k)));
  // "TỔNG CỘNG" đầu tiên sau nhóm lương là tổng thu nhập; các TỔNG CỘNG sau là BHXH
  const totalCol = head.findIndex((h, i) => h.startsWith("TỔNG CỘNG") && i > Math.max(0, ...baseCols, ...commCols));

  const out: PayrollRow[] = [];
  for (const r of rows.slice(hi + 2)) {
    const name = nfc(String(r[nameCol] ?? "")).trim();
    if (!name || /^TỔNG/i.test(name) || /^\d+$/.test(name)) continue;
    if (/^(TỔNG CỘNG|NOTE)/i.test(String(r[0] ?? ""))) break;
    const sum = (cols: number[]) => cols.reduce((s, i) => s + num(r[i]), 0);
    const row: PayrollRow = {
      month, kind, name, sourceFile,
      code: codeCol >= 0 && /^(NV|CTV|TTV)-\d+/.test(String(r[codeCol] ?? "")) ? String(r[codeCol]).trim() : null,
      position: posCol >= 0 && r[posCol] ? nfc(String(r[posCol])).trim() : null,
      baseSalary: sum(baseCols), allowances: sum(allowCols), commission: sum(commCols), bonus: sum(bonusCols),
      grossTotal: totalCol >= 0 && num(r[totalCol]) ? num(r[totalCol]) : null,
    };
    if (row.baseSalary || row.allowances || row.commission || row.bonus) out.push(row);
  }
  return out;
}

function monthOf(file: string): string | null {
  const m = file.match(/\/(\d{4})\/(\d{2})(\d{2})\//); // 2026/2603/...
  return m ? `${m[1]}-${m[3]}` : null;
}

async function main() {
  const files: string[] = [];
  for (const y of fs.readdirSync(ROOT)) {
    const yd = path.join(ROOT, y); if (!fs.statSync(yd).isDirectory()) continue;
    for (const ym of fs.readdirSync(yd)) {
      const d = path.join(yd, ym); if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d)) if (/bang ?luong|bảng lương/i.test(nfc(f)) && /\.xlsx$/i.test(f) && !/TTHH|TY LE|THUONG/i.test(nfc(f))) files.push(path.join(d, f));
    }
  }
  const all: PayrollRow[] = [];
  for (const f of files.sort()) {
    const month = monthOf(f); if (!month) continue;
    const wb = XLSX.read(fs.readFileSync(f));
    for (const sn of wb.SheetNames) {
      const kind: "hdld" | "ctv" | null = /HĐLĐ|HDLD/i.test(nfc(sn)) ? "hdld" : /CTV/i.test(sn) ? "ctv" : null;
      if (!kind) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, defval: null });
      const parsed = parseSheet(rows, kind, month, path.relative(ROOT, f) + "#" + sn);
      all.push(...parsed);
    }
  }
  const byMonth = new Map<string, number>();
  for (const r of all) byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + 1);
  console.log("Tháng có dữ liệu:", [...byMonth.entries()].map(([m, n]) => `${m}(${n})`).join(" "));
  console.table(all.filter((r) => ["2025-12", "2026-01", "2026-03"].includes(r.month)).map((r) => ({ month: r.month, kind: r.kind, name: r.name, base: r.baseSalary, allow: r.allowances, comm: r.commission, bonus: r.bonus, total: r.grossTotal })));
  if (!APPLY) { console.log(`(chạy thử, ${all.length} dòng, thêm --apply để ghi)`); return; }
  const sql = postgres(process.env.DATABASE_URL!);
  await sql.unsafe(fs.readFileSync("drizzle/0044_payroll_months.sql", "utf8"));
  for (const r of all) {
    await sql`INSERT INTO payroll_months (month, kind, code, name, position, base_salary, allowances, commission, bonus, gross_total, source_file)
      VALUES (${r.month}, ${r.kind}, ${r.code}, ${r.name}, ${r.position}, ${r.baseSalary}, ${r.allowances}, ${r.commission}, ${r.bonus}, ${r.grossTotal}, ${r.sourceFile})
      ON CONFLICT (month, kind, name) DO UPDATE SET code = EXCLUDED.code, position = EXCLUDED.position, base_salary = EXCLUDED.base_salary, allowances = EXCLUDED.allowances, commission = EXCLUDED.commission, bonus = EXCLUDED.bonus, gross_total = EXCLUDED.gross_total, source_file = EXCLUDED.source_file`;
  }
  console.log(`Đã ghi ${all.length} dòng bảng lương.`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
