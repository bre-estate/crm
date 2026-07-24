/**
 * Import 3 file Excel tài chính từ data-excel/Chi phí/ vào DB.
 * Dùng cho lần nạp data đầu — sau này file mới sẽ upload qua /finance/import.
 *
 * Run: npx tsx scripts/import-financial-local.ts
 *      npx tsx scripts/import-financial-local.ts --clear   # xóa hết trước khi nạp
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import * as dotenv from "dotenv";
import {
  parseThanhToan,
  parseMerged,
  parseTamUng,
} from "../lib/accounting/parsers";

dotenv.config({ path: ".env.local" });

const CLEAR = process.argv.includes("--clear");
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

const DIR = join(process.cwd(), "data-excel", "Chi phí");
const FILES = {
  "thanh-toan": "So theo doi thanh toan.xlsx",
  merged: "Chi Phí - Cá nhân MERGED.xlsx",
  "tam-ung": "SỔ TẠM ỨNG BRE.xlsx",
} as const;

async function insertBatch(rows: any[]) {
  let inserted = 0;
  let skipped = 0;
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map((r) => ({
      transaction_date: r.transactionDate,
      transaction_month: r.transactionMonth,
      description: r.description,
      amount: r.amount,
      direction: r.direction,
      category_code: r.categoryCode,
      management_group: r.managementGroup ?? null,
      payer: r.payer ?? null,
      recipient: r.recipient ?? null,
      has_invoice: r.hasInvoice,
      invoice_no: r.invoiceNo ?? null,
      invoice_valid: r.invoiceValid ?? null,
      source_file: r.sourceFile,
      source_row: r.sourceRow ?? null,
      dedup_key: r.dedupKey,
      note: r.note ?? null,
    }));
    const res = await c`
      INSERT INTO financial_transactions ${c(values as any)}
      ON CONFLICT (dedup_key) DO NOTHING
      RETURNING id
    `;
    inserted += res.length;
    skipped += chunk.length - res.length;
  }
  return { inserted, skipped };
}

async function main() {
  if (CLEAR) {
    const before = await c<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM financial_transactions`;
    await c`DELETE FROM financial_transactions`;
    console.log(`🗑  Cleared ${before[0].n} rows.\n`);
  }

  for (const [type, filename] of Object.entries(FILES)) {
    const filePath = join(DIR, filename);
    const buf = readFileSync(filePath);
    let rows: any[] = [];
    if (type === "thanh-toan") rows = parseThanhToan(buf);
    else if (type === "merged") rows = parseMerged(buf);
    else rows = parseTamUng(buf);

    console.log(`📄 ${type} (${filename}): ${rows.length} rows`);
    const res = await insertBatch(rows);
    console.log(`   ✅ inserted ${res.inserted}, skipped ${res.skipped} (đã có)\n`);
  }

  // Summary
  const [total] = await c<{ n: string; sum: string }[]>`
    SELECT COUNT(*)::text AS n, COALESCE(SUM(amount), 0)::text AS sum FROM financial_transactions
  `;
  const byGroup = await c<{ g: string; n: string; s: string }[]>`
    SELECT COALESCE(management_group, '?') AS g, COUNT(*)::text AS n, SUM(amount)::text AS s
    FROM financial_transactions
    GROUP BY management_group
    ORDER BY 1
  `;
  console.log(`\n== TỔNG DB ==`);
  console.log(`Total: ${total.n} rows, ${Number(total.sum).toLocaleString("vi-VN")} VND\n`);
  for (const g of byGroup) {
    console.log(
      `  ${g.g.padEnd(35)} ${g.n.padStart(5)} rows  ${Number(g.s).toLocaleString("vi-VN").padStart(18)} VND`,
    );
  }

  await c.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
