import { db } from "../lib/db";
import { products, projects, revenueReconciliations, costReconciliations } from "../lib/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { computeLuyKe, type ProductConfig } from "../lib/costCalc";

const fmt = (n: number) => n.toLocaleString("vi-VN");

async function main() {
  const rows = await db
    .select({
      id: products.id,
      unitCode: products.unitCode,
      projectName: projects.name,
      pmgBasePrice: products.pmgBasePrice,
      pmgSaleRate: products.pmgSaleRate,
      pmgRate: products.pmgRate,
      adminFeeSale: products.adminFeeSale,
      customerSupport: products.customerSupport,
      saleCommissionRate: products.saleCommissionRate,
      cdtBonusSale: products.cdtBonusSale,
      kpiCeoRate: products.kpiCeoRate,
      kpiTpkdRate: products.kpiTpkdRate,
      kpiAdminRate: products.kpiAdminRate,
    })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .where(or(eq(products.unitCode, "A.05.09"), eq(products.unitCode, "A2-08-10")));

  for (const p of rows) {
    console.log(`\n═════════════════════════════════════════════════`);
    console.log(`  ${p.unitCode} — ${p.projectName} (id=${p.id})`);
    console.log(`═════════════════════════════════════════════════`);
    console.log(`  pmgBasePrice: ${fmt(Number(p.pmgBasePrice ?? 0))}`);
    console.log(`  pmgRate     : ${Number(p.pmgRate ?? 0)}`);
    console.log(`  pmgSaleRate : ${Number(p.pmgSaleRate ?? 0)}`);
    console.log(`  adminFeeSale: ${fmt(Number(p.adminFeeSale ?? 0))}`);
    console.log(`  customerSupport: ${fmt(Number(p.customerSupport ?? 0))}`);
    console.log(`  saleCommissionRate: ${Number(p.saleCommissionRate ?? 0)}`);

    // Revenue recons
    const revs = await db
      .select({
        id: revenueReconciliations.id,
        date: revenueReconciliations.reconciliationDate,
        pmgCumulativePct: revenueReconciliations.pmgCumulativePct,
        totalReceivableThisTime: revenueReconciliations.totalReceivableThisTime,
      })
      .from(revenueReconciliations)
      .where(eq(revenueReconciliations.productId, p.id));
    console.log(`\n  Revenue recons (${revs.length}):`);
    let maxN = 0;
    for (const r of revs) {
      const n = Number(r.pmgCumulativePct ?? 0);
      maxN = Math.max(maxN, n);
      console.log(`    [${r.id}] ${r.date} · N=${(n * 100).toFixed(2)}% · receivable=${fmt(Number(r.totalReceivableThisTime))}`);
    }
    console.log(`    maxN = ${(maxN * 100).toFixed(2)}%`);

    // Cost recons sale_commission
    const costs = await db
      .select({
        id: costReconciliations.id,
        date: costReconciliations.reconciliationDate,
        amount: costReconciliations.amountPayableThisTime,
        commissionRate: costReconciliations.commissionRate,
        pmgLkSaleRate: costReconciliations.pmgLkSaleRate,
        pmgCumulativePctSale: costReconciliations.pmgCumulativePctSale,
      })
      .from(costReconciliations)
      .where(and(
        eq(costReconciliations.productId, p.id),
        eq(costReconciliations.costType, "sale_commission"),
      ));
    let totalCost = 0;
    console.log(`\n  Cost recons sale_commission (${costs.length}):`);
    for (const c of costs) {
      const amt = Number(c.amount);
      totalCost += amt;
      console.log(`    [${c.id}] ${c.date} · ${fmt(amt).padStart(14)} · commRate=${Number(c.commissionRate ?? 0)} · pmgLkSale=${Number(c.pmgLkSaleRate ?? 0)} · pmgCumSale=${Number(c.pmgCumulativePctSale ?? 0)}`);
    }
    console.log(`    Total cost sale_commission: ${fmt(totalCost)}`);

    // Compute AA per app logic
    const cfg: ProductConfig = {
      pmgBasePrice: Number(p.pmgBasePrice ?? 0),
      pmgSaleRate: Number(p.pmgSaleRate ?? p.pmgRate ?? 0),
      adminFeeSale: Number(p.adminFeeSale ?? 0),
      customerSupport: Number(p.customerSupport ?? 0),
      saleCommissionRate: Number(p.saleCommissionRate ?? 0),
      kpiCeoRate: Number(p.kpiCeoRate ?? 0),
      kpiTpkdRate: Number(p.kpiTpkdRate ?? 0),
      kpiAdminRate: Number(p.kpiAdminRate ?? 0),
      bonusSale: 0,
      bonusManager: 0,
      cdtBonusSale: Number(p.cdtBonusSale ?? 0),
      cdtBonusManager: 0,
    };
    const targetAtN = computeLuyKe(cfg, "sale_commission", maxN);
    const targetFull = computeLuyKe(cfg, "sale_commission", 1);
    console.log(`\n  App AA compute:`);
    console.log(`    Target @ maxN(${(maxN*100).toFixed(2)}%): ${fmt(targetAtN)}`);
    console.log(`    Target @ FULL (100%)                : ${fmt(targetFull)}`);
    console.log(`    Đã ĐC (cost recons)                 : ${fmt(totalCost)}`);
    console.log(`    AA @ maxN  = target - đã ĐC = ${fmt(targetAtN - totalCost)}`);
    console.log(`    AA @ FULL  = target - đã ĐC = ${fmt(targetFull - totalCost)}`);
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
