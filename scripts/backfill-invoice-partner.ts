import { db } from "../lib/db";
import { invoices, revenueReconciliations, products, projects } from "../lib/schema";
import { eq, isNull, sql } from "drizzle-orm";

async function main() {
  const nullInvs = await db
    .select({ id: invoices.id, number: invoices.invoiceNumber, date: invoices.invoiceDate })
    .from(invoices)
    .where(isNull(invoices.partnerId));

  console.log(`Found ${nullInvs.length} invoices with NULL partner_id`);

  for (const inv of nullInvs) {
    // Infer partner_id từ recons → product → project → partner_id
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

    const nonNull = recPartners.filter((p) => p.partnerId !== null);
    if (nonNull.length === 0) {
      console.log(`  [${inv.id}] ${inv.number} · ${inv.date} → SKIP: không suy được partner`);
      continue;
    }
    if (nonNull.length > 1) {
      console.log(
        `  [${inv.id}] ${inv.number} · ${inv.date} → CONFLICT: ${nonNull.map((p) => `pid=${p.partnerId}(×${p.c})`).join(", ")} — skip, cần fix tay`,
      );
      continue;
    }
    const partnerId = nonNull[0].partnerId!;
    await db.update(invoices).set({ partnerId }).where(eq(invoices.id, inv.id));
    console.log(`  [${inv.id}] ${inv.number} · ${inv.date} → set partner_id=${partnerId}`);
  }

  // Verify
  const remaining = await db
    .select({ c: sql<number>`count(*)` })
    .from(invoices)
    .where(isNull(invoices.partnerId));
  console.log(`\nRemaining NULL: ${remaining[0]?.c ?? 0}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
