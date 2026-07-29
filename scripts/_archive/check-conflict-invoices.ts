import { db } from "../lib/db";
import { invoices, revenueReconciliations, products, projects, partners } from "../lib/schema";
import { eq } from "drizzle-orm";

async function main() {
  for (const id of [546, 553]) {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
    console.log(`\n═══ Invoice ${id} — số ${inv?.invoiceNumber} · ngày ${inv?.invoiceDate} ═══`);
    const recs = await db
      .select({
        reconId: revenueReconciliations.id,
        productId: revenueReconciliations.productId,
        unitCode: products.unitCode,
        projectName: projects.name,
        partnerName: partners.name,
        reconDate: revenueReconciliations.reconciliationDate,
        receivable: revenueReconciliations.totalReceivableThisTime,
      })
      .from(revenueReconciliations)
      .leftJoin(products, eq(products.id, revenueReconciliations.productId))
      .leftJoin(projects, eq(projects.id, products.projectId))
      .leftJoin(partners, eq(partners.id, projects.partnerId))
      .where(eq(revenueReconciliations.invoiceId, id));
    console.log(`  Recons (${recs.length}):`);
    for (const r of recs) {
      console.log(`    Recon ${r.reconId} · căn=${r.unitCode} · dự án=${r.projectName} · CĐT=${r.partnerName} · ${r.reconDate} · ${Number(r.receivable).toLocaleString("vi-VN")}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
