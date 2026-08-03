/**
 * V2: Match Kim vs CRM đúng bảng:
 * - Kim OUT (11211 credit) → CRM financial_transactions dir=out HOẶC payments_out
 * - Kim IN  (11211 debit)  → CRM payments_in HOẶC financial_transactions dir=in
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number | string) => Math.round(Number(n)).toLocaleString("vi-VN");

async function main() {
  const kim = await sql`
    SELECT entry_date, doc_number, description, debit_account, credit_account, amount,
      CASE WHEN debit_account = '11211' THEN 'in' ELSE 'out' END as bank_dir
    FROM accounting_journal
    WHERE (debit_account = '11211' OR credit_account = '11211')
      AND entry_date LIKE '2025-%'
    ORDER BY entry_date`;
  console.log(`Kim bank entries 2025: ${kim.length}`);

  const outEntries = kim.filter((k: any) => k.bank_dir === "out");
  const inEntries = kim.filter((k: any) => k.bank_dir === "in");
  console.log(`  OUT (tiền ra): ${outEntries.length}, tổng ${fmt(outEntries.reduce((s: number, k: any) => s + Number(k.amount), 0))}`);
  console.log(`  IN  (tiền vào): ${inEntries.length}, tổng ${fmt(inEntries.reduce((s: number, k: any) => s + Number(k.amount), 0))}`);

  // Match Kim OUT vs CRM
  const outResults: Array<{ kim: any; match: any | null; source: string; days: number }> = [];
  for (const k of outEntries) {
    const kAmt = Number(k.amount);
    // Try financial_transactions dir=out
    let match: any = null, source = "";
    const fin = await sql`
      SELECT id, transaction_date, category_code, amount, recipient, description, source_file
      FROM financial_transactions
      WHERE direction = 'out'
        AND ABS(amount - ${kAmt}) / ${kAmt} <= 0.005
        AND ABS(to_date(transaction_date, 'YYYY-MM-DD') - to_date(${k.entry_date}, 'YYYY-MM-DD')) <= 15
      ORDER BY ABS(to_date(transaction_date, 'YYYY-MM-DD') - to_date(${k.entry_date}, 'YYYY-MM-DD'))
      LIMIT 1`;
    if (fin.length > 0) { match = fin[0]; source = "financial_txn"; }
    else {
      const pout = await sql`
        SELECT id, payment_date as transaction_date, amount, note as description
        FROM payments_out
        WHERE ABS(amount - ${kAmt}) / ${kAmt} <= 0.005
          AND ABS(to_date(payment_date, 'YYYY-MM-DD') - to_date(${k.entry_date}, 'YYYY-MM-DD')) <= 15
        LIMIT 1`;
      if (pout.length > 0) { match = pout[0]; source = "payments_out"; }
    }
    const days = match ? Math.abs((new Date(match.transaction_date).getTime() - new Date(k.entry_date).getTime()) / 86400000) : -1;
    outResults.push({ kim: k, match, source, days });
  }

  // Match Kim IN vs CRM
  const inResults: Array<{ kim: any; match: any | null; source: string; days: number }> = [];
  for (const k of inEntries) {
    const kAmt = Number(k.amount);
    let match: any = null, source = "";
    const pin = await sql`
      SELECT id, payment_date as transaction_date, amount, note as description
      FROM payments_in
      WHERE ABS(amount - ${kAmt}) / ${kAmt} <= 0.005
        AND ABS(to_date(payment_date, 'YYYY-MM-DD') - to_date(${k.entry_date}, 'YYYY-MM-DD')) <= 15
      LIMIT 1`;
    if (pin.length > 0) { match = pin[0]; source = "payments_in"; }
    else {
      const fin = await sql`
        SELECT id, transaction_date, amount, description
        FROM financial_transactions
        WHERE direction = 'in'
          AND ABS(amount - ${kAmt}) / ${kAmt} <= 0.005
          AND ABS(to_date(transaction_date, 'YYYY-MM-DD') - to_date(${k.entry_date}, 'YYYY-MM-DD')) <= 15
        LIMIT 1`;
      if (fin.length > 0) { match = fin[0]; source = "financial_txn dir=in"; }
    }
    const days = match ? Math.abs((new Date(match.transaction_date).getTime() - new Date(k.entry_date).getTime()) / 86400000) : -1;
    inResults.push({ kim: k, match, source, days });
  }

  // SUMMARY
  const catStatus = (r: any) => !r.match ? "orphan" : r.days <= 3 ? "match" : "lag";
  const s = {
    outMatch: outResults.filter((r) => catStatus(r) === "match").length,
    outLag: outResults.filter((r) => catStatus(r) === "lag").length,
    outOrphan: outResults.filter((r) => catStatus(r) === "orphan").length,
    inMatch: inResults.filter((r) => catStatus(r) === "match").length,
    inLag: inResults.filter((r) => catStatus(r) === "lag").length,
    inOrphan: inResults.filter((r) => catStatus(r) === "orphan").length,
  };
  console.log("\n═══ SUMMARY ═══");
  console.log(`OUT: ${outResults.length} total → ✅ ${s.outMatch} match (≤3d) · ⏰ ${s.outLag} lag (>3d) · ❌ ${s.outOrphan} orphan`);
  console.log(`IN:  ${inResults.length} total → ✅ ${s.inMatch} match (≤3d) · ⏰ ${s.inLag} lag (>3d) · ❌ ${s.inOrphan} orphan`);

  // TABLES
  console.log("\n═══ TIMING LAG OUT (Kim vs CRM lệch >3 ngày) ═══");
  console.log(`${"KimDate".padEnd(12)} ${"CrmDate".padEnd(12)} ${"Gap".padStart(4)} ${"Amount".padStart(14)}  Source            KimDesc`);
  console.log("─".repeat(140));
  for (const r of outResults.filter((r) => catStatus(r) === "lag")) {
    console.log(`${r.kim.entry_date.padEnd(12)} ${r.match.transaction_date.padEnd(12)} ${String(r.days).padStart(4)} ${fmt(r.kim.amount).padStart(14)}  ${r.source.padEnd(18)}${r.kim.description?.slice(0, 55)}`);
  }

  console.log("\n═══ TIMING LAG IN ═══");
  console.log(`${"KimDate".padEnd(12)} ${"CrmDate".padEnd(12)} ${"Gap".padStart(4)} ${"Amount".padStart(14)}  Source            KimDesc`);
  console.log("─".repeat(140));
  for (const r of inResults.filter((r) => catStatus(r) === "lag")) {
    console.log(`${r.kim.entry_date.padEnd(12)} ${r.match.transaction_date.padEnd(12)} ${String(r.days).padStart(4)} ${fmt(r.kim.amount).padStart(14)}  ${r.source.padEnd(18)}${r.kim.description?.slice(0, 55)}`);
  }

  console.log("\n═══ KIM OUT ORPHAN (Kim có, CRM không) ═══");
  console.log(`${"Date".padEnd(12)} ${"TK Nợ→Có".padEnd(12)} ${"Amount".padStart(14)}  Description`);
  console.log("─".repeat(130));
  let outOrphanTotal = 0;
  for (const r of outResults.filter((r) => catStatus(r) === "orphan")) {
    outOrphanTotal += Number(r.kim.amount);
    console.log(`${r.kim.entry_date.padEnd(12)} ${(r.kim.debit_account + "→" + r.kim.credit_account).padEnd(12)} ${fmt(r.kim.amount).padStart(14)}  ${r.kim.description?.slice(0, 75)}`);
  }
  console.log(`TỔNG OUT orphan: ${fmt(outOrphanTotal)}`);

  console.log("\n═══ KIM IN ORPHAN (Kim có, CRM không) ═══");
  console.log(`${"Date".padEnd(12)} ${"TK Nợ→Có".padEnd(12)} ${"Amount".padStart(14)}  Description`);
  console.log("─".repeat(130));
  let inOrphanTotal = 0;
  for (const r of inResults.filter((r) => catStatus(r) === "orphan")) {
    inOrphanTotal += Number(r.kim.amount);
    console.log(`${r.kim.entry_date.padEnd(12)} ${(r.kim.debit_account + "→" + r.kim.credit_account).padEnd(12)} ${fmt(r.kim.amount).padStart(14)}  ${r.kim.description?.slice(0, 75)}`);
  }
  console.log(`TỔNG IN orphan: ${fmt(inOrphanTotal)}`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
