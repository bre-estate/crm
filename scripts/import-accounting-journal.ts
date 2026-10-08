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
import { docNKC, type DongNKC } from "../lib/accounting/nkc-parser";

const THAY_THE = process.argv.includes("--thay-the");
const FILE_ARG = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "";
if (!FILE_ARG) {
  console.error("Usage: npx tsx scripts/import-accounting-journal.ts <file.xlsx>");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

type Row = DongNKC;

/**
 * Đọc sheet NKC. Bộ đọc dò cột theo tên tiêu đề nên chạy được cả mẫu cũ
 * (SO SACH BRE) lẫn mẫu mới (BC Bre Q1+2.2026), và ném lỗi nếu kế toán đổi
 * mẫu tới mức thiếu cột, thay vì nạp 0 dòng rồi báo thành công.
 */
function parseNKC(filePath: string): Row[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets["NKC"];
  if (!ws) throw new Error("Sheet 'NKC' không tồn tại trong file");
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const { dong, bando, boQua } = docNKC(raw);
  const viTri = Object.entries(bando)
    .filter(([k]) => k !== "dongDauDuLieu")
    .map(([k, v]) => `${k}=${XLSX.utils.encode_col(v as number)}`)
    .join(" ");
  console.log(`  Cột nhận được: ${viTri}`);
  console.log(`  Đọc ${dong.length} dòng, bỏ qua ${boQua} dòng không hợp lệ`);
  if (dong.length === 0) {
    throw new Error("Không đọc được dòng nào. Kiểm tra lại mẫu file trước khi nạp.");
  }
  return dong;
}

function makeDedupKey(sourceFile: string, r: Row): string {
  // Phải có sourceRow. Thiếu nó thì hai bút toán KHÁC NHAU mà trùng ngày,
  // trùng số chứng từ, trùng tài khoản, trùng số tiền và trùng diễn giải sẽ
  // bị gộp làm một. File BC Bre Q1+2.2026 có 24 nhóm như vậy (trả lương cùng
  // ngày cùng mức cho nhiều người), nạp vào mất 42 dòng và 325.826.750 mà
  // script vẫn báo thành công. Một dòng Excel là một bút toán.
  const raw = `${sourceFile}|${r.sourceRow}|${r.entryDate}|${r.docType}|${r.docNumber}|${r.debitAccount}|${r.creditAccount}|${r.amount}|${r.description.slice(0, 100)}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

async function main() {
  const absPath = path.resolve(FILE_ARG);
  const fileName = path.basename(absPath);
  const { runWithImportLog } = await import("../lib/import-log");
  await runWithImportLog({
    scriptName: "import-accounting-journal",
    sourceFile: fileName,
    targetTable: "accounting_journal",
  }, async (log) => {
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
  // Khoá chống trùng có kèm TÊN FILE. Kế toán đổi tên file (SO SACH BRE 2025
  // thành BC BRE 2025) là khoá đổi theo, nạp vào sẽ cộng chồng lên dữ liệu cũ
  // chứ không đè. Nên phải chặn, và chỉ cho qua khi người chạy nói rõ là thay thế.
  const tuNgay = rows.reduce((m, r) => (r.entryDate < m ? r.entryDate : m), rows[0].entryDate);
  const denNgay = rows.reduce((m, r) => (r.entryDate > m ? r.entryDate : m), rows[0].entryDate);
  const trungKy = await sql<{ source_file: string; n: number }[]>`
    SELECT source_file, count(*)::int AS n
    FROM accounting_journal
    WHERE entry_date BETWEEN ${tuNgay} AND ${denNgay} AND source_file <> ${fileName}
    GROUP BY source_file
  `;
  // Nạp lại CHÍNH file này thì xoá sạch dòng cũ của nó rồi nạp lại, thay vì
  // dựa vào khoá chống trùng. Kế toán xuất lại file là thứ tự dòng đổi, khoá
  // đổi theo, nên dựa vào khoá sẽ sinh bản sao.
  const cuCungTen = await sql`DELETE FROM accounting_journal WHERE source_file = ${fileName} RETURNING id`;
  if (cuCungTen.length > 0) {
    console.log(`  Đã xoá ${cuCungTen.length} dòng cũ của chính file này để nạp lại`);
  }

  if (trungKy.length > 0) {
    const mo = trungKy.map((x) => `${x.source_file} (${x.n} dòng)`).join(", ");
    if (!THAY_THE) {
      console.error(
        `\n✗ Khoảng ${tuNgay} đến ${denNgay} đã có dữ liệu từ nguồn khác: ${mo}.\n` +
          `  Nạp tiếp sẽ cộng chồng chứ không đè, vì khoá chống trùng tính theo tên file.\n` +
          `  Nếu file này THAY THẾ nguồn cũ, chạy lại kèm --thay-the.`,
      );
      process.exit(1);
    }
    for (const x of trungKy) {
      const xoa = await sql`DELETE FROM accounting_journal WHERE source_file = ${x.source_file} RETURNING id`;
      console.log(`  Đã xoá ${xoa.length} dòng của nguồn cũ ${x.source_file}`);
    }
  }

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

    log.created = inserted;
    log.skipped = skipped;
    log.details = { total_debit: totalDebit, total_credit: totalCredit, top_tk: top.slice(0, 5) };
    await sql.end();
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
