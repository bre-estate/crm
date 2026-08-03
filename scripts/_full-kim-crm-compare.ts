/**
 * Full compare Kim's bank activity (TK 11211) vs CRM financial_transactions.
 * Cho từng entry Kim liên quan bank → tìm CRM match theo amount + date range.
 * Flag: matched, timing lag, Kim orphan, CRM orphan.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number | string) => Math.round(Number(n)).toLocaleString("vi-VN");

async function main() {
  // 1. Get all Kim bank activity (11211 as debit or credit)
  const kim = await sql`
    SELECT
      entry_date,
      doc_type,
      doc_number,
      description,
      debit_account,
      credit_account,
      amount,
      CASE WHEN debit_account = '11211' THEN 'in' ELSE 'out' END as bank_direction
    FROM accounting_journal
    WHERE (debit_account = '11211' OR credit_account = '11211')
      AND entry_date LIKE '2025-%'
    ORDER BY entry_date, amount DESC`;
  console.log(`Kim 11211 entries 2025: ${kim.length}`);

  // 2. For each Kim entry, find CRM match
  type MatchResult = {
    kim: any;
    crmMatches: any[];
    status: "exact" | "timing_lag" | "kim_orphan" | "multi_match";
    gapDays: number;
  };
  const results: MatchResult[] = [];
  const matchedCrmIds = new Set<number>();

  for (const k of kim) {
    const kDir = k.bank_direction; // 'in' or 'out'
    const kAmt = Number(k.amount);
    const kDate = k.entry_date;
    // Search CRM: same direction, amount ± 0.5%, date ± 15 days
    const matches = await sql`
      SELECT id, transaction_date, category_code, amount, recipient, description, source_file
      FROM financial_transactions
      WHERE direction = ${kDir}
        AND ABS(amount - ${kAmt}) / ${kAmt} <= 0.005
        AND ABS(to_date(transaction_date, 'YYYY-MM-DD') - to_date(${kDate}, 'YYYY-MM-DD')) <= 15
      ORDER BY ABS(to_date(transaction_date, 'YYYY-MM-DD') - to_date(${kDate}, 'YYYY-MM-DD'))`;

    if (matches.length === 0) {
      results.push({ kim: k, crmMatches: [], status: "kim_orphan", gapDays: -1 });
    } else {
      const best = matches[0];
      matchedCrmIds.add(Number(best.id));
      const days = Math.abs(
        (new Date(best.transaction_date).getTime() - new Date(kDate).getTime()) / (86400 * 1000)
      );
      results.push({
        kim: k,
        crmMatches: matches,
        status: days === 0 ? "exact" : days <= 3 ? "exact" : "timing_lag",
        gapDays: days,
      });
    }
  }

  // 3. CRM orphans — rows in CRM not matched to any Kim entry (from 2025 only)
  const allCrm = await sql`
    SELECT id, transaction_date, category_code, direction, amount, recipient, description, source_file
    FROM financial_transactions
    WHERE transaction_month LIKE '2025-%'
      AND amount > 100000`;
  const crmOrphans = allCrm.filter((r: any) => !matchedCrmIds.has(Number(r.id)));

  // ============================================================================
  // REPORT
  // ============================================================================
  const kimOrphans = results.filter((r) => r.status === "kim_orphan");
  const exacts = results.filter((r) => r.status === "exact");
  const lags = results.filter((r) => r.status === "timing_lag");

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`SUMMARY`);
  console.log(`═══════════════════════════════════════════════`);
  console.log(`Kim entries (bank 2025):   ${kim.length}`);
  console.log(`  ✅ Match exact/close:    ${exacts.length}`);
  console.log(`  ⏰ Timing lag (>3 days): ${lags.length}`);
  console.log(`  ❌ Kim orphan:           ${kimOrphans.length}`);
  console.log(`CRM rows 2025 (>100k):     ${allCrm.length}`);
  console.log(`  ❌ CRM orphan (không match Kim): ${crmOrphans.length}`);

  console.log(`\n═══ KIM ORPHANS (Kim có, CRM không có) — cần import? ═══`);
  console.log(`${"Ngày".padEnd(12)} ${"Nợ→Có".padEnd(14)} ${"Số tiền".padStart(14)}  Description`);
  console.log("─".repeat(120));
  let kimOrphanTotal = 0;
  for (const r of kimOrphans) {
    kimOrphanTotal += Number(r.kim.amount);
    console.log(`${r.kim.entry_date.padEnd(12)} ${(r.kim.debit_account + "→" + r.kim.credit_account).padEnd(14)} ${fmt(r.kim.amount).padStart(14)}  ${r.kim.description?.slice(0, 70)}`);
  }
  console.log(`TỔNG Kim orphan: ${fmt(kimOrphanTotal)}`);

  console.log(`\n═══ TIMING LAG (Match nhưng khác ngày > 3 ngày) — nhận/trả chậm ═══`);
  console.log(`${"Kim date".padEnd(12)} ${"CRM date".padEnd(12)} ${"Gap ngày".padStart(9)} ${"Số tiền".padStart(14)}  Description`);
  console.log("─".repeat(120));
  for (const r of lags.slice(0, 30)) {
    console.log(`${r.kim.entry_date.padEnd(12)} ${r.crmMatches[0].transaction_date.padEnd(12)} ${String(r.gapDays).padStart(9)} ${fmt(r.kim.amount).padStart(14)}  ${r.kim.description?.slice(0, 60)}`);
  }
  if (lags.length > 30) console.log(`... còn ${lags.length - 30} rows nữa`);

  console.log(`\n═══ CRM ORPHANS (CRM có, Kim không có) — top 30 amount lớn ═══`);
  const sortedOrphans = crmOrphans.sort((a: any, b: any) => Number(b.amount) - Number(a.amount)).slice(0, 30);
  console.log(`${"Ngày".padEnd(12)} ${"Cat".padEnd(6)} ${"Dir".padEnd(4)} ${"Số tiền".padStart(14)} ${"Nhận".padEnd(25)}  Description [source]`);
  console.log("─".repeat(140));
  for (const r of sortedOrphans) {
    console.log(`${r.transaction_date.padEnd(12)} ${String(r.category_code).padEnd(6)} ${String(r.direction).padEnd(4)} ${fmt(r.amount).padStart(14)} ${(r.recipient ?? "").slice(0, 25).padEnd(25)}  ${(r.description ?? "").slice(0, 50)} [${r.source_file}]`);
  }
  let crmOrphanTotal = crmOrphans.reduce((s, r: any) => s + Number(r.amount), 0);
  console.log(`TỔNG CRM orphan: ${fmt(crmOrphanTotal)} (${crmOrphans.length} rows)`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
