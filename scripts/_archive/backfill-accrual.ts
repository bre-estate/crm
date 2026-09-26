/**
 * Phase B — Backfill accrualMonth cho row HH sale/thưởng gắn deal.
 *
 * Logic:
 * 1. Với row categoryCode = "632" (HH sale hiện tại) hoặc description có "hoa hồng"/"HH"/"thưởng":
 *    - Parse description tìm mã căn (VD "B.12.09", "A-05-07", "B2-11.17"...)
 *    - Normalize (bỏ . và -) → so sánh với unitCode
 * 2. Match được → tìm recon của căn đó có reconciliation_date <= transaction_date, lấy recon MỚI NHẤT
 *    - accrualMonth = tháng recon
 *    - productId = id căn
 * 3. Không match được → giữ accrualMonth = transactionMonth (default cash)
 * 4. Report: bao nhiêu % match, số tiền dịch chuyển tháng bao nhiêu.
 */

import { db } from "../lib/db";
import { financialTransactions, products, revenueReconciliations } from "../lib/schema";
import { eq, and, lte, desc, sql, isNotNull } from "drizzle-orm";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const norm = (s: string) => s.toLowerCase().replace(/[.\-\s]/g, "");

/**
 * Extract product unit codes from description.
 * Handles multi-code strings: "can B.12.09, B.23.15 TT AVIO" → ["B.12.09", "B.23.15"]
 */
function extractUnitCodes(desc: string, allUnitCodes: string[]): string[] {
  const normDesc = norm(desc);
  const matches = new Set<string>();
  for (const code of allUnitCodes) {
    const normCode = norm(code);
    if (normCode.length < 3) continue; // too short → likely false positive
    if (normDesc.includes(normCode)) matches.add(code);
  }
  return [...matches];
}

/**
 * Extract accrual month from description.
 * Matches patterns like:
 *   "T01 2026", "T1/2026", "tháng 12/2024", "tháng 8+9+10 2025", "T11+12 2025"
 * Returns first month (V1 heuristic — cho multi-month lấy tháng đầu).
 * Fallback null nếu không parse được.
 */
function extractAccrualMonthFromDesc(desc: string, txnDate: string): string | null {
  const lower = desc.toLowerCase();
  // Try patterns:
  // "T01 2026" / "T1 2026" / "T01/2026" / "T1/2026"
  // "tháng 12/2024" / "tháng 8 2025"
  // "T3+4/2025" / "tháng 8+9+10 2025" → tháng đầu
  const patterns: RegExp[] = [
    /t[háng\s]*(\d{1,2})[+\d\s]*[\s\/]+(\d{4})/i, // T1 2026, T3+4 2025
    /tháng\s*(\d{1,2})[+\d\s]*[\s\/]+(\d{4})/i, // tháng 12/2024
    /t(\d{1,2})\/(\d{4})/i,
    /(\d{1,2})\/(\d{4})/, // 12/2024 standalone
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m) {
      const mo = Number(m[1]);
      const yr = Number(m[2]);
      if (mo >= 1 && mo <= 12 && yr >= 2020 && yr <= 2035) {
        return `${yr}-${String(mo).padStart(2, "0")}`;
      }
    }
  }
  return null;
}

