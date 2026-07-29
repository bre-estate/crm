import * as XLSX from "xlsx";
import { db } from "../lib/db";
import { products, projects, revenueReconciliations, costReconciliations } from "../lib/schema";
import { eq } from "drizzle-orm";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  // Excel
  const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx");
  const ws = wb.Sheets["2.2_Doanh thu"];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });
  console.log("=== Excel sheet 2.2 rows cho A2-06-17 ===");
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const unit = String(r[7] ?? "").trim();
    if (unit !== "A2-06-17") continue;
    console.log(`  Row ${i}: date=${r[1]}, đơn=${r[7]}, doitac=${r[9]}, revThis=${r[19]}, total=${r[26]}, cdtSale=${r[24]}, cdtMgr=${r[25]}`);
  }

  // Excel sheet 3 col F
  const ws3 = wb.Sheets["3_BC DOANH THU - GIA VON"];
  const r3 = XLSX.utils.sheet_to_json<any[]>(ws3, { header: 1, blankrows: false, defval: null });
  console.log("\n=== Excel sheet 3 row cho A2-06-17 ===");
  for (let i = 9; i < r3.length; i++) {
    const r = r3[i];
    if (!r) continue;
    if (String(r[2] ?? "").trim() !== "A2-06-17") continue;
    console.log(`  Row ${i}: totalDT(F)=${r[5]}, Y=${r[24]}, AA=${r[26]}, AB=${r[27]}`);
  }

  // DB
  const [p] = await db
    .select({ id: products.id, code: products.unitCode, proj: projects.name, totalRev: products.totalRevenue, cdtSale: products.cdtBonusSale })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .where(eq(products.unitCode, "A2-06-17"));
  console.log("\n=== DB product ===");
  console.log(`  ${p.code} · ${p.proj} · totalRev=${fmt(Number(p.totalRev))} · cdtSale=${fmt(Number(p.cdtSale))}`);

  const revs = await db.select().from(revenueReconciliations).where(eq(revenueReconciliations.productId, p.id));
  console.log(`\n=== DB revenue recons (${revs.length}) ===`);
  for (const r of revs) {
    console.log(`  [${r.id}] ${r.reconciliationDate} · total=${fmt(Number(r.totalReceivableThisTime))} · rev=${fmt(Number(r.revenueThisTime))} · cdtSale=${fmt(Number(r.cdtBonusSale))} · cdtMgr=${fmt(Number(r.cdtBonusManager))}`);
  }

  const costs = await db.select().from(costReconciliations).where(eq(costReconciliations.productId, p.id));
  console.log(`\n=== DB cost recons (${costs.length}) ===`);
  for (const c of costs) {
    console.log(`  [${c.id}] ${c.reconciliationDate} · ${c.costType.padEnd(20)} · ${fmt(Number(c.amountPayableThisTime)).padStart(14)} · ${c.employeeName}`);
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
