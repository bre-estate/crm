/**
 * Đọc giấy nộp thuế (PDF, có lớp chữ) trong Drive 6.1-Hồ sơ thuế → bảng tax_payments.
 * Dùng để tách loại thuế trên sao kê (sao kê chỉ ghi "KBNN", không ghi GTGT/TNCN/TNDN).
 *
 *   npx tsx scripts/import-tax-receipts.ts           # xem trước
 *   npx tsx scripts/import-tax-receipts.ts --apply   # ghi (upsert theo ngày + loại + số tiền)
 *
 * Cần `pdftotext` (poppler). Nhận diện theo mã tiểu mục: 1701 GTGT, 1001 TNCN, 1052 TNDN, 2863 môn bài.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = process.env.TAX_DIR ?? path.resolve(process.env.HOME ?? "", "Documents/Company/BRE/App/Drive/4-Kế Toán - BRE/6.1-Hồ sơ thuế");
const APPLY = process.argv.includes("--apply");
const TYPE_BY_SUB: Record<string, string> = { "1701": "gtgt", "1001": "tncn", "1052": "tndn", "2863": "mon_bai", "2862": "mon_bai", "4944": "phat", "4917": "phat" };

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

export interface TaxReceipt { paidDate: string; taxType: string; period: string | null; amount: number; subItem: string; sourceFile: string }

export function parseReceiptText(text: string, sourceFile: string): TaxReceipt[] {
  if (!/Người nộp thuế/.test(text)) return [];
  const out: TaxReceipt[] = [];
  // Dòng khoản nộp: "... 00/Q1/2026 ... 147.209.248   855   1701"
  const lineRe = /(\d{2}\/(?:Q\d|CN|\d{2})\/\d{4})[^\n]*?(\d{1,3}(?:\.\d{3})+)\s+\d{3}\s+(\d{4})/g;
  const dateM = text.match(/Ngày ký:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const paidDate = dateM ? `${dateM[3]}-${dateM[2]}-${dateM[1]}` : null;
  if (!paidDate) return [];
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text))) {
    const period = m[1].replace(/^00\//, "");
    const amount = Number(m[2].replace(/\./g, ""));
    const sub = m[3];
    out.push({ paidDate, taxType: TYPE_BY_SUB[sub] ?? "khac", period, amount, subItem: sub, sourceFile });
  }
  return out;
}

async function main() {
  const files = walk(ROOT).filter((f) => /\.pdf$/i.test(f) && /GNT|nop thue|giay nop/i.test(path.basename(f)));
  const receipts: TaxReceipt[] = [];
  for (const f of files) {
    let text = "";
    try { text = execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }); } catch { continue; }
    const rs = parseReceiptText(text, path.relative(ROOT, f));
    if (rs.length === 0) console.log("⚠ không đọc được:", path.relative(ROOT, f));
    receipts.push(...rs);
  }
  receipts.sort((a, b) => a.paidDate.localeCompare(b.paidDate));
  console.table(receipts.map((r) => ({ ...r, amount: r.amount.toLocaleString("vi-VN") })));
  if (!APPLY) { console.log("(chạy thử, thêm --apply để ghi)"); return; }
  const sql = postgres(process.env.DATABASE_URL!);
  await sql.unsafe(fs.readFileSync("drizzle/0043_tax_payments.sql", "utf8"));
  let n = 0;
  for (const r of receipts) {
    await sql`INSERT INTO tax_payments (paid_date, tax_type, period, amount, sub_item, source_file)
      VALUES (${r.paidDate}, ${r.taxType}, ${r.period}, ${r.amount}, ${r.subItem}, ${r.sourceFile})
      ON CONFLICT (paid_date, tax_type, amount) DO UPDATE SET period = EXCLUDED.period, sub_item = EXCLUDED.sub_item, source_file = EXCLUDED.source_file`;
    n++;
  }
  console.log(`Đã ghi ${n} giấy nộp thuế.`);
  await sql.end();
}
if (process.argv[1] && /import-tax-receipts/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