async function main() {
  // 1) Load all products
  const allProducts = await db
    .select({ id: products.id, unitCode: products.unitCode })
    .from(products);
  const codeToProductId = new Map<string, number>();
  const allUnitCodes: string[] = [];
  for (const p of allProducts) {
    codeToProductId.set(p.unitCode, p.id);
    allUnitCodes.push(p.unitCode);
  }
  // Sort by length DESC so longer codes match first (avoid "A.05" matching "A.05.09")
  allUnitCodes.sort((a, b) => norm(b).length - norm(a).length);
  console.log(`Loaded ${allProducts.length} products.\n`);

  // 2) Preload all recons by productId
  const allRecons = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      reconDate: revenueReconciliations.reconciliationDate,
    })
    .from(revenueReconciliations)
    .where(isNotNull(revenueReconciliations.reconciliationDate));
  const reconsByProduct = new Map<number, Array<{ id: number; date: string }>>();
  for (const r of allRecons) {
    if (!r.reconDate) continue;
    const arr = reconsByProduct.get(r.productId) ?? [];
    arr.push({ id: r.id, date: r.reconDate });
    reconsByProduct.set(r.productId, arr);
  }
  // Sort recons per product by date DESC (latest first)
  for (const arr of reconsByProduct.values()) {
    arr.sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  console.log(`Loaded ${allRecons.length} recons.\n`);

  // 3) Fetch candidate rows: category 632 OR description has HH keyword
  const rows = await db
    .select({
      id: financialTransactions.id,
      date: financialTransactions.transactionDate,
      month: financialTransactions.transactionMonth,
      desc: financialTransactions.description,
      amount: financialTransactions.amount,
      category: financialTransactions.categoryCode,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "632"));
  console.log(`Candidate rows (category 632): ${rows.length}\n`);

  // Reset all 632 rows to default first (in case re-run)
  await db
    .update(financialTransactions)
    .set({ accrualMonth: sql`transaction_month`, productId: null })
    .where(eq(financialTransactions.categoryCode, "632"));

  // 4) Match & update
  let matchedByCode = 0;
  let matchedByMonth = 0;
  let noMatch = 0;
  let ambiguous = 0;
  let shiftedAmount = 0;
  let shiftedCount = 0;
  const noMatchExamples: Array<{ desc: string; amount: number }> = [];

  for (const r of rows) {
    let newAccrual: string | null = null;
    let productId: number | null = null;
    let matchType: "code" | "month" | "" = "";

    // Try match by product code first (strong signal)
    const codes = extractUnitCodes(r.desc, allUnitCodes);
    if (codes.length > 0) {
      if (codes.length > 1) ambiguous++;
      productId = codeToProductId.get(codes[0]) ?? null;
      if (productId) {
        const recons = reconsByProduct.get(productId) ?? [];
        const rec = recons.find((rc) => rc.date <= r.date) ?? recons[0];
        if (rec) {
          newAccrual = rec.date.slice(0, 7);
          matchType = "code";
        }
      }
    }

    // Fallback: parse month from description (VD "T01 2026", "tháng 8+9+10")
    if (!newAccrual) {
      const parsed = extractAccrualMonthFromDesc(r.desc, r.date);
      if (parsed) {
        newAccrual = parsed;
        matchType = "month";
      }
    }

    if (!newAccrual) {
      noMatch++;
      if (noMatchExamples.length < 15) noMatchExamples.push({ desc: r.desc, amount: r.amount });
      continue;
    }

    if (matchType === "code") matchedByCode++;
    else if (matchType === "month") matchedByMonth++;

    if (newAccrual !== r.month) {
      shiftedAmount += r.amount;
      shiftedCount++;
    }
    await db
      .update(financialTransactions)
      .set({ accrualMonth: newAccrual, productId })
      .where(eq(financialTransactions.id, r.id));
  }
  const matched = matchedByCode + matchedByMonth;

  console.log(`═════════════════════════════════════════════════`);
  console.log(`  KẾT QUẢ BACKFILL`);
  console.log(`═════════════════════════════════════════════════`);
  console.log(`  Matched (tổng)       : ${matched} / ${rows.length}  (${((matched / rows.length) * 100).toFixed(1)}%)`);
  console.log(`    - by product code  : ${matchedByCode}`);
  console.log(`    - by month keyword : ${matchedByMonth}`);
  console.log(`  Trong đó multi-căn   : ${ambiguous} (dùng căn đầu tiên — V1)`);
  console.log(`  Không match          : ${noMatch}`);
  console.log(`  Rows dịch tháng      : ${shiftedCount} (${fmt(shiftedAmount)} VND)`);

  console.log(`\n=== Ví dụ 15 rows KHÔNG match (cần fix tay hoặc Phase C rethink) ===`);
  for (const e of noMatchExamples) {
    console.log(`  ${fmt(e.amount).padStart(14)} · ${e.desc.substring(0, 90)}`);
  }

  // Verify: how many rows have accrual != transaction now
  const [check] = await db
    .select({
      diff: sql<number>`count(*) filter (where accrual_month != transaction_month)`,
      total: sql<number>`count(*)`,
    })
    .from(financialTransactions);
  console.log(`\nDB state: ${check.diff} / ${check.total} rows có accrual_month ≠ transaction_month`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
