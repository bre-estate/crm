import { db } from "../lib/db";
import { financialTransactions, revenueReconciliations } from "../lib/schema";
import { sql, like, or, and, gte, lte } from "drizzle-orm";

const fmt = (n: number) => n.toLocaleString("vi-VN");

async function main() {
  // ============ APP: TOTAL 2025 by category ============
  const app2025 = await db
    .select({
      code: financialTransactions.categoryCode,
      total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)`.as("total"),
      cnt: sql<number>`COUNT(*)`.as("cnt"),
    })
    .from(financialTransactions)
    .where(like(financialTransactions.transactionMonth, "2025-%"))
    .groupBy(financialTransactions.categoryCode);
  const appMap = new Map(app2025.map((r) => [r.code, Number(r.total)]));

  // ============ APP: TOTAL 2025 + Jan-Mar 2026 (cover accrual) ============
  const app2025q1 = await db
    .select({
      code: financialTransactions.categoryCode,
      total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)`.as("total"),
    })
    .from(financialTransactions)
    .where(
      or(
        like(financialTransactions.transactionMonth, "2025-%"),
        like(financialTransactions.transactionMonth, "2026-01"),
        like(financialTransactions.transactionMonth, "2026-02"),
        like(financialTransactions.transactionMonth, "2026-03"),
      ),
    )
    .groupBy(financialTransactions.categoryCode);
  const appMapQ1 = new Map(app2025q1.map((r) => [r.code, Number(r.total)]));

  // ============ Map app → Kim BCTC (chuẩn TT200) ============
  // App has TK 632 (giá vốn, không chuẩn cho DN dịch vụ). Kim gộp HH sale vào 6417.
  // Map:
  //   632 (App) + 6417 (App marketing) → 6417 (Kim)
  //   6421 (App gộp nhân sự) → 6411 + 6421 (Kim tách bán hàng vs quản lý — em chưa tách)
  //   6427-rent + 6427-svc + 6428 (App) → 6427 (Kim)
  //   153-211 (App) → 242 (Kim, trả trước phân bổ dần)
  //   6425 (App) → 6425 (Kim) ✓
  //   merged-Triết (chi Triết không hóa đơn) → 811 (Kim)

  console.log(`═════════════════════════════════════════════════`);
  console.log(`  APP vs KIM CDPS 2025 — TỔNG NĂM`);
  console.log(`═════════════════════════════════════════════════\n`);

  const rows: Array<{
    kim: string;
    kimAmount: number;
    appExpr: string;
    appAmount: number;
    appAmountQ1: number;
  }> = [
    {
      kim: "5113 DT dịch vụ",
      kimAmount: 4_255_793_715,
      appExpr: "revenue_reconciliations",
      appAmount: 0,
      appAmountQ1: 0,
    },
    {
      kim: "6411 Lương NVKD",
      kimAmount: 198_711_272,
      appExpr: "(gộp trong 6421 app)",
      appAmount: 0,
      appAmountQ1: 0,
    },
    {
      kim: "6417 HH+MKT+thưởng",
      kimAmount: 3_088_940_192,
      appExpr: "632 + 6417 (app)",
      appAmount: (appMap.get("632") ?? 0) + (appMap.get("6417") ?? 0),
      appAmountQ1: (appMapQ1.get("632") ?? 0) + (appMapQ1.get("6417") ?? 0),
    },
    {
      kim: "6421 Lương QL",
      kimAmount: 378_361_931,
      appExpr: "6421 app (gộp cả NVKD)",
      appAmount: appMap.get("6421") ?? 0,
      appAmountQ1: appMapQ1.get("6421") ?? 0,
    },
    {
      kim: "6423 Đồ dùng VP",
      kimAmount: 59_706_981,
      appExpr: "(app không có TK riêng)",
      appAmount: 0,
      appAmountQ1: 0,
    },
    {
      kim: "6425 Thuế môn bài",
      kimAmount: 2_000_000,
      appExpr: "6425 app",
      appAmount: appMap.get("6425") ?? 0,
      appAmountQ1: appMapQ1.get("6425") ?? 0,
    },
    {
      kim: "6427 Thuê VP + tiện ích",
      kimAmount: 226_704_950,
      appExpr: "6427-rent + 6427-svc + 6428 (app)",
      appAmount:
        (appMap.get("6427-rent") ?? 0) +
        (appMap.get("6427-svc") ?? 0) +
        (appMap.get("6428") ?? 0),
      appAmountQ1:
        (appMapQ1.get("6427-rent") ?? 0) +
        (appMapQ1.get("6427-svc") ?? 0) +
        (appMapQ1.get("6428") ?? 0),
    },
    {
      kim: "811 Chi phí khác (Triết)",
      kimAmount: 105_234_171,
      appExpr: "(app chưa có — merged-Triết + secondary?)",
      appAmount: appMap.get("secondary") ?? 0,
      appAmountQ1: appMapQ1.get("secondary") ?? 0,
    },
    {
      kim: "821 Thuế TNDN",
      kimAmount: 32_490_426,
      appExpr: "(không import — pass-through)",
      appAmount: 0,
      appAmountQ1: 0,
    },
    {
      kim: "242 Chi phí trả trước → phân bổ",
      kimAmount: 0, // ghi vào 6417 dần
      appExpr: "153-211 app (chi thẳng)",
      appAmount: appMap.get("153-211") ?? 0,
      appAmountQ1: appMapQ1.get("153-211") ?? 0,
    },
  ];

  console.log(
    `${"Kim TK".padEnd(30)} | ${"Kim 2025".padStart(15)} | ${"App expr".padEnd(35)} | ${"App 2025".padStart(15)} | ${"App 2025+Q1/26".padStart(15)} | ${"Chênh 2025".padStart(13)} | ${"Chênh sau Q1".padStart(13)}`,
  );
  console.log("─".repeat(160));
  let kimTotal = 0;
  let appTotal = 0;
  let appTotalQ1 = 0;
  for (const r of rows) {
    if (r.kim.startsWith("5113")) continue; // DT tách riêng
    if (r.kim.startsWith("821")) continue; // pass-through
    if (r.kim.startsWith("242")) continue; // khấu hao khác method
    const gap = r.appAmount - r.kimAmount;
    const gapQ1 = r.appAmountQ1 - r.kimAmount;
    console.log(
      `${r.kim.padEnd(30)} | ${fmt(r.kimAmount).padStart(15)} | ${r.appExpr.padEnd(35)} | ${fmt(r.appAmount).padStart(15)} | ${fmt(r.appAmountQ1).padStart(15)} | ${fmt(gap).padStart(13)} | ${fmt(gapQ1).padStart(13)}`,
    );
    kimTotal += r.kimAmount;
    appTotal += r.appAmount;
    appTotalQ1 += r.appAmountQ1;
  }
  console.log("─".repeat(160));
  console.log(
    `${"TỔNG CP HOẠT ĐỘNG".padEnd(30)} | ${fmt(kimTotal).padStart(15)} | ${"".padEnd(35)} | ${fmt(appTotal).padStart(15)} | ${fmt(appTotalQ1).padStart(15)} | ${fmt(appTotal - kimTotal).padStart(13)} | ${fmt(appTotalQ1 - kimTotal).padStart(13)}`,
  );

  // DT check
  const revData = await db
    .select({
      revThis: sql<string>`COALESCE(SUM(${revenueReconciliations.revenueThisTime}), 0)`.as("t"),
      cnt: sql<number>`COUNT(*)`.as("c"),
    })
    .from(revenueReconciliations)
    .where(
      and(
        gte(revenueReconciliations.reconciliationDate, "2025-01-01"),
        lte(revenueReconciliations.reconciliationDate, "2025-12-31"),
      ),
    );
  const appDt = Number(revData[0]?.revThis ?? 0);
  console.log(
    `\n${"DT (5113)".padEnd(30)} | ${fmt(4_255_793_715).padStart(15)} | ${"revenue_this_time (99 recon)".padEnd(35)} | ${fmt(appDt).padStart(15)} | ${"".padStart(15)} | ${fmt(appDt - 4_255_793_715).padStart(13)}`,
  );

  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`  DIỄN GIẢI GAP`);
  console.log(`═════════════════════════════════════════════════`);
  const kimTotalAll = kimTotal + 105_234_171; // + 811 (chi Triết)
  console.log(`  Kim BCTC tổng CP HĐ:                    ${fmt(kimTotalAll)}`);
  console.log(`  App theo 2025 (transaction_month):      ${fmt(appTotal)}`);
  console.log(`  App theo 2025 + Q1/2026:                ${fmt(appTotalQ1)}`);
  console.log(`  Gap ban đầu (chỉ 2025):                 ${fmt(appTotal - kimTotalAll)}`);
  console.log(`  Gap sau cover Q1/2026:                  ${fmt(appTotalQ1 - kimTotalAll)}`);
  console.log(
    `  → Gap thu hẹp:                          ${fmt(appTotalQ1 - appTotal)} (T1-T3/2026 chi thực)`,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
