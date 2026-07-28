import { db } from "../lib/db";
import { financialTransactions, revenueReconciliations } from "../lib/schema";
import { sql, like, and, gte, lte } from "drizzle-orm";

const fmt = (n: number) => n.toLocaleString("vi-VN");

async function main() {
  // App 2025 theo accrual_month
  const app2025 = await db
    .select({
      code: financialTransactions.categoryCode,
      total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)`.as("total"),
    })
    .from(financialTransactions)
    .where(like(financialTransactions.accrualMonth, "2025-%"))
    .groupBy(financialTransactions.categoryCode);
  const appMap = new Map(app2025.map((r) => [r.code, Number(r.total)]));

  // App 2025 theo transaction_month (cash) for comparison
  const app2025cash = await db
    .select({
      code: financialTransactions.categoryCode,
      total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)`.as("total"),
    })
    .from(financialTransactions)
    .where(like(financialTransactions.transactionMonth, "2025-%"))
    .groupBy(financialTransactions.categoryCode);
  const cashMap = new Map(app2025cash.map((r) => [r.code, Number(r.total)]));

  const kimRows = [
    { kim: "6411 Lương NVKD", kimAmount: 198_711_272 },
    {
      kim: "6417 HH+MKT+thưởng",
      kimAmount: 3_088_940_192,
      appCash: (cashMap.get("632") ?? 0) + (cashMap.get("6417") ?? 0),
      appAccrual: (appMap.get("632") ?? 0) + (appMap.get("6417") ?? 0),
    },
    {
      kim: "6421 Lương QL (gộp)",
      kimAmount: 378_361_931,
      appCash: cashMap.get("6421") ?? 0,
      appAccrual: appMap.get("6421") ?? 0,
    },
    { kim: "6423 Đồ dùng VP", kimAmount: 59_706_981, appCash: 0, appAccrual: 0 },
    {
      kim: "6425 Thuế môn bài",
      kimAmount: 2_000_000,
      appCash: cashMap.get("6425") ?? 0,
      appAccrual: appMap.get("6425") ?? 0,
    },
    {
      kim: "6427 Thuê VP + tiện ích",
      kimAmount: 226_704_950,
      appCash:
        (cashMap.get("6427-rent") ?? 0) +
        (cashMap.get("6427-svc") ?? 0) +
        (cashMap.get("6428") ?? 0),
      appAccrual:
        (appMap.get("6427-rent") ?? 0) +
        (appMap.get("6427-svc") ?? 0) +
        (appMap.get("6428") ?? 0),
    },
    {
      kim: "811 Chi phí khác (Triết)",
      kimAmount: 105_234_171,
      appCash: cashMap.get("secondary") ?? 0,
      appAccrual: appMap.get("secondary") ?? 0,
    },
  ];

  console.log(`═════════════════════════════════════════════════`);
  console.log(`  APP CASH vs APP ACCRUAL vs KIM CDPS 2025`);
  console.log(`═════════════════════════════════════════════════\n`);
  console.log(
    `${"TK Kim".padEnd(30)} | ${"Kim 2025".padStart(15)} | ${"App Cash".padStart(15)} | ${"App Accrual".padStart(15)} | ${"Chênh Cash".padStart(13)} | ${"Chênh Accrual".padStart(13)}`,
  );
  console.log("─".repeat(140));
  let sumKim = 0;
  let sumCash = 0;
  let sumAccrual = 0;
  for (const r of kimRows) {
    const cash = r.appCash ?? 0;
    const accrual = r.appAccrual ?? 0;
    console.log(
      `${r.kim.padEnd(30)} | ${fmt(r.kimAmount).padStart(15)} | ${fmt(cash).padStart(15)} | ${fmt(accrual).padStart(15)} | ${fmt(cash - r.kimAmount).padStart(13)} | ${fmt(accrual - r.kimAmount).padStart(13)}`,
    );
    sumKim += r.kimAmount;
    sumCash += cash;
    sumAccrual += accrual;
  }
  console.log("─".repeat(140));
  console.log(
    `${"TỔNG".padEnd(30)} | ${fmt(sumKim).padStart(15)} | ${fmt(sumCash).padStart(15)} | ${fmt(sumAccrual).padStart(15)} | ${fmt(sumCash - sumKim).padStart(13)} | ${fmt(sumAccrual - sumKim).padStart(13)}`,
  );

  // DT
  const revs = await db
    .select({
      revThis: sql<string>`COALESCE(SUM(${revenueReconciliations.revenueThisTime}), 0)`.as("t"),
    })
    .from(revenueReconciliations)
    .where(
      and(
        gte(revenueReconciliations.reconciliationDate, "2025-01-01"),
        lte(revenueReconciliations.reconciliationDate, "2025-12-31"),
      ),
    );
  const dt = Number(revs[0]?.revThis ?? 0);
  console.log(
    `\n${"DT (5113 - accrual by ĐC)".padEnd(30)} | ${fmt(4_255_793_715).padStart(15)} | ${"".padStart(15)} | ${fmt(dt).padStart(15)} | ${"".padStart(13)} | ${fmt(dt - 4_255_793_715).padStart(13)}`,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
