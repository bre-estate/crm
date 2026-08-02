/**
 * Import sổ nhật ký chung (NKC) của Kim từ file SO SACH BRE XXXX.xlsx.
 * Idempotent — chạy nhiều lần OK (dedup_key ngăn duplicate).
 *
 * Usage:
 *   cd BRE/App/CRM && npx tsx scripts/import-accounting-journal.ts "data-excel/SO SACH BRE 2025.xlsx"
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import XLSX from "xlsx";
import postgres from "postgres";
import crypto from "crypto";
import path from "path";

const FILE_ARG = process.argv[2];
if (!FILE_ARG) {
  console.error("Usage: npx tsx scripts/import-accounting-journal.ts <file.xlsx>");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

// Excel date serial → YYYY-MM-DD
function excelDateToISO(serial: unknown): string | null {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 1) return null;
  // Excel epoch: Jan 1 1900 = 1, but Excel has 1900 leap year bug → offset -2
  const days = Math.floor(n) - 2;
  const date = new Date(Date.UTC(1900, 0, 1) + days * 86400000);
  return date.toISOString().slice(0, 10);
}

type Row = {
  entryDate: string;
  docType: string;
  docNumber: string;
  invoiceSeri: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  sourceRow: number;
};

function parseNKC(filePath: string): Row[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets["NKC"];
  if (!ws) throw new Error("Sheet 'NKC' không tồn tại trong file");
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  const rows: Row[] = [];
  // Data starts at row index 9 (header 7-8)
  for (let i = 9; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const docType = String(r[1] ?? "").trim();
    const docNumber = String(r[2] ?? "").trim();
    const entryDate = excelDateToISO(r[3]);
    const desc = String(r[7] ?? "").trim();
    const debit = String(r[8] ?? "").trim();
    const credit = String(r[9] ?? "").trim();
    const amount = Number(r[10]);

    // Skip empty rows
    if (!docType && !docNumber && !entryDate) continue;
    // Skip footer / summary rows
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (!debit || !credit) continue;
    if (!entryDate) continue;

    rows.push({
      entryDate,
      docType,
      docNumber,
      invoiceSeri: String(r[4] ?? "").trim() || null,
      invoiceNumber: String(r[5] ?? "").trim() || null,
      invoiceDate: excelDateToISO(r[6]),
      description: desc,
      debitAccount: debit,
      creditAccount: credit,
      amount,
      sourceRow: i,
    });
  }
  return rows;
}

function makeDedupKey(sourceFile: string, r: Row): string {
  // Hash các field định danh — cùng chứng từ + cùng amount + cùng ngày = same entry
  const raw = `${sourceFile}|${r.entryDate}|${r.docType}|${r.docNumber}|${r.debitAccount}|${r.creditAccount}|${r.amount}|${r.description.slice(0, 100)}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

async function main() {
  const absPath = path.resolve(FILE_ARG);
  const fileName = path.basename(absPath);
  console.log(`Reading ${fileName}...`);

  const rows = parseNKC(absPath);
  console.log(`Parsed ${rows.length} journal entries`);

  // Sanity check: sum debit vs credit per TK (double-entry must balance)
  const debitTotals = new Map<string, number>();
  const creditTotals = new Map<string, number>();
  for (const r of rows) {
    debitTotals.set(r.debitAccount, (debitTotals.get(r.debitAccount) ?? 0) + r.amount);
    creditTotals.set(r.creditAccount, (creditTotals.get(r.creditAccount) ?? 0) + r.amount);
  }
  const totalDebit = Array.from(debitTotals.values()).reduce((s, x) => s + x, 0);
  const totalCredit = Array.from(creditTotals.values()).reduce((s, x) => s + x, 0);
  console.log(`Total debit: ${fmt(totalDebit)}`);
  console.log(`Total credit: ${fmt(totalCredit)}`);
  console.log(`Balance check: ${Math.abs(totalDebit - totalCredit) < 1 ? "✅ CÂN" : "❌ LỆCH " + fmt(totalDebit - totalCredit)}`);

  // Batch insert
  const BATCH = 100;
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map((r) => ({
      entry_date: r.entryDate,
      doc_type: r.docType,
      doc_number: r.docNumber,
      invoice_seri: r.invoiceSeri,
      invoice_number: r.invoiceNumber,
      invoice_date: r.invoiceDate,
      description: r.description,
      debit_account: r.debitAccount,
      credit_account: r.creditAccount,
      amount: r.amount,
      source_file: fileName,
      source_sheet: "NKC",
      source_row: r.sourceRow,
      dedup_key: makeDedupKey(fileName, r),
    }));
    const result = await sql`
      INSERT INTO accounting_journal ${sql(values)}
      ON CONFLICT (dedup_key) DO NOTHING
      RETURNING id
    `;
    inserted += result.length;
    skipped += chunk.length - result.length;
  }
  console.log(`\n✅ Inserted: ${inserted}, Skipped (dup): ${skipped}`);

  // TK breakdown summary
  console.log("\n=== TOP TK BY VOLUME ===");
  const combined = new Map<string, number>();
  for (const [tk, s] of debitTotals) combined.set(tk, (combined.get(tk) ?? 0) + s);
  for (const [tk, s] of creditTotals) combined.set(tk, (combined.get(tk) ?? 0) + s);
  const top = Array.from(combined.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [tk, s] of top) {
    console.log(`  ${tk.padEnd(10)} ${fmt(s)}`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
