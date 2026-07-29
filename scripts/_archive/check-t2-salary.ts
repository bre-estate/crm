import { db } from "../lib/db";
import { financialTransactions } from "../lib/schema";
import { and, or, eq, ilike } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      id: financialTransactions.id,
      date: financialTransactions.transactionDate,
      month: financialTransactions.transactionMonth,
      desc: financialTransactions.description,
      amount: financialTransactions.amount,
      recipient: financialTransactions.recipient,
      payer: financialTransactions.payer,
      category: financialTransactions.categoryCode,
      mgmt: financialTransactions.managementGroup,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.transactionMonth, "2026-02"),
        or(
          ilike(financialTransactions.recipient, "%bách%"),
          ilike(financialTransactions.recipient, "%nhật%"),
          ilike(financialTransactions.recipient, "%thành%"),
          ilike(financialTransactions.description, "%lương%"),
          ilike(financialTransactions.description, "%hoa hồng%"),
          ilike(financialTransactions.description, "%HH%"),
          ilike(financialTransactions.description, "%KPI%"),
          ilike(financialTransactions.description, "%thưởng%"),
        ),
      ),
    );

  console.log(`\n=== T2/2026 (${rows.length}) ===\n`);
  for (const r of rows) {
    console.log(
      `[${r.id}] ${r.date} | ${r.amount.toLocaleString("vi-VN")} | ${r.category}/${r.mgmt ?? "-"}`,
    );
    console.log(`  desc: ${r.desc}`);
    console.log(`  payer=${r.payer ?? "-"} recipient=${r.recipient ?? "-"}\n`);
  }

  for (const m of ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]) {
    const monthRows = await db
      .select({
        id: financialTransactions.id,
        date: financialTransactions.transactionDate,
        desc: financialTransactions.description,
        amount: financialTransactions.amount,
        recipient: financialTransactions.recipient,
        category: financialTransactions.categoryCode,
      })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.transactionMonth, m),
          or(
            ilike(financialTransactions.recipient, "%bách%"),
            ilike(financialTransactions.recipient, "%nhật%"),
            ilike(financialTransactions.recipient, "%thành%"),
          ),
        ),
      );
    console.log(`\n=== ${m} — Bách/Nhật/Thành (${monthRows.length}) ===`);
    for (const r of monthRows) {
      console.log(
        `  [${r.id}] ${r.date} | ${r.amount.toLocaleString("vi-VN")} | ${r.category} | ${r.recipient}`,
      );
      console.log(`    ${r.desc}`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
