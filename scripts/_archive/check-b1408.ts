import { db } from "../lib/db";
import { products, projects, costReconciliations, revenueReconciliations } from "../lib/schema";
import { eq, and } from "drizzle-orm";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const [p] = await db
    .select({ id: products.id, unitCode: products.unitCode, projectName: projects.name, cdtBonusSale: products.cdtBonusSale })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .where(eq(products.unitCode, "B.14.08"));
  if (!p) {
    console.log("B.14.08 not found");
    process.exit(1);
  }
  console.log(`\nCăn ${p.unitCode} · ${p.projectName} (id=${p.id})`);
  console.log(`config.cdtBonusSale = ${fmt(Number(p.cdtBonusSale ?? 0))}\n`);

  const costs = await db
    .select()
    .from(costReconciliations)
    .where(eq(costReconciliations.productId, p.id));
  console.log(`Cost recons (${costs.length}):`);
  for (const c of costs) {
    console.log(
      `  [${c.id}] ${c.reconciliationDate} · ${c.costType.padEnd(20)} · ${fmt(Number(c.amountPayableThisTime)).padStart(14)} · ${c.employeeName}`,
    );
  }

  const revs = await db
    .select({
      id: revenueReconciliations.id,
      date: revenueReconciliations.reconciliationDate,
      cdtBonusSale: revenueReconciliations.cdtBonusSale,
      cdtBonusManager: revenueReconciliations.cdtBonusManager,
      total: revenueReconciliations.totalReceivableThisTime,
    })
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.productId, p.id));
  console.log(`\nRevenue recons (${revs.length}):`);
  for (const r of revs) {
    console.log(
      `  [${r.id}] ${r.date} · total=${fmt(Number(r.total)).padStart(14)} · cdtSale=${fmt(Number(r.cdtBonusSale ?? 0)).padStart(12)} · cdtMgr=${fmt(Number(r.cdtBonusManager ?? 0)).padStart(12)}`,
    );
  }

  // Compute totals
  const cdtSaleReceived = revs.reduce((s, r) => s + Number(r.cdtBonusSale ?? 0), 0);
  const cdtSaleDone = costs
    .filter((c) => c.costType === "cdt_bonus_sale")
    .reduce((s, c) => s + Number(c.amountPayableThisTime), 0);
  const salesCommDone = costs
    .filter((c) => c.costType === "sale_commission")
    .reduce((s, c) => s + Number(c.amountPayableThisTime), 0);
  console.log(`\nSummary:`);
  console.log(`  Revenue CĐT bonus sale received: ${fmt(cdtSaleReceived)} / 1.1 = ${fmt(cdtSaleReceived / 1.1)}`);
  console.log(`  Cost cdt_bonus_sale done       : ${fmt(cdtSaleDone)}`);
  console.log(`  Cost sale_commission done      : ${fmt(salesCommDone)}`);
  console.log(`  AB (Excel formula) = ${fmt(cdtSaleReceived / 1.1)} - ${fmt(cdtSaleDone)} = ${fmt(cdtSaleReceived / 1.1 - cdtSaleDone)}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
