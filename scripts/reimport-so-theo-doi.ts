/**
 * FULL RE-IMPORT "So theo doi thanh toan.xlsx" sheet 1.1.
 * - Xóa trước rows source='So-theo-doi-thanh-toan' cũ
 * - Parser mới handle 2 format date + comma amount
 * - Dedup vẫn theo date ±3 days + amount ±0.5% (chỉ skip nếu match nguồn khác)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import XLSX from "xlsx";
import postgres from "postgres";
import crypto from "crypto";

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number | string) => Math.round(Number(n)).toLocaleString("vi-VN");

const MONTHS_EN: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v > 40000 && v < 50000) {
    const days = Math.floor(v) - 2;
    return new Date(Date.UTC(1900, 0, 1) + days * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const vnMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vnMatch) return `${vnMatch[3]}-${vnMatch[2].padStart(2, "0")}-${vnMatch[1].padStart(2, "0")}`;
  const engMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (engMatch) {
    const m = MONTHS_EN[engMatch[2].toLowerCase()];
    if (m) return `${engMatch[3]}-${m}-${engMatch[1].padStart(2, "0")}`;
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 40000 && n < 50000) {
    const days = Math.floor(n) - 2;
    return new Date(Date.UTC(1900, 0, 1) + days * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

function parseAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null || v === "") return NaN;
  // Strip ALL commas and dots (VND integer, no decimal)
  return Number(String(v).trim().replace(/[.,]/g, ""));
}

function classify(desc: string, recipient: string, dept: string): string {
  const t = (desc + " " + recipient + " " + dept).toLowerCase();
  if (/bhxh|bhyt|bhtn/i.test(t)) return "3383";
  if (/thuế tncn|tncn/i.test(t)) return "3335";
  if (/thuế tndn|tạm nộp tndn|tndn/i.test(t)) return "3334";
  if (/thuế gtgt|thuế vat|gtgt/i.test(t)) return "33311";
  if (/(lệ phí|thuế) môn bài|môn bài/i.test(t)) return "6425";
  if (/thuế/i.test(t)) return "3331-3334";
  if (/hoàn (tiền )?yctv|hoàn cọc|hoàn tiền/i.test(t)) return "3411";
  if (/hỗ trợ khách|hỗ trợ ctv|quảng cáo|marketing|tiếp khách/i.test(t)) return "6417";
  if (/thù lao|hoa hồng|hh sale|thưởng|kpi|tạm ứng hoa hồng/i.test(t)) return "6417";
  if (/lương|phụ cấp/i.test(t)) {
    if (/kế toán|admin|content writer|editor|hồ gia|camera/i.test(t)) return "6421";
    if (/tường vi|thịnh|trần quốc thịnh|kế toán/i.test(t)) return "6421";
    return "6411";
  }
  if (/thuê|internet|điện|nước|dịch vụ|token|hóa đơn|văn phòng|trụ sở|wifi|đồng phục/i.test(t)) return "6427";
  if (/tscđ|máy|thiết bị|đồ dùng|văn phòng phẩm|bàn|ghế|tủ|folder|logo|cup/i.test(t)) return "6423";
  if (/cọc/i.test(t)) return "244";
  if (/tạm ứng|ứng lương|ứng chi phí|ứng trước/i.test(t)) return "141";
  return "unclassified";
}

async function main() {
  const SOURCE_FILE = "So-theo-doi-thanh-toan";

  // 1. Delete existing rows from this source
  const del = await sql`DELETE FROM financial_transactions WHERE source_file = ${SOURCE_FILE}`;
  console.log(`🗑  Xóa ${del.count} rows cũ từ nguồn "${SOURCE_FILE}"\n`);

  // 2. Parse Excel
  const wb = XLSX.readFile("data-excel/Chi phí/So theo doi thanh toan.xlsx");
  const ws = wb.Sheets["1.1-Đề nghị thanh toán"];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  type Candidate = {
    row: number; date: string; requester: string; department: string;
    description: string; amount: number; method: string; note: string;
    category: string;
  };
  const candidates: Candidate[] = [];
  for (let i = 11; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const date = parseDate(r[1]);
    const requester = String(r[2] ?? "").trim();
    const department = String(r[3] ?? "").trim();
    const description = String(r[4] ?? "").trim();
    const amount = parseAmount(r[5]);
    const method = String(r[8] ?? "").trim();
    const note = String(r[9] ?? "").trim();
    if (!date || !description || !Number.isFinite(amount) || amount <= 0) continue;
    candidates.push({
      row: i, date, requester, department, description, amount, method, note,
      category: classify(description, requester, department),
    });
  }
  const totalAmount = candidates.reduce((s, c) => s + c.amount, 0);
  console.log(`Parsed ${candidates.length} valid rows, tổng ${fmt(totalAmount)}\n`);

  // 3. Import với dedup smart: check tồn tại rows khác source_file cùng date+amount+description similarity
  let inserted = 0;
  let skippedDup = 0;
  for (const c of candidates) {
    // Dedup: check if a row exists in any OTHER source_file với date ±3d, amount ±0.5%, description similar
    const descKey = c.description.slice(0, 30).toLowerCase();
    const dup = await sql`
      SELECT id, source_file, description FROM financial_transactions
      WHERE source_file != ${SOURCE_FILE}
        AND ABS(to_date(transaction_date, 'YYYY-MM-DD') - to_date(${c.date}, 'YYYY-MM-DD')) <= 3
        AND ABS(amount - ${c.amount}) / ${c.amount} <= 0.005
        AND LOWER(SUBSTRING(description, 1, 30)) = ${descKey}
      LIMIT 1`;
    if (dup.length > 0) {
      skippedDup++;
      continue;
    }

    const month = c.date.slice(0, 7);
    const dedupKey = crypto
      .createHash("sha256")
      .update(`${SOURCE_FILE}|${c.date}|${Math.round(c.amount)}|${c.description.slice(0, 80)}|row${c.row}`)
      .digest("hex").slice(0, 32);
    try {
      await sql`
        INSERT INTO financial_transactions (
          transaction_date, transaction_month, accrual_month,
          description, amount, direction, category_code,
          payer, recipient, has_invoice,
          source_file, source_row, dedup_key
        ) VALUES (
          ${c.date}, ${month}, ${month},
          ${c.description}, ${c.amount}, 'out', ${c.category},
          'company', ${c.requester}, false,
          ${SOURCE_FILE}, ${c.row}, ${dedupKey}
        )
        ON CONFLICT (dedup_key) DO NOTHING`;
      inserted++;
    } catch (e: any) {
      console.error(`Row ${c.row} fail: ${e.detail || e.message}`);
    }
  }

  console.log(`\n═══ RESULT ═══`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (dup vs other sources): ${skippedDup}`);
  console.log(`Total valid: ${candidates.length}`);

  // 4. Verify totals
  const [totalCrm] = await sql`SELECT COUNT(*)::int as cnt, COALESCE(SUM(amount), 0)::float8 as s FROM financial_transactions`;
  console.log(`\nCRM now: ${totalCrm.cnt} rows, ${fmt(totalCrm.s)}`);
  const bySource = await sql`SELECT source_file, COUNT(*)::int as cnt, COALESCE(SUM(amount), 0)::float8 as s FROM financial_transactions GROUP BY source_file ORDER BY cnt DESC`;
  for (const r of bySource) console.log(`  ${String(r.source_file).padEnd(30)} · ${String(r.cnt).padStart(5)} rows · ${fmt(r.s).padStart(15)}`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
