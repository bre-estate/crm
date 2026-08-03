/**
 * Import "So theo doi thanh toan.xlsx" sheet 1.1 → financial_transactions
 * Idempotent: dedup theo (date ±3 days, amount ±0.5%).
 *
 * Usage: npx tsx scripts/import-so-theo-doi.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import XLSX from "xlsx";
import postgres from "postgres";
import crypto from "crypto";

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number) => Math.round(Number(n)).toLocaleString("vi-VN");

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v.trim())) {
    const [d, m, y] = v.trim().split("/").map(Number);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const n = Number(v);
  if (Number.isFinite(n) && n > 40000 && n < 50000) {
    const days = Math.floor(n) - 2;
    return new Date(Date.UTC(1900, 0, 1) + days * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

function classify(desc: string, recipient: string): string {
  const t = (desc + " " + recipient).toLowerCase();
  if (/bhxh|bhyt|bhtn/i.test(t)) return "3383";
  if (/thuế tncn/i.test(t)) return "3335";
  if (/thuế tndn|tạm nộp tndn/i.test(t)) return "3334";
  if (/thuế gtgt|thuế vat/i.test(t)) return "33311";
  if (/(lệ phí|thuế) môn bài/i.test(t)) return "6425";
  if (/thuế/i.test(t)) return "3331-3334";
  if (/hoàn (tiền )?yctv|hoàn cọc/i.test(t)) return "3411";
  if (/hỗ trợ khách|hỗ trợ ctv|quảng cáo|marketing/i.test(t)) return "6417";
  if (/thù lao|hoa hồng|hh sale|thưởng|kpi/i.test(t)) return "6417";
  if (/lương|phụ cấp/i.test(t)) {
    if (/kế toán|admin|content writer|editor|hồ gia|camera/i.test(t)) return "6421";
    if (/tường vi|thịnh/i.test(recipient.toLowerCase())) return "6421";
    return "6411";
  }
  if (/thuê|internet|điện|nước|dịch vụ|token|hóa đơn|văn phòng|trụ sở|wifi/i.test(t)) return "6427";
  if (/tscđ|máy|thiết bị|đồ dùng|văn phòng phẩm|bàn|ghế|tủ/i.test(t)) return "6423";
  if (/cọc/i.test(t)) return "244";
  if (/tạm ứng|ứng lương|ứng chi phí|ứng trước/i.test(t)) return "141";
  if (/tiếp khách/i.test(t)) return "6417"; // Marketing/entertainment
  return "unclassified";
}

function makeDedupKey(sourceFile: string, date: string, amount: number, desc: string, row: number): string {
  const raw = `${sourceFile}|${date}|${Math.round(amount)}|${desc.slice(0, 80)}|row${row}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

async function main() {
  const SOURCE_FILE = "So-theo-doi-thanh-toan";
  const wb = XLSX.readFile("data-excel/Chi phí/So theo doi thanh toan.xlsx");
  const ws = wb.Sheets["1.1-Đề nghị thanh toán"];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  type Candidate = {
    row: number;
    date: string;
    requester: string; // Người đề nghị TT (thường Kim)
    department: string;
    description: string;
    amount: number;
    method: string;
    note: string;
    category: string;
  };

  const candidates: Candidate[] = [];
  for (let i = 11; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const date = parseDate(r[1]);
    const requester = String(r[2] ?? "").trim();
    const department = String(r[3] ?? "").trim();
    const description = String(r[4] ?? "").trim();
    let amountRaw = r[5];
    if (typeof amountRaw === "string") {
      amountRaw = amountRaw.replace(/\./g, "").replace(/,/g, ".").trim();
    }
    const amount = Number(amountRaw);
    const method = String(r[8] ?? "").trim();
    const note = String(r[9] ?? "").trim();

    if (!date || !description || !Number.isFinite(amount) || amount <= 0) continue;

    candidates.push({
      row: i, date, requester, department, description, amount, method, note,
      category: classify(description, requester),
    });
  }
  console.log(`Parsed ${candidates.length} candidates`);

  // Insert only new (skip dupes)
  let inserted = 0;
  let skipped = 0;
  const skippedCategories = new Map<string, number>();
  for (const c of candidates) {
    const dupCheck = await sql`
      SELECT id FROM financial_transactions
      WHERE ABS(to_date(transaction_date, 'YYYY-MM-DD') - to_date(${c.date}, 'YYYY-MM-DD')) <= 3
        AND ABS(amount - ${c.amount}) / ${c.amount} <= 0.005
      LIMIT 1`;
    if (dupCheck.length > 0) {
      skipped++;
      continue;
    }

    // Insert
    const month = c.date.slice(0, 7);
    const dedupKey = makeDedupKey(SOURCE_FILE, c.date, c.amount, c.description, c.row);
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
      const cur = skippedCategories.get(c.category) ?? 0;
      skippedCategories.set(c.category, cur + 1);
    } catch (e) {
      console.error(`Row ${c.row} error:`, e);
    }
  }

  console.log(`\n═══ RESULT ═══`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (dup): ${skipped}`);
  console.log(`\nBy category:`);
  for (const [cat, cnt] of skippedCategories) console.log(`  ${cat}: ${cnt}`);

  // Verify: Kim vs CRM new state
  console.log(`\n═══ VERIFY: 6411 lương NVKD monthly ═══`);
  const kim = await sql`
    SELECT substr(entry_date, 1, 7) as m, SUM(amount)::float8 as s
    FROM accounting_journal WHERE debit_account = '3341' AND credit_account = '11211'
    GROUP BY substr(entry_date, 1, 7) ORDER BY m`;
  const crm = await sql`
    SELECT transaction_month as m, SUM(amount)::float8 as s
    FROM financial_transactions
    WHERE transaction_month LIKE '2025-%' AND direction = 'out'
      AND category_code IN ('6411', '6421') AND recipient NOT ILIKE '%BHXH%'
    GROUP BY transaction_month ORDER BY m`;
  const kimMap = new Map(kim.map((r: any) => [r.m, Number(r.s)]));
  const crmMap = new Map(crm.map((r: any) => [r.m, Number(r.s)]));
  const allMonths = new Set([...kimMap.keys(), ...crmMap.keys()]);
  console.log(`${"Month".padEnd(8)} ${"Kim".padStart(14)} ${"CRM".padStart(14)} ${"Gap".padStart(14)}`);
  let kt = 0, ct = 0;
  for (const m of [...allMonths].sort()) {
    const k = Number(kimMap.get(m) ?? 0);
    const c = Number(crmMap.get(m) ?? 0);
    kt += k; ct += c;
    const flag = Math.abs(k - c) < 100 ? "✅" : Math.abs(k - c) < 5_000_000 ? "⚠️" : "❌";
    console.log(`${m.padEnd(8)} ${fmt(k).padStart(14)} ${fmt(c).padStart(14)} ${fmt(k - c).padStart(14)} ${flag}`);
  }
  console.log(`${"TOTAL".padEnd(8)} ${fmt(kt).padStart(14)} ${fmt(ct).padStart(14)} ${fmt(kt - ct).padStart(14)}`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
