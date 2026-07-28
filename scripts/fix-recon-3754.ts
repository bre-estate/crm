import { db } from "../lib/db";
import { costReconciliations } from "../lib/schema";
import { eq } from "drizzle-orm";

async function main() {
  await db
    .update(costReconciliations)
    .set({
      commissionRate: 0,
      kpiRate: 0,
      paymentProgressPct: 0,
      pmgLkSaleRate: 0,
      pmgCumulativePctSale: 0,
    })
    .where(eq(costReconciliations.id, 3754));
  console.log("✅ Reset % fields của recon 3754 về 0 (thưởng nóng flat)");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
