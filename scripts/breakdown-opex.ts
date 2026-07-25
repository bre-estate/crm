import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const rows = await c<any[]>`
    SELECT transaction_month AS month, management_group AS grp, SUM(amount)::bigint AS sum, COUNT(*)::int AS n
    FROM financial_transactions
    WHERE category_code IN ('6421','6427-rent','6427-svc','6417','153-211','6428','6425','635')
      AND transaction_month >= '2025-08'
    GROUP BY transaction_month, management_group
    ORDER BY transaction_month DESC, sum DESC
  `;
  console.log("12 tháng gần nhất — breakdown nhóm CP QL:\n");
  let curMonth = "";
  let mTotal = 0;
  for (const r of rows) {
    if (r.month !== curMonth) {
      if (curMonth) console.log(`  ─── TỔNG ${curMonth}: ${mTotal.toLocaleString("vi-VN")} VND ───\n`);
      curMonth = r.month;
      mTotal = 0;
    }
    console.log(
      `  ${r.month}  ${(r.grp ?? "?").padEnd(32)}  ${Number(r.sum).toLocaleString("vi-VN").padStart(15)} (${r.n})`,
    );
    mTotal += Number(r.sum);
  }
  if (curMonth) console.log(`  ─── TỔNG ${curMonth}: ${mTotal.toLocaleString("vi-VN")} VND ───`);

  // Grand total 12 tháng
  const [total] = await c<any[]>`
    SELECT SUM(amount)::bigint AS sum FROM financial_transactions
    WHERE category_code IN ('6421','6427-rent','6427-svc','6417','153-211','6428','6425','635')
      AND transaction_month >= '2025-08'
  `;
  console.log(
    `\nTổng 12 tháng: ${Number(total.sum).toLocaleString("vi-VN")} VND — TB/tháng: ${Math.round(Number(total.sum) / 12).toLocaleString("vi-VN")}`,
  );

  // Nếu bỏ nhóm 5 (thiết bị) + nhóm 7 (thuế)
  const [pure] = await c<any[]>`
    SELECT SUM(amount)::bigint AS sum FROM financial_transactions
    WHERE category_code IN ('6421','6427-rent','6427-svc','6417','6428','635')
      AND transaction_month >= '2025-08'
  `;
  console.log(
    `Nếu loại Thiết bị + Thuế: ${Number(pure.sum).toLocaleString("vi-VN")} VND — TB/tháng: ${Math.round(Number(pure.sum) / 12).toLocaleString("vi-VN")}`,
  );

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
