import { db } from "../lib/db";
import { financialTransactions, accountingCategories } from "../lib/schema";
import { sql, like, eq } from "drizzle-orm";

const fmt = (n: number) => n.toLocaleString("vi-VN");

async function main() {
  // App 2025 by (category_code, month view)
  const rows = await db
    .select({
      code: financialTransactions.categoryCode,
      totalCash: sql<string>`COALESCE(SUM(CASE WHEN transaction_month LIKE '2025-%' THEN amount ELSE 0 END), 0)`.as("total_cash"),
      totalAccrual: sql<string>`COALESCE(SUM(CASE WHEN accrual_month LIKE '2025-%' THEN amount ELSE 0 END), 0)`.as("total_accrual"),
    })
    .from(financialTransactions)
    .groupBy(financialTransactions.categoryCode);
  const cats = await db.select().from(accountingCategories);
  const catMap = new Map(cats.map((c) => [c.code, c]));

  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`  APP 2025 sau Phase C (v2 classifier)`);
  console.log(`═════════════════════════════════════════════════`);
  console.log(
    `${"Code".padEnd(12)} | ${"GroupBCTC".padEnd(10)} | ${"Cash 2025".padStart(15)} | ${"Accrual 2025".padStart(15)} | ${"Name"}`,
  );
  console.log("─".repeat(120));
  const byGroup = new Map<string, { cash: number; accrual: number }>();
  for (const r of rows.sort((a, b) => a.code.localeCompare(b.code))) {
    const cat = catMap.get(r.code);
    const group = cat?.groupBctc ?? "other";
    const cash = Number(r.totalCash);
    const accrual = Number(r.totalAccrual);
    console.log(
      `${r.code.padEnd(12)} | ${group.padEnd(10)} | ${fmt(cash).padStart(15)} | ${fmt(accrual).padStart(15)} | ${cat?.name ?? "?"}`,
    );
    const g = byGroup.get(group) ?? { cash: 0, accrual: 0 };
    g.cash += cash;
    g.accrual += accrual;
    byGroup.set(group, g);
  }
  console.log("─".repeat(120));

  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`  TỔNG THEO NHÓM BCTC`);
  console.log(`═════════════════════════════════════════════════`);

  // Kim baseline
  const kimBase: Record<string, number> = {
    "641": 3_287_651_464, // 6411 (198M) + 6417 (3.09B)
    "642": 666_773_862, // 6421 (378M) + 6423 (60M) + 6425 (2M) + 6427 (227M)
    "811": 105_234_171,
    "242": 0, // Kim để trong 242 nhưng phân bổ vào 6417 → không tính riêng
    "other": 0,
  };

  console.log(
    `${"Group".padEnd(8)} | ${"Kim BCTC 2025".padStart(15)} | ${"App Cash".padStart(15)} | ${"App Accrual".padStart(15)} | ${"Chênh Cash".padStart(13)} | ${"Chênh Accrual".padStart(13)}`,
  );
  let sumKim = 0;
  let sumCash = 0;
  let sumAccrual = 0;
  for (const [group, v] of [...byGroup.entries()].sort()) {
    const kim = kimBase[group] ?? 0;
    console.log(
      `${group.padEnd(8)} | ${fmt(kim).padStart(15)} | ${fmt(v.cash).padStart(15)} | ${fmt(v.accrual).padStart(15)} | ${fmt(v.cash - kim).padStart(13)} | ${fmt(v.accrual - kim).padStart(13)}`,
    );
    if (group !== "other") {
      sumKim += kim;
      sumCash += v.cash;
      sumAccrual += v.accrual;
    }
  }
  console.log(`\n${"TỔNG CP".padEnd(8)} | ${fmt(sumKim).padStart(15)} | ${fmt(sumCash).padStart(15)} | ${fmt(sumAccrual).padStart(15)} | ${fmt(sumCash - sumKim).padStart(13)} | ${fmt(sumAccrual - sumKim).padStart(13)}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
