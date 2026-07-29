import { db } from "../lib/db";
import { costReconciliations, paymentsOut } from "../lib/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [rec] = await db
    .select()
    .from(costReconciliations)
    .where(eq(costReconciliations.id, 4681));
  if (!rec) {
    console.log("Recon 4681 not found (already deleted?)");
    process.exit(0);
  }
  console.log(`Deleting recon 4681: ${rec.reconciliationDate} · ${rec.costType} · ${rec.amountPayableThisTime} · ${rec.employeeName}`);
  const pays = await db.delete(paymentsOut).where(eq(paymentsOut.costReconciliationId, 4681)).returning();
  console.log(`  Deleted ${pays.length} linked payments`);
  await db.delete(costReconciliations).where(eq(costReconciliations.id, 4681));
  console.log("  ✅ Deleted");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
