import * as XLSX from "xlsx";
import { db } from "../lib/db";
import { products, projects, revenueReconciliations, costReconciliations } from "../lib/schema";
import { eq } from "drizzle-orm";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx", { cellFormula: true });
  const ws3 = wb.Sheets["3_BC DOANH THU - GIA VON"];

  for (const unit of ["B.17-03", "B.31.20"]) {
    console.log(`\n═══ ${unit} ═══`);
    const rows = XLSX.utils.sheet_to_json<any[]>(ws3, { header: 1, defval: null });
    for (let i = 9; i < rows.length; i++) {
      const r = rows[i];
      if (!r || String(r[2] ?? "").trim() !== unit) continue;
      console.log(`  Excel sheet 3: F(totalDT)=${fmt(Number(r[5]))}, N=${r[13]}, O(đãĐC)=${fmt(Number(r[14]))}, R(giávốn)=${fmt(Number(r[17]))}, U(đã ĐC LK)=${fmt(Number(r[20]))}, AA=${fmt(Number(r[26]))}, AI=${fmt(Number(r[34]))}`);
    }

    // DB
    const [p] = await db
      .select({ id: products.id, pmgBase: products.pmgBasePrice, pmgSaleRate: products.pmgSaleRate, admin: products.adminFeeSale, cs: products.customerSupport, comm: products.saleCommissionRate, kpiCeo: products.kpiCeoRate, kpiTpkd: products.kpiTpkdRate, kpiAdm: products.kpiAdminRate, cdtSale: products.cdtBonusSale, cdtMgr: products.cdtBonusManager, bsSale: products.bonusSale, bsMgr: products.bonusManager, other: products.otherCosts })
      .from(products)
      .where(eq(products.unitCode, unit));
    console.log(`  DB config:`, JSON.stringify(p, null, 2).replace(/\n/g, " ").replace(/\s+/g, " "));

    const costs = await db.select().from(costReconciliations).where(eq(costReconciliations.productId, p.id));
    let sumCost = 0;
    for (const c of costs) sumCost += Number(c.amountPayableThisTime);
    console.log(`  DB cost recons sum: ${fmt(sumCost)}`);

    const revs = await db.select().from(revenueReconciliations).where(eq(revenueReconciliations.productId, p.id));
    const maxN = revs.reduce((mx, r) => Math.max(mx, Number(r.paymentProgressPct ?? 0)), 0);
    console.log(`  DB maxN: ${maxN}`);
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
