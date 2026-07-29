import { db } from "../lib/db";
import { products } from "../lib/schema";
import { eq } from "drizzle-orm";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const testUnits = ["A-05-07", "A-29-12", "A-07-09", "B.14.08", "A.10.10"];
  for (const unit of testUnits) {
    const [p] = await db.select().from(products).where(eq(products.unitCode, unit));
    if (!p) continue;
    console.log(`\n${unit}:`);
    console.log(`  totalRevenue      : ${fmt(Number(p.totalRevenue ?? 0))}`);
    console.log(`  sellPrice         : ${fmt(Number(p.sellPrice ?? 0))}`);
    console.log(`  pmgBasePrice      : ${fmt(Number(p.pmgBasePrice ?? 0))}`);
    console.log(`  pmgRate           : ${Number(p.pmgRate ?? 0)}`);
    console.log(`  cdtBonusSale      : ${fmt(Number(p.cdtBonusSale ?? 0))}`);
    console.log(`  cdtBonusManager   : ${fmt(Number(p.cdtBonusManager ?? 0))}`);
    console.log(`  adminFee          : ${fmt(Number(p.adminFee ?? 0))}`);
    console.log(`  pmgBase × pmgRate : ${fmt(Number(p.pmgBasePrice ?? 0) * Number(p.pmgRate ?? 0))}`);
    console.log(`  + cdt bonuses     : ${fmt(Number(p.pmgBasePrice ?? 0) * Number(p.pmgRate ?? 0) + Number(p.cdtBonusSale ?? 0) + Number(p.cdtBonusManager ?? 0))}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
