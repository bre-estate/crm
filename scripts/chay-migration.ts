/**
 * Chạy một file migration trong thư mục drizzle/ lên database đang cấu hình.
 *
 *   npx tsx --env-file=.env.local scripts/chay-migration.ts drizzle/0056_bo_duoi_da_nghi.sql
 *
 * Postgres chạy cả tệp trong một giao dịch, nên sai ở giữa là quay lui hết,
 * không để lại trạng thái nửa vời.
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";

async function main() {
  const duongDan = process.argv[2];
  if (!duongDan) {
    console.error("Thiếu đường dẫn file migration.");
    process.exit(1);
  }
  await db.execute(sql.raw(readFileSync(duongDan, "utf8")));
  console.log(`Đã chạy ${duongDan}`);
}

main().then(() => process.exit(0));
