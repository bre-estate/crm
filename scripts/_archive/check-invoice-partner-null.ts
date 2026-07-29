import { db } from "../lib/db";
import { invoices, revenueReconciliations, products, projects } from "../lib/schema";
import { eq, sql, isNull } from "drizzle-orm";

async function main() {
  // Count invoices with null partner_id
  const nullCount = await db
    .select({ c: sql<number>`count(*)` })
    .from(invoices)
    .where(isNull(invoices.partnerId));
  console.log(`Invoices with NULL partner_id: ${nullCount[0]?.c ?? 0}`);

  // Check for duplicates on (number, date, partner_id)
  const dups = await db
    .select({
      number: invoices.invoiceNumber,
      date: invoices.invoiceDate,
      partnerId: invoices.partnerId,
      c: sql<number>`count(*)`.as("c"),
    })
    .from(invoices)
    .groupBy(invoices.invoiceNumber, invoices.invoiceDate, invoices.partnerId)
    .having(sql`count(*) > 1`);
  console.log(`\nDuplicate (number,date,partner_id): ${dups.length}`);
  for (const d of dups) console.log(`  ${d.number} · ${d.date} · pid=${d.partnerId} → ${d.c}`);

  // For null-partner invoices, try to infer partner from linked recons
  const nullInvs = await db
    .select({ id: invoices.id, number: invoices.invoiceNumber, date: invoices.invoiceDate })
    .from(invoices)
    .where(isNull(invoices.partnerId));

  console.log(`\nNull-partner invoices detail:`);
  for (const inv of nullInvs) {
    const recPartners = await db
      .select({
        partnerId: projects.partnerId,
        c: sql<number>`count(*)`.as("c"),
      })
      .from(revenueReconciliations)
      .leftJoin(products, eq(products.id, revenueReconciliations.productId))
      .leftJoin(projects, eq(projects.id, products.projectId))
      .where(eq(revenueReconciliations.invoiceId, inv.id))
      .groupBy(projects.partnerId);
    const partners = recPartners.map((p) => `pid=${p.partnerId}(×${p.c})`).join(", ");
    console.log(`  [${inv.id}] ${inv.number} · ${inv.date} · recs→${partners || "(no rec)"}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
