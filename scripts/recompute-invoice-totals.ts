/**
 * One-off: recompute invoices.total_amount_vat = sum(totalReceivableThisTime)
 * của mọi recon liên kết. Chạy sau khi đổi rule: giá trị HĐ auto-compute
 * thay vì user nhập.
 *
 * Usage:
 *   npx tsx scripts/recompute-invoice-totals.ts            # dry-run
 *   npx tsx scripts/recompute-invoice-totals.ts --apply    # thực sự update
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const rows = await c<
    { id: number; invoice_number: string; old_total: number; new_total: number }[]
  >`
    SELECT
      i.id,
      i.invoice_number,
      COALESCE(i.total_amount_vat, 0) AS old_total,
      COALESCE(SUM(r.total_receivable_this_time), 0) AS new_total
    FROM invoices i
    LEFT JOIN revenue_reconciliations r ON r.invoice_id = i.id
    GROUP BY i.id
    ORDER BY i.id
  `;

  let changed = 0;
  for (const r of rows) {
    const oldT = Number(r.old_total);
    const newT = Number(r.new_total);
    if (Math.round(oldT) === Math.round(newT)) continue;
    changed++;
    console.log(
      `HĐ #${r.id} ${r.invoice_number}: ${oldT.toLocaleString("vi-VN")} → ${newT.toLocaleString("vi-VN")}`,
    );
    if (APPLY) {
      await c`UPDATE invoices SET total_amount_vat = ${newT} WHERE id = ${r.id}`;
    }
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY-RUN"}: ${changed}/${rows.length} invoices ${APPLY ? "updated" : "would change"}`,
  );
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
