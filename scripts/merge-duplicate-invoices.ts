/**
 * Merge duplicate invoices (same number + partner_id).
 * Với mỗi cặp: giữ invoice có id nhỏ nhất, move recons từ id lớn hơn sang, delete id lớn.
 * Sau đó recompute totalAmountVat.
 */
import { db } from "../lib/db";
import { invoices, revenueReconciliations } from "../lib/schema";
import { sql, eq } from "drizzle-orm";

async function main() {
  const dupResult = await db.execute(sql`
    SELECT invoice_number, partner_id, ARRAY_AGG(id ORDER BY id) AS ids
      FROM invoices
     WHERE partner_id IS NOT NULL
     GROUP BY invoice_number, partner_id
    HAVING COUNT(*) > 1
  `);
  const rows = dupResult as any as Array<{ invoice_number: string; partner_id: number; ids: number[] }>;
  console.log(`Duplicate groups: ${rows.length}`);
  for (const g of rows) {
    const [keepId, ...deleteIds] = g.ids;
    console.log(`\n  Số ${g.invoice_number} · partner ${g.partner_id}`);
    console.log(`    keep=${keepId} · delete=${deleteIds.join(",")}`);
    for (const delId of deleteIds) {
      // Move recons
      const [{ n: moved }] = (await db.execute(sql`
        UPDATE revenue_reconciliations
           SET invoice_id = ${keepId}
         WHERE invoice_id = ${delId}
        RETURNING id
      `)) as any as { n: number }[] || [{ n: 0 }];
      const recCount = await db
        .select({ c: sql<number>`count(*)` })
        .from(revenueReconciliations)
        .where(eq(revenueReconciliations.invoiceId, keepId));
      console.log(`    Moved recons to keep ${keepId} (now has ${recCount[0]?.c ?? 0} recons)`);
      await db.delete(invoices).where(eq(invoices.id, delId));
      console.log(`    Deleted invoice ${delId}`);
    }
    // Recompute totalAmountVat
    const [{ s }] = await db
      .select({ s: sql<string>`COALESCE(SUM(total_receivable_this_time), 0)` })
      .from(revenueReconciliations)
      .where(eq(revenueReconciliations.invoiceId, keepId));
    await db.update(invoices).set({ totalAmountVat: Number(s) }).where(eq(invoices.id, keepId));
    console.log(`    Recomputed totalAmountVat = ${Number(s).toLocaleString("vi-VN")}`);
  }

  // Verify
  const dupsAfter = await db.execute(sql`
    SELECT COUNT(*)::text AS c FROM (
      SELECT 1 FROM invoices WHERE partner_id IS NOT NULL
       GROUP BY invoice_number, partner_id
      HAVING COUNT(*) > 1
    ) x
  `);
  console.log(`\nDuplicate groups remaining: ${((dupsAfter as any)[0] as any).c}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
