/**
 * Import sao kê Techcombank (cty) → bank_transactions.
 * Nguồn: data-excel/sao ke/<năm>/<quý>.xlsx (bản Admin xuất theo quý), vẫn đọc được .csv bản cũ.
 * Dedup theo (số bút toán, nợ, có): Techcombank dùng lại số bút toán cho lệnh hoàn.
 * statement_seq: thứ tự dòng trên sao kê (lớn = mới), chuẩn hóa lại theo ngày sau khi nhập
 * để trang báo cáo lấy đúng số dư đầu và cuối kỳ.
 * Dòng phí ngân hàng ghi tiền ở cột Phí và Thuế, cột Nợ bằng 0, nên số tiền thật = nợ + có + phí + thuế.
 *
 *   npx tsx scripts/import-sao-ke.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

const sql = postgres(process.env.DATABASE_URL!);

const FOLDER = "data-excel/sao ke";

/** Cột theo vị trí, giống nhau ở cả bản CSV lẫn bản Excel Techcombank xuất. */
const COL = { requestDate: 0, txDate: 1, ref: 2, partnerBank: 3, partnerAccount: 4, partnerName: 5, description: 6, debit: 7, credit: 8, fee: 9, vat: 10, balance: 11 };

interface Sheet { rows: string[][]; account: string }

function parseNum(s: unknown): number | null {
  if (s === null || s === undefined || String(s).trim() === "") return null;
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const isHeader = (r: string[]) => /^Ng[àa]y KH/i.test(r[0] ?? "");
const isDataRow = (r: string[]) => /^\d{4}-\d{2}-\d{2}/.test(r[COL.txDate] ?? "") && !!(r[COL.ref] ?? "").trim();

function readSheet(file: string): Sheet | null {
  const full = path.join(FOLDER, file);
  let grid: string[][];
  if (/\.xlsx?$/i.test(file)) {
    const wb = XLSX.read(readFileSync(full), { cellDates: false });
    grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: false }).map((r) => r.map(cell));
  } else {
    let raw = readFileSync(full, "utf-8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    grid = (parse(raw, { skip_empty_lines: false, relax_column_count: true, relax_quotes: true }) as string[][]).map((r) => r.map(cell));
  }
  const hi = grid.findIndex(isHeader);
  if (hi < 0) return null;
  const acctRow = grid.find((r) => r.some((c) => /Account number/i.test(c)));
  const account = acctRow?.map((c) => c.match(/^\d{6,}$/)?.[0]).find(Boolean) ?? "unknown";
  // File xếp dòng mới nhất trước; đảo lại thành cũ trước cho thứ tự tự nhiên.
  return { rows: grid.slice(hi + 1).filter(isDataRow).reverse(), account };
}

function listFiles(dir = FOLDER, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name.startsWith("~$")) continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(path.join(dir, name)).isDirectory()) out.push(...listFiles(path.join(dir, name), rel));
    else if (/\.(xlsx?|csv)$/i.test(name)) out.push(rel);
  }
  return out;
}

