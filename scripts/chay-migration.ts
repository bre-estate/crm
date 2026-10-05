/**
 * Nạp một hoặc nhiều file SQL trong drizzle/ lên database.
 *
 * Postgres chạy trọn một file trong một giao dịch, nên sai ở giữa là quay lui
 * hết file đó, không để lại trạng thái nửa vời. Nhiều file thì chạy lần lượt,
 * file nào xong là xong, nên truyền đúng thứ tự.
 *
 *   npx tsx --env-file=.env.local scripts/chay-migration.ts drizzle/00xx_ten.sql
 *   npx tsx --env-file=.env.local scripts/chay-migration.ts drizzle/00xx_a.sql drizzle/00yy_b.sql
 *
 * Mọi môi trường nối thẳng Supabase, nên lệnh này ĐỤNG DỮ LIỆU THẬT.
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";

async function main() {
  const ds = process.argv.slice(2);
  if (ds.length === 0) {
    console.error("Thiếu đường dẫn file SQL. Ví dụ:");
    console.error("  npx tsx --env-file=.env.local scripts/chay-migration.ts drizzle/0062_va_rls_6_bang_ho.sql");
    process.exit(1);
  }

  for (const duongDan of ds) {
    let noiDung: string;
    try {
      noiDung = readFileSync(duongDan, "utf8");
    } catch {
      console.error(`✗ Không đọc được ${duongDan}. Kiểm tra lại đường dẫn.`);
      process.exit(1);
    }
    try {
      await db.execute(sql.raw(noiDung));
      console.log(`✓ Đã chạy ${duongDan}`);
    } catch (e) {
      console.error(`✗ Lỗi ở ${duongDan}, file này đã quay lui, không đổi gì:`);
      console.error("  " + (e instanceof Error ? e.message : String(e)));
      process.exit(1);
    }
  }
  console.log(`\nXong ${ds.length} file.`);
}

main().then(() => process.exit(0));
