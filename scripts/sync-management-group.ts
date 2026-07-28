/**
 * Sync managementGroup từ category_code cho tất cả row.
 * Sau migration 0018 + split, nhiều rows category đã đổi nhưng managementGroup
 * còn nhãn cũ → bảng CP HĐ bị fragment (cùng TK nhưng nhiều nhóm).
 */

import { db } from "../lib/db";
import { financialTransactions } from "../lib/schema";
import { eq, sql } from "drizzle-orm";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Chuẩn hóa managementGroup theo category_code
const CANONICAL_GROUP: Record<string, string> = {
  "6411": "1a. Lương NVKD",
  "6417": "1b. HH sale + Marketing + Thưởng doanh số",
  "6421": "1c. Lương admin + kế toán",
  "6423": "6a. Đồ dùng VP",
  "6425": "7. Thuế / Phí NN",
  "6427": "2. Thuê VP + tiện ích + dịch vụ",
  "811": "10a. Chi phí khác (không hóa đơn)",
  "242": "5a. TSCĐ phân bổ dần",
  "635": "8. Chi phí tài chính",
  "411": "11. Vốn góp / Kí quỹ",
  "3411": "13. Hoàn booking YCTV",
  "141": "15. Cấp tạm ứng nội bộ",
  "131": "14. Đặt cọc hộ khách",
  "3331-3334": "7b. Thuế pass-through (GTGT/TNDN/TNCN)",
  "244": "11. Vốn góp / Kí quỹ",
  "unclassified": "12. Chưa phân loại",
};

async function main() {
  let totalUpdated = 0;
  for (const [code, group] of Object.entries(CANONICAL_GROUP)) {
    const result = await db.execute(sql`
      UPDATE financial_transactions
         SET management_group = ${group}
       WHERE category_code = ${code}
         AND (management_group IS DISTINCT FROM ${group})
      RETURNING id
    `);
    const n = (result as any).length ?? 0;
    if (n > 0) {
      console.log(`  ${code.padEnd(15)} → "${group}" — updated ${n} rows`);
      totalUpdated += n;
    }
  }

  console.log(`\nTổng đã đổi: ${totalUpdated} rows.\n`);

  // Verify: list unique (category, managementGroup) pairs
  console.log(`═════════════════════════════════════════════════`);
  console.log(`  Sau sync — mỗi category chỉ có 1 managementGroup`);
  console.log(`═════════════════════════════════════════════════`);
  const pairs = await db
    .select({
      code: financialTransactions.categoryCode,
      group: financialTransactions.managementGroup,
      cnt: sql<number>`count(*)`.as("cnt"),
    })
    .from(financialTransactions)
    .groupBy(financialTransactions.categoryCode, financialTransactions.managementGroup)
    .orderBy(financialTransactions.categoryCode);
  for (const p of pairs) {
    console.log(`  ${p.code.padEnd(15)} · ${(p.group ?? "-").padEnd(50)} · ${p.cnt}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
