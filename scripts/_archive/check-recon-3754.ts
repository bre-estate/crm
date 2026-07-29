import { db } from "../lib/db";
import { costReconciliations, paymentsOut, activityLogs } from "../lib/schema";
import { eq, desc, and } from "drizzle-orm";

const fmt = (n: number) => n.toLocaleString("vi-VN");

async function main() {
  const [rec] = await db
    .select()
    .from(costReconciliations)
    .where(eq(costReconciliations.id, 3754));
  console.log("Recon 3754:");
  console.log(JSON.stringify(rec, null, 2));

  const pays = await db
    .select()
    .from(paymentsOut)
    .where(eq(paymentsOut.costReconciliationId, 3754));
  console.log(`\nPayments (${pays.length}):`);
  for (const p of pays) {
    console.log(`  [${p.id}] ${p.paymentDate} · ${fmt(Number(p.amount))} · ${p.note ?? ""}`);
  }

  const logs = await db
    .select()
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.entityType, "cost_reconciliation"),
        eq(activityLogs.entityId, 3754),
      ),
    )
    .orderBy(desc(activityLogs.createdAt));
  console.log(`\nActivity logs (${logs.length}):`);
  for (const l of logs) {
    console.log(`  [${l.id}] ${l.createdAt.toISOString()} · action=${l.action} · user=${l.actorEmail} · ${l.summary}`);
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
