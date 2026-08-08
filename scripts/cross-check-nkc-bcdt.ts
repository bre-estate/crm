/**
 * Cross-check NKC hh_sale rows với BCDT (cost_reconciliations).
 * Nếu row NKC có mã căn cụ thể → sum BCDT cho căn đó → verify.
 * Nếu match trong tolerance (5%) → auto-split hh_sale/bonus_manager/bonus_sale.
 *
 * Usage: cd BRE/App/CRM && npx tsx scripts/cross-check-nkc-bcdt.ts [--apply]
 *   --apply: thực sự split (default là dry-run report)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

// Extract mã căn từ description NKC
// Formats: "can B.28.18", "can B.11.06, B.12.09, B.12.20", "can A.10.10 và B-15-01", "can 14.16", "A05.09"
function extractUnitCodes(desc: string): string[] {
  const codes = new Set<string>();
  // Pattern 1: Letter (+ optional digit) + separator + num + separator + num + optional letter
  // Match: B.28.18, A.10.10, B-15-01, B2.11.17, A05.09, A2-23.03, B.31.12A
  const re1 = /[A-Z]\d?[-.]?\d{1,3}[-.]\d{1,3}[a-zA-Z]?/g;
  // Pattern 2: Number.Number (no letter): 14.16, 4.19
  const re2 = /(?<![A-Z0-9])\d{1,3}\.\d{1,3}(?![.\d])/g;

  for (const re of [re1, re2]) {
    const matches = desc.match(re) ?? [];
    for (const m of matches) codes.add(m.trim());
  }
  return Array.from(codes);
}

// Fuzzy match unit_code: '14.16' == '14-16', 'A05.09' == 'A.05.09', 'B-15-01' == 'B.15.01'
function normalizeUnitCode(s: string): string {
  return s.toUpperCase().replace(/[-.]/g, "").replace(/^0+/, "");
}

async function main() {
  console.log(`═══ Cross-check NKC hh_sale vs BCDT ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ═══\n`);

  // Load tất cả products với unit_code (build lookup map)
  const products = await sql`SELECT id, unit_code FROM products WHERE unit_code IS NOT NULL`;
  const productMap = new Map<string, number>();
  for (const p of products) {
    productMap.set(normalizeUnitCode(p.unit_code), p.id);
  }

  // Rows NKC bucket hh_sale hoặc cty_thuong_ql chưa manual
  const nkcRows = await sql`
    SELECT id, entry_date, amount::float8 as amount, description, category
    FROM accounting_journal
    WHERE category IN ('hh_sale', 'cty_thuong_ql')
      AND category_source != 'manual'
      AND substr(entry_date,1,4)='2025'
      AND credit_account != '911'
    ORDER BY amount DESC`;

  let splitCount = 0;
  let verifiedMatch = 0;
  let noMatch = 0;

  for (const r of nkcRows) {
    const codes = extractUnitCodes(r.description ?? "");
    const productIds = codes.map(c => productMap.get(normalizeUnitCode(c))).filter(Boolean) as number[];

    if (productIds.length === 0) {
      console.log(`❓ NO_CODE  ${fmt(Number(r.amount))}  ${(r.description||'').slice(0,80)}`);
      noMatch++;
      continue;
    }

    // Query BCDT cho các căn này
    const bcdt = await sql`
      SELECT cost_type, COALESCE(SUM(amount_payable_this_time), 0)::float8 as s
      FROM cost_reconciliations
      WHERE product_id = ANY(${productIds})
      GROUP BY cost_type`;

    const bMap: Record<string, number> = {};
    for (const b of bcdt) bMap[b.cost_type] = Number(b.s);
    const totalBcdt = Object.values(bMap).reduce((s, v) => s + v, 0);
    const diff = Math.abs(Number(r.amount) - totalBcdt);
    const tolerance = totalBcdt * 0.05; // 5%

    const parts = [
      `hh=${fmt(bMap['sale_commission']||0)}`,
      `bmgr=${fmt(bMap['bonus_manager']||0)}`,
      `bsale=${fmt(bMap['bonus_sale']||0)}`,
      `cs=${fmt(bMap['customer_support']||0)}`,
    ].filter(p => !p.endsWith("=0")).join(" ");

    const status = diff < tolerance ? "✅ MATCH" : diff < totalBcdt * 0.15 ? "⚠️ CLOSE" : "❌ NO_MATCH";
    console.log(`${status}  ${fmt(Number(r.amount)).padStart(13)}  BCDT=${fmt(totalBcdt).padStart(13)}  Δ=${fmt(diff).padStart(9)}  [${codes.join(",")}]  ${parts}`);

    if (status === "✅ MATCH" && APPLY) {
      // Auto-split theo cost_type BCDT
      const nkcAmt = Number(r.amount);
      const ratio = nkcAmt / totalBcdt;
      const hhSplit = (bMap['sale_commission'] || 0) * ratio;
      const bmgrSplit = (bMap['bonus_manager'] || 0) * ratio;
      const bsaleSplit = (bMap['bonus_sale'] || 0) * ratio;
      const csSplit = (bMap['customer_support'] || 0) * ratio;

      // Update row gốc = phần hh_sale (main)
      await sql`
        UPDATE accounting_journal
        SET amount = ${hhSplit},
            category = 'hh_sale',
            category_source = 'auto-split',
            category_confidence = 90,
            description = ${`[SPLIT hh=${fmt(hhSplit)}] ${r.description}`}
        WHERE id = ${r.id}`;

      // Insert rows mới cho các phần khác
      const inserts: Array<{ amount: number; category: string; label: string }> = [];
      if (bmgrSplit > 0) inserts.push({ amount: bmgrSplit, category: 'cty_thuong_ql', label: 'bmgr' });
      if (bsaleSplit > 0) inserts.push({ amount: bsaleSplit, category: 'thuong_ds_sale', label: 'bsale' });
      if (csSplit > 0) inserts.push({ amount: csSplit, category: 'ho_tro_khach', label: 'cs' });

      for (const ins of inserts) {
        await sql`
          INSERT INTO accounting_journal (
            entry_date, doc_type, doc_number, description,
            debit_account, credit_account, amount,
            source_file, source_sheet, source_row, dedup_key,
            category, category_source, category_confidence
          )
          SELECT entry_date, doc_type, doc_number,
            ${`[SPLIT ${ins.label}=${fmt(ins.amount)}] ${r.description}`},
            debit_account, credit_account, ${ins.amount},
            source_file, source_sheet, source_row,
            ${`${r.id}_split_${ins.label}_${Date.now()}`},
            ${ins.category}, 'auto-split', 90
          FROM accounting_journal WHERE id = ${r.id}`;
      }
      splitCount++;
    }
    if (status === "✅ MATCH") verifiedMatch++;
  }

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`✅ Match (within 5%): ${verifiedMatch}`);
  console.log(`❓ No mã căn hoặc no match: ${noMatch}`);
  if (APPLY) console.log(`🔧 Split applied: ${splitCount}`);
  else console.log(`\nDry-run — thêm --apply để thực sự split`);

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
