/**
 * Import CSV sao kê Techcombank cty → bank_transactions.
 * Dedup theo (số bút toán, nợ, có): Techcombank dùng lại số bút toán cho lệnh hoàn.
 * statement_seq = thứ tự dòng trên sao kê (file xếp theo ngày, trong file dòng đầu là mới nhất).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync, readdirSync } from "fs";
import { parse } from "csv-parse/sync";

const sql = postgres(process.env.DATABASE_URL!);

const FOLDER = "data-excel/sao ke";

function parseNum(s: any): number | null {
  if (s === null || s === undefined || String(s).trim() === "") return null;
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const { runWithImportLog } = await import("../lib/import-log");
  await runWithImportLog({
    scriptName: "import-sao-ke",
    targetTable: "bank_transactions",
  }, async (log) => {
  // Apply migration
  await sql.unsafe(readFileSync("drizzle/0029_bank_transactions.sql", "utf-8"));
  await sql.unsafe(readFileSync("drizzle/0045_bank_statement_seq.sql", "utf-8"));
  console.log("✅ Migration 0029 + 0045 applied\n");

  const files = readdirSync(FOLDER).filter((f) => f.endsWith(".csv"));
  console.log(`Found ${files.length} CSV files.\n`);

  // Xếp file theo ngày giao dịch cũ nhất trong file, để statement_seq tăng dần theo thời gian.
  const firstDate = (file: string) => {
    const m = readFileSync(`${FOLDER}/${file}`, "utf-8").match(/\d{4}-\d{2}-\d{2}/g);
    return m ? m.sort()[0] : "9999";
  };
  files.sort((a, b) => firstDate(a).localeCompare(firstDate(b)));

  let totalRows = 0, insertedTotal = 0, errorTotal = 0;

  for (const [fileRank, file] of files.entries()) {
    const path = `${FOLDER}/${file}`;
    let raw: string;
    try {
      raw = readFileSync(path, "utf-8");
      // Bỏ BOM nếu có
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    } catch (e: any) {
      console.warn(`⚠️  Cannot read ${file}: ${e.message}`);
      continue;
    }

    // Extract account number từ dòng 2
    const lines = raw.split(/\r?\n/);
    const acctLine = lines[1] || "";
    const acctMatch = acctLine.match(/(\d{6,})/);
    const account = acctMatch ? acctMatch[1] : "unknown";

    // Data rows: sau dòng có header "Ngay KH thuc hien..."
    const headerIdx = lines.findIndex((l) => l.startsWith("Ngay KH thuc hien"));
    if (headerIdx === -1) {
      console.warn(`⚠️  ${file}: không tìm header row`);
      continue;
    }

    // Parse từ header row trở đi
    const dataText = lines.slice(headerIdx).join("\n");
    let records: any[];
    try {
      records = parse(dataText, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
      });
    } catch (e: any) {
      console.warn(`⚠️  ${file}: parse error ${e.message?.slice(0, 100)}`);
      continue;
    }

    let inserted = 0, errored = 0;
    for (const [idx, r] of records.entries()) {
      const ref = String(r["So but toan/Reference number"] ?? "").trim();
      if (!ref) continue;
      const seq = fileRank * 100_000 + (records.length - idx); // dòng đầu file là mới nhất

      // Skip footer/summary lines
      const requestDate = String(r["Ngay KH thuc hien/Requesting date"] ?? "").trim();
      const txDate = String(r["Ngay giao dich/Transaction date"] ?? "").trim();
      if (!requestDate || !txDate || !/^\d{4}-\d{2}-\d{2}/.test(txDate)) continue;

      const debit = parseNum(r["No/Debit"]);
      const credit = parseNum(r["Co/Credit"]);
      const fee = parseNum(r["Phí - Lãi / Fee - Interest"]);
      const vat = parseNum(r["Thue/Transaction VAT"]);
      const balance = parseNum(r["So du/Running balance"]);

      try {
        await sql`
          INSERT INTO bank_transactions (
            account_number, request_date, transaction_date, reference_number,
            partner_bank, partner_account, partner_name, description,
            debit_amount, credit_amount, fee_interest, vat, running_balance,
            source_file, statement_seq
          ) VALUES (
            ${account}, ${requestDate}::timestamptz, ${txDate}::date, ${ref},
            ${String(r["Ngan hang doi tac / Remitter's bank"] ?? "").trim() || null},
            ${String(r["Tai khoan dich/Remitter's account number"] ?? "").trim() || null},
            ${String(r["Tên tài khoản đối ứng/Remitter's account name"] ?? "").trim() || null},
            ${String(r["Dien giai/Description"] ?? "").trim()},
            ${debit}, ${credit}, ${fee}, ${vat}, ${balance},
            ${file}, ${seq}
          )
          ON CONFLICT (reference_number, coalesce(debit_amount, 0), coalesce(credit_amount, 0))
          DO UPDATE SET statement_seq = EXCLUDED.statement_seq, running_balance = EXCLUDED.running_balance`;
        inserted++;
      } catch (e: any) {
        errored++;
        if (errored <= 3) console.warn(`  ⚠️  ref ${ref}: ${e.message?.slice(0, 80)}`);
      }
    }

    console.log(`  ${file}: ${records.length} rows, ${inserted} inserted, ${errored} errored`);
    totalRows += records.length;
    insertedTotal += inserted;
    errorTotal += errored;
  }

  console.log(`\n✅ Tổng: ${insertedTotal} inserted, ${errorTotal} errored (from ${totalRows} raw rows)`);

  const stats = await sql`
    SELECT
      COUNT(*) as n,
      SUM(COALESCE(debit_amount, 0))::float8 as total_debit,
      SUM(COALESCE(credit_amount, 0))::float8 as total_credit,
      MIN(transaction_date) as first_date,
      MAX(transaction_date) as last_date
    FROM bank_transactions`;
  const s = stats[0];
  const fmt = (n: any) => Math.round(Number(n)).toLocaleString("vi-VN");
  console.log(`\nSao kê tổng: ${s.n} giao dịch từ ${s.first_date} đến ${s.last_date}`);
  console.log(`  Tổng OUT (nợ): ${fmt(Math.abs(Number(s.total_debit)))}`);
  console.log(`  Tổng IN  (có): ${fmt(s.total_credit)}`);

    log.created = Number(s.n ?? 0);
    log.details = {
      files_processed: files.length,
      first_date: s.first_date, last_date: s.last_date,
      total_debit: Number(s.total_debit), total_credit: Number(s.total_credit),
    };
    await sql.end();
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