async function main() {
  const { runWithImportLog } = await import("../lib/import-log");
  await runWithImportLog({ scriptName: "import-sao-ke", targetTable: "bank_transactions" }, async (log) => {
    await sql.unsafe(readFileSync("drizzle/0029_bank_transactions.sql", "utf-8"));
    await sql.unsafe(readFileSync("drizzle/0045_bank_statement_seq.sql", "utf-8"));

    const sheets = listFiles()
      .map((file) => ({ file, sheet: readSheet(file) }))
      .filter((s): s is { file: string; sheet: Sheet } => !!s.sheet && s.sheet.rows.length > 0)
      .sort((a, b) => (a.sheet.rows[0][COL.txDate] ?? "").localeCompare(b.sheet.rows[0][COL.txDate] ?? ""));
    console.log(`Đọc ${sheets.length} file sao kê.\n`);

    let totalRows = 0, insertedTotal = 0, errorTotal = 0;
    for (const [fileRank, { file, sheet }] of sheets.entries()) {
      let inserted = 0, errored = 0;
      for (const [idx, r] of sheet.rows.entries()) {
        const seq = fileRank * 100_000 + idx + 1;
        try {
          await sql`
            INSERT INTO bank_transactions (
              account_number, request_date, transaction_date, reference_number,
              partner_bank, partner_account, partner_name, description,
              debit_amount, credit_amount, fee_interest, vat, running_balance,
              source_file, statement_seq
            ) VALUES (
              ${sheet.account}, ${r[COL.requestDate]}::timestamptz, ${r[COL.txDate].slice(0, 10)}::date, ${r[COL.ref]},
              ${r[COL.partnerBank] || null}, ${r[COL.partnerAccount] || null}, ${r[COL.partnerName] || null}, ${r[COL.description] ?? ""},
              ${parseNum(r[COL.debit])}, ${parseNum(r[COL.credit])}, ${parseNum(r[COL.fee])}, ${parseNum(r[COL.vat])}, ${parseNum(r[COL.balance])},
              ${file}, ${seq}
            )
            ON CONFLICT (reference_number, coalesce(debit_amount, 0), coalesce(credit_amount, 0))
            DO UPDATE SET statement_seq = EXCLUDED.statement_seq, running_balance = EXCLUDED.running_balance,
                          fee_interest = EXCLUDED.fee_interest, vat = EXCLUDED.vat, source_file = EXCLUDED.source_file`;
          inserted++;
        } catch (e: any) {
          errored++;
          if (errored <= 3) console.warn(`  ⚠️  ${file} ref ${r[COL.ref]}: ${e.message?.slice(0, 90)}`);
        }
      }
      const from = sheet.rows[0][COL.txDate].slice(0, 10), to = sheet.rows[sheet.rows.length - 1][COL.txDate].slice(0, 10);
      console.log(`  ${file}: ${sheet.rows.length} dòng (${from} → ${to}), ${inserted} ghi, ${errored} lỗi`);
      totalRows += sheet.rows.length; insertedTotal += inserted; errorTotal += errored;
    }

    // Chuẩn hóa statement_seq theo ngày, giữ nguyên thứ tự trong cùng ngày (thứ tự của ngân hàng).
    await sql`
      WITH thu_tu AS (
        SELECT id, row_number() OVER (ORDER BY transaction_date, statement_seq NULLS LAST, id) AS n FROM bank_transactions
      )
      UPDATE bank_transactions b SET statement_seq = t.n FROM thu_tu t WHERE b.id = t.id AND b.statement_seq IS DISTINCT FROM t.n`;

    console.log(`\n✅ ${insertedTotal} dòng đã ghi, ${errorTotal} lỗi (từ ${totalRows} dòng đọc được)`);

    const [s] = await sql`
      SELECT count(*)::int AS n,
             sum(coalesce(debit_amount,0) + coalesce(fee_interest,0) + coalesce(vat,0))::float8 AS total_debit,
             sum(coalesce(credit_amount,0))::float8 AS total_credit,
             min(transaction_date)::text AS first_date, max(transaction_date)::text AS last_date
      FROM bank_transactions`;
    const fmt = (n: unknown) => Math.round(Number(n)).toLocaleString("vi-VN");
    console.log(`\nSao kê tổng: ${s.n} giao dịch từ ${s.first_date} đến ${s.last_date}`);
    console.log(`  Tổng chi: ${fmt(Math.abs(Number(s.total_debit)))}`);
    console.log(`  Tổng thu: ${fmt(s.total_credit)}`);

    log.created = Number(s.n ?? 0);
    log.details = { files_processed: sheets.length, first_date: s.first_date, last_date: s.last_date, total_debit: Number(s.total_debit), total_credit: Number(s.total_credit) };
    await sql.end();
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
