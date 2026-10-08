/**
 * Auto-classify accounting_journal (NKC) — dùng cho P&L dồn tích khớp Kim BC.
 * Áp classifyNkc() cho mỗi row → gán bucket.
 *
 * Usage: cd BRE/App/CRM && npx tsx scripts/classify-accounting-journal.ts [--force]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { classifyNkc, CATEGORIES } from "../lib/transaction-classifier";
import fs from "fs";

const FORCE = process.argv.includes("--force");
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const { runWithImportLog } = await import("../lib/import-log");
  await runWithImportLog({
    scriptName: "classify-accounting-journal",
    targetTable: "accounting_journal",
  }, async (log) => {
  // Chạy migration trước (idempotent)
  const mig = fs.readFileSync("drizzle/0032_nkc_category.sql", "utf-8");
  await sql.unsafe(mig);

  const rows = await sql<Array<{ id: number; debit_account: string; credit_account: string; description: string; amount: number }>>`
    SELECT id, debit_account, credit_account, description, amount
    FROM accounting_journal
    ${FORCE ? sql`` : sql`WHERE category IS NULL OR category_source IS NULL OR category_source != 'manual'`}`;

  console.log(`Classifying ${rows.length} NKC rows...`);
  const buckets = new Map<string, { count: number; total: number }>();
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    for (const r of chunk) {
      const result = classifyNkc({
        debitAccount: r.debit_account,
        creditAccount: r.credit_account,
        description: r.description,
        amount: Number(r.amount),
      });
      await sql`
        UPDATE accounting_journal
        SET category = ${result.category},
            category_source = 'auto',
            category_confidence = ${result.confidence}
        WHERE id = ${r.id}`;
      const b = buckets.get(result.category) ?? { count: 0, total: 0 };
      b.count++;
      b.total += Number(r.amount);
      buckets.set(result.category, b);
    }
  }

  console.log(`\n═══ Breakdown per bucket (accrual, filtered 2025 sẽ query riêng) ═══`);
  const sorted = Array.from(buckets.entries()).sort((a, b) => b[1].total - a[1].total);
  for (const [key, v] of sorted) {
    const meta = CATEGORIES[key as keyof typeof CATEGORIES];
    console.log(`${key.padEnd(20)} ${String(v.count).padStart(4)} rows  ${fmt(v.total).padStart(18)}  ${meta?.label ?? ""}`);
  }

  // Bỏ bảng "So Kim BC 2025" từng in ở đây.
  //
  // Nó cộng các nhóm của sổ nhật ký chung rồi đem so với báo cáo lợi nhuận
  // đầy đủ của Kim, nên luôn hiện thiếu và gắn dấu ✗ oan. Báo cáo lãi lỗ thật
  // không lấy giá vốn từ sổ này: mục 2.x lấy từ cost_reconciliations cộng
  // year_end_accruals, chỉ mục 4.x mới lấy từ đây. Chạy thử 2025 thì mục 2.x
  // khớp Kim tới từng đồng, trong khi bảng cũ báo lệch 595 triệu ở hoa hồng.
  //
  // Muốn đối chiếu với Kim thì xem trang Lãi lỗ quản trị, nơi so đúng nguồn.
  console.log(
    `\nĐể đối chiếu với báo cáo của kế toán, xem trang Lãi lỗ quản trị.` +
      `\nBảng nhóm ở trên chỉ phản ánh cách phân loại sổ nhật ký chung.`,
  );

    log.updated = rows.length;
    log.details = { force: FORCE, buckets: Object.fromEntries([...buckets].map(([k, v]) => [k, v])) };
    await sql.end();
  });
}
main().catch(e => { console.error(e); process.exit(1); });
