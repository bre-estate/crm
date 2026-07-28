import { db } from "../lib/db";
import { financialTransactions } from "../lib/schema";
import { sql, and, like, eq } from "drizzle-orm";

const fmt = (n: number) => n.toLocaleString("vi-VN");

async function main() {
  // Detail 632 by mgmt group + description bucket
  for (const code of ["632", "6421", "6417", "6427-rent", "6428"]) {
    const rows = await db
      .select({
        mgmt: financialTransactions.managementGroup,
        source: financialTransactions.sourceFile,
        total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)`.as("total"),
        cnt: sql<number>`COUNT(*)`.as("cnt"),
      })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.categoryCode, code),
          like(financialTransactions.transactionMonth, "2025-%"),
        ),
      )
      .groupBy(financialTransactions.managementGroup, financialTransactions.sourceFile)
      .orderBy(financialTransactions.managementGroup);
    console.log(`\n=== ${code} (2025) ===`);
    let sum = 0;
    for (const r of rows) {
      console.log(
        `  ${(r.mgmt ?? "-").padEnd(30)} | ${(r.source ?? "").padEnd(25)} | ${fmt(Number(r.total)).padStart(16)} · ${r.cnt}`,
      );
      sum += Number(r.total);
    }
    console.log(`  TOTAL: ${fmt(sum)}`);
  }

  // Check top rows in 632
  console.log(`\n=== TOP 20 amounts trong 632 (2025) ===`);
  const top = await db
    .select({
      date: financialTransactions.transactionDate,
      desc: financialTransactions.description,
      recipient: financialTransactions.recipient,
      amount: financialTransactions.amount,
      source: financialTransactions.sourceFile,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "632"),
        like(financialTransactions.transactionMonth, "2025-%"),
      ),
    )
    .orderBy(sql`${financialTransactions.amount} DESC`)
    .limit(20);
  for (const r of top) {
    console.log(
      `  ${r.date} · ${fmt(Number(r.amount)).padStart(14)} · ${(r.recipient ?? "-").padEnd(30)} · ${r.desc.substring(0, 60)}`,
    );
  }

  // Check 6421 top
  console.log(`\n=== TOP 20 amounts trong 6421 (2025) ===`);
  const top2 = await db
    .select({
      date: financialTransactions.transactionDate,
      desc: financialTransactions.description,
      recipient: financialTransactions.recipient,
      amount: financialTransactions.amount,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "6421"),
        like(financialTransactions.transactionMonth, "2025-%"),
      ),
    )
    .orderBy(sql`${financialTransactions.amount} DESC`)
    .limit(20);
  for (const r of top2) {
    console.log(
      `  ${r.date} · ${fmt(Number(r.amount)).padStart(14)} · ${(r.recipient ?? "-").padEnd(30)} · ${r.desc.substring(0, 60)}`,
    );
  }

  // Doanh thu detail 2025 — use revenue_this_time
  console.log(`\n=== DT 2025 theo tháng ===`);
  const revs = await db.execute(sql`
    SELECT
      substring(reconciliation_date, 1, 7) AS m,
      COUNT(*) AS cnt,
      SUM(COALESCE(revenue_this_time, 0)) AS rev_this,
      SUM(COALESCE(revenue_receivable, 0)) AS rev_recv,
      SUM(COALESCE(total_receivable_this_time, 0)) AS total_recv,
      SUM(COALESCE(cdt_bonus_sale, 0)) AS cdt_sale,
      SUM(COALESCE(cdt_bonus_manager, 0)) AS cdt_mgr
    FROM revenue_reconciliations
    WHERE reconciliation_date LIKE '2025-%'
    GROUP BY m
    ORDER BY m
  `);
  console.log(`  Month | Cnt | rev_this_time | rev_receivable | total_receivable | cdt_sale | cdt_mgr`);
  let sumRevThis = 0;
  let sumRevRecv = 0;
  let sumTotal = 0;
  for (const r of revs as any) {
    console.log(
      `  ${r.m} | ${String(r.cnt).padStart(3)} | ${fmt(Number(r.rev_this)).padStart(15)} | ${fmt(Number(r.rev_recv)).padStart(15)} | ${fmt(Number(r.total_recv)).padStart(15)} | ${fmt(Number(r.cdt_sale)).padStart(12)} | ${fmt(Number(r.cdt_mgr)).padStart(12)}`,
    );
    sumRevThis += Number(r.rev_this);
    sumRevRecv += Number(r.rev_recv);
    sumTotal += Number(r.total_recv);
  }
  console.log(
    `  TOTAL          ${fmt(sumRevThis).padStart(15)}   ${fmt(sumRevRecv).padStart(15)}   ${fmt(sumTotal).padStart(15)}`,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
