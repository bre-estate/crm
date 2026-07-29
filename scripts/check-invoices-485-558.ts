import { db } from "../lib/db";
import { invoices, revenueReconciliations, partners } from "../lib/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  for (const id of [485, 558]) {
    const [inv] = await db
      .select({
        id: invoices.id,
        number: invoices.invoiceNumber,
        date: invoices.invoiceDate,
        totalVat: invoices.totalAmountVat,
        partnerId: invoices.partnerId,
        partnerName: partners.name,
      })
      .from(invoices)
      .leftJoin(partners, eq(partners.id, invoices.partnerId))
      .where(eq(invoices.id, id));
    console.log(`\nInvoice ${id}:`, inv);
    const recs = await db
      .select({ id: revenueReconciliations.id, productId: revenueReconciliations.productId, reconDate: revenueReconciliations.reconciliationDate })
      .from(revenueReconciliations)
      .where(eq(revenueReconciliations.invoiceId, id));
    console.log(`  Linked recons: ${recs.length}`);
    for (const r of recs) console.log(`    recon ${r.id} · căn=${r.productId} · ${r.reconDate}`);
  }

  // Empty invoices (no recons)
  const empty = await db.execute(sql`
    SELECT i.id, i.invoice_number, i.invoice_date, i.partner_id, p.name AS partner_name
      FROM invoices i
      LEFT JOIN partners p ON p.id = i.partner_id
     WHERE NOT EXISTS (SELECT 1 FROM revenue_reconciliations r WHERE r.invoice_id = i.id)
     ORDER BY i.id
  `);
  const rows = empty as any as any[];
  console.log(`\n=== Empty invoices (no recons): ${rows.length} ===`);
  for (const r of rows) {
    console.log(`  [${r.id}] số=${r.invoice_number} · ngày=${r.invoice_date} · CĐT=${r.partner_name}`);
  }

  // Duplicates: same partner + same number
  const dups = await db.execute(sql`
    SELECT invoice_number, partner_id, COUNT(*)::text AS c, ARRAY_AGG(id ORDER BY id)::text AS ids
      FROM invoices
     WHERE partner_id IS NOT NULL
     GROUP BY invoice_number, partner_id
    HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC
  `);
  const dupRows = dups as any as any[];
  console.log(`\n=== Duplicate (số + CĐT): ${dupRows.length} ===`);
  for (const r of dupRows) {
    console.log(`  số=${r.invoice_number} · partner=${r.partner_id} · ids=${r.ids}`);
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
