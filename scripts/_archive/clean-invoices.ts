/**
 * Clean invoices:
 * 1. Backfill partner_id cho invoices có recons link nhưng partner_id null.
 * 2. Xoá empty invoices (không link recon nào).
 */
import { db } from "../lib/db";
import { invoices, revenueReconciliations, products, projects } from "../lib/schema";
import { eq, sql, isNull, and } from "drizzle-orm";

async function main() {
  // Step 1: Backfill partner_id
  const nullInvs = await db
    .select({ id: invoices.id, number: invoices.invoiceNumber, date: invoices.invoiceDate })
    .from(invoices)
    .where(isNull(invoices.partnerId));
  console.log(`Invoices with NULL partner_id: ${nullInvs.length}`);
  let backfilled = 0;
  for (const inv of nullInvs) {
    const recPartners = await db
      .select({ partnerId: projects.partnerId, c: sql<number>`count(*)`.as("c") })
      .from(revenueReconciliations)
      .leftJoin(products, eq(products.id, revenueReconciliations.productId))
      .leftJoin(projects, eq(projects.id, products.projectId))
      .where(eq(revenueReconciliations.invoiceId, inv.id))
      .groupBy(projects.partnerId);
    const nonNull = recPartners.filter((p) => p.partnerId !== null);
    if (nonNull.length === 1) {
      await db.update(invoices).set({ partnerId: nonNull[0].partnerId! }).where(eq(invoices.id, inv.id));
      console.log(`  [${inv.id}] số=${inv.number} → partner=${nonNull[0].partnerId}`);
      backfilled++;
    } else if (nonNull.length > 1) {
      console.log(`  [${inv.id}] số=${inv.number} → CONFLICT ${nonNull.length} partners, skip`);
    }
  }
  console.log(`Backfilled: ${backfilled}`);

  // Step 2: Delete empty invoices
  const emptyRows = await db.execute(sql`
    SELECT i.id
      FROM invoices i
     WHERE NOT EXISTS (SELECT 1 FROM revenue_reconciliations r WHERE r.invoice_id = i.id)
  `);
  const emptyIds = (emptyRows as any as any[]).map((r) => r.id);
  console.log(`\nEmpty invoices to delete: ${emptyIds.length}`);
  if (emptyIds.length > 0) {
    for (const id of emptyIds) {
      await db.delete(invoices).where(eq(invoices.id, id));
    }
    console.log(`  Deleted ${emptyIds.length} empty invoices`);
  }

  // Verify
  const [total] = (await db.execute(sql`SELECT COUNT(*)::text AS c FROM invoices`)) as any as any[];
  console.log(`\nTotal invoices after clean: ${total.c}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
