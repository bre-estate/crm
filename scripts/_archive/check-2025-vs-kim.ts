import { db } from "../lib/db";
import {
  revenueReconciliations,
  financialTransactions,
  accountingCategories,
} from "../lib/schema";
import { sql, and, gte, lte, like } from "drizzle-orm";

const fmt = (n: number) => n.toLocaleString("vi-VN");

async function main() {
  // ========== DOANH THU 2025 (theo ngày ĐC) ==========
  const revs = await db
    .select({
      receivable: revenueReconciliations.revenueReceivable,
      revThis: revenueReconciliations.revenueThisTime,
      cdtSale: revenueReconciliations.cdtBonusSale,
      cdtMgr: revenueReconciliations.cdtBonusManager,
      totalThis: revenueReconciliations.totalReceivableThisTime,
      reconDate: revenueReconciliations.reconciliationDate,
    })
    .from(revenueReconciliations)
    .where(
      and(
        gte(revenueReconciliations.reconciliationDate, "2025-01-01"),
        lte(revenueReconciliations.reconciliationDate, "2025-12-31"),
      ),
    );

  let dtReceivable = 0;
  let dtRevThis = 0;
  let dtCdtSale = 0;
  let dtCdtMgr = 0;
  let dtTotalThis = 0;
  for (const r of revs) {
    dtReceivable += Number(r.receivable ?? 0);
    dtRevThis += Number(r.revThis ?? 0);
    dtCdtSale += Number(r.cdtSale ?? 0);
    dtCdtMgr += Number(r.cdtMgr ?? 0);
    dtTotalThis += Number(r.totalThis ?? 0);
  }

  console.log("═════════════════════════════════════════════════");
  console.log("  DOANH THU 2025 (theo ngày ĐC)");
  console.log("═════════════════════════════════════════════════");
  console.log(`  Số recon: ${revs.length}`);
  console.log(`  revenue_receivable       (HH BRE nhận): ${fmt(dtReceivable)}`);
  console.log(`  revenue_this_time        (HH đợt này) : ${fmt(dtRevThis)}`);
  console.log(`  cdt_bonus_sale           (thưởng CĐT sale)   : ${fmt(dtCdtSale)}`);
  console.log(`  cdt_bonus_manager        (thưởng CĐT quản lý): ${fmt(dtCdtMgr)}`);
  console.log(`  total_receivable_this_time: ${fmt(dtTotalThis)}`);

  console.log("\n  KIM báo cáo:");
  console.log(`  1.2 DT không VAT:                         4,255,793,715`);
  console.log(`  1.3 CĐT thưởng sale gồm VAT:                635,590,909`);
  console.log(`  1.4 CĐT thưởng quản lý gồm VAT:              22,000,000`);
  console.log(`  1.5 DT không VAT, không gồm thưởng CĐT:   3,657,983,798`);

  // ========== CHI PHÍ 2025 ==========
  const cats = await db.select().from(accountingCategories);
  const catMap = new Map(cats.map((c) => [c.code, c]));

  const exp = await db
    .select({
      code: financialTransactions.categoryCode,
      mgmt: financialTransactions.managementGroup,
      total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)`.as("total"),
      cnt: sql<number>`COUNT(*)`.as("cnt"),
    })
    .from(financialTransactions)
    .where(like(financialTransactions.transactionMonth, "2025-%"))
    .groupBy(financialTransactions.categoryCode, financialTransactions.managementGroup)
    .orderBy(financialTransactions.categoryCode);

  console.log("\n═════════════════════════════════════════════════");
  console.log("  CHI PHÍ 2025 (financial_transactions, theo transaction_month)");
  console.log("═════════════════════════════════════════════════");
  let totalAll = 0;
  for (const e of exp) {
    const cat = catMap.get(e.code);
    const isExpense = cat?.isExpense ?? true;
    const label = cat?.name ?? "?";
    const flag = isExpense ? " " : "*"; // * = không phải chi phí BCTC
    console.log(
      `  ${flag} ${e.code.padEnd(20)} ${label.padEnd(35)} ${fmt(Number(e.total)).padStart(18)}  (${e.cnt})`,
    );
    if (isExpense) totalAll += Number(e.total);
  }
  console.log(`\n  Tổng chi phí BCTC (loại * = pass-through): ${fmt(totalAll)}`);

  console.log("\n  KIM báo cáo:");
  console.log(`  2   Giá vốn (không thưởng CĐT):           2,225,983,923`);
  console.log(`  4   CP cố định (không thưởng CĐT):        1,385,171,969`);
  console.log(`  5   Tổng CP HĐ (không thưởng CĐT):        3,611,155,892`);

  // ========== SO SÁNH THEO NHÓM CLASSIFIER ==========
  // Group theo variable (632, giá vốn) vs fixed (còn lại là chi phí BCTC)
  const groupExp = await db
    .select({
      code: financialTransactions.categoryCode,
      total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)`.as("total"),
    })
    .from(financialTransactions)
    .where(like(financialTransactions.transactionMonth, "2025-%"))
    .groupBy(financialTransactions.categoryCode);

  let vGiaVon = 0;
  let vFixed = 0;
  let vPass = 0;
  for (const e of groupExp) {
    const cat = catMap.get(e.code);
    const amt = Number(e.total);
    if (!cat?.isExpense) {
      vPass += amt;
      continue;
    }
    if (e.code === "632") vGiaVon += amt;
    else vFixed += amt;
  }
  console.log("\n═════════════════════════════════════════════════");
  console.log("  TÓM TẮT (app classifier hiện tại)");
  console.log("═════════════════════════════════════════════════");
  console.log(`  Giá vốn (632):        ${fmt(vGiaVon).padStart(18)}  ← Kim: 2,225,983,923`);
  console.log(`  Fixed (khác):         ${fmt(vFixed).padStart(18)}  ← Kim: 1,385,171,969`);
  console.log(`  Tổng CP:              ${fmt(vGiaVon + vFixed).padStart(18)}  ← Kim: 3,611,155,892`);
  console.log(`  Không phải CP BCTC:   ${fmt(vPass).padStart(18)}`);

  console.log("\n  Chênh so với Kim:");
  console.log(`  Giá vốn:  ${fmt(vGiaVon - 2_225_983_923)}`);
  console.log(`  Fixed:    ${fmt(vFixed - 1_385_171_969)}`);
  console.log(`  Tổng CP:  ${fmt(vGiaVon + vFixed - 3_611_155_892)}`);

  // Lãi
  const laiGop = dtReceivable - vGiaVon;
  const laiRong = laiGop - vFixed;
  console.log("\n═════════════════════════════════════════════════");
  console.log("  LÃI 2025 (theo app)");
  console.log("═════════════════════════════════════════════════");
  console.log(`  DT thuần (revenue_receivable): ${fmt(dtReceivable)}`);
  console.log(`  - Giá vốn (632):               ${fmt(vGiaVon)}`);
  console.log(`  = Lãi gộp:                     ${fmt(laiGop)}  ← Kim: 1,431,999,875`);
  console.log(`  - Fixed:                       ${fmt(vFixed)}`);
  console.log(`  = Lợi nhuận:                   ${fmt(laiRong)}  ← Kim: 46,827,906`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
