import { db } from "../lib/db";
import { invoices, revenueReconciliations, products, partners } from "../lib/schema";
import { eq, sql, ilike } from "drizzle-orm";

async function main() {
  // Detail of invoice 24
  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.invoiceNumber,
      date: invoices.invoiceDate,
      partnerId: invoices.partnerId,
      partnerName: partners.name,
      totalVat: invoices.totalAmountVat,
    })
    .from(invoices)
    .leftJoin(partners, eq(partners.id, invoices.partnerId))
    .where(eq(invoices.invoiceNumber, "24"));
  console.log(`\n=== Invoice "24" ===`);
  for (const r of rows) {
    const recs = await db
      .select({ id: revenueReconciliations.id, productId: revenueReconciliations.productId })
      .from(revenueReconciliations)
      .where(eq(revenueReconciliations.invoiceId, r.id));
    console.log(`  [${r.id}] date=${r.date} partner=${r.partnerName} (pid=${r.partnerId}) totalVat=${(r.totalVat ?? 0).toLocaleString("vi-VN")} · linked_recs=${recs.length}`);
  }

  // Check Dataloca partners
  console.log(`\n=== Partners with "dataloca" ===`);
  const dl = await db.select().from(partners).where(ilike(partners.name, "%dataloca%"));
  for (const p of dl) {
    const invCount = await db
      .select({ c: sql<number>`count(*)` })
      .from(invoices)
      .where(eq(invoices.partnerId, p.id));
    console.log(`  [${p.id}] "${p.name}" · role=${(p as any).role ?? "-"} · invoices=${invCount[0]?.c ?? 0}`);
  }

  // Check bcons, t&a as reference
  console.log(`\n=== Sample: "T&A" ===`);
  const ta = await db.select().from(partners).where(ilike(partners.name, "%T&A%"));
  for (const p of ta) console.log(`  [${p.id}] "${p.name}"`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
