import * as XLSX from "xlsx";
import { db } from "../lib/db";
import { products, projects, revenueReconciliations, costReconciliations } from "../lib/schema";
import { eq } from "drizzle-orm";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx", { cellFormula: true });
  const ws23 = wb.Sheets["2.3_Gia von"];
  const ws3 = wb.Sheets["3_BC DOANH THU - GIA VON"];
  const r23 = XLSX.utils.sheet_to_json<any[]>(ws23, { header: 1, blankrows: false, defval: null });
  const r3 = XLSX.utils.sheet_to_json<any[]>(ws3, { header: 1, blankrows: false, defval: null });

  const units = ["B.14.08", "B.31.20", "B.17-03", "B.26.20"];
  for (const unit of units) {
    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║ ${unit}`);
    console.log(`╚══════════════════════════════════════════════════════╝`);

    // Excel sheet 3 giá trị R (giá vốn tương ứng) và U (đã ĐC lũy kế)
    for (let i = 9; i < r3.length; i++) {
      const r = r3[i];
      if (!r) continue;
      if (String(r[2] ?? "").trim() !== unit) continue;
      console.log(`  Excel sheet 3: R(giávốn tương ứng)=${fmt(Number(r[17] ?? 0))}, U(đã ĐC LK)=${fmt(Number(r[20] ?? 0))}, AA=${fmt(Number(r[26] ?? 0))}, AI=${fmt(Number(r[34] ?? 0))}`);
    }

    // Excel sheet 2.3 các dòng cost recon (col E = Ma_can)
    const excelCosts: any[] = [];
    for (let i = 4; i < r23.length; i++) {
      const r = r23[i];
      if (!r) continue;
      if (String(r[4] ?? "").trim() !== unit) continue;
      excelCosts.push({
        row: i,
        date: r[1],
        emp: r[2],
        pmgPayable: r[21],
        csVal: r[23],
        cdtBonusSale: r[24],
        cdtBonusMgr: r[25],
        bonusSale: r[26],
        bonusMgr: r[27],
        kpiCeoRate: r[28],
        kpiCeoAmt: r[31],
        kpiTpkdRate: r[32],
        kpiTpkdAmt: r[35],
        kpiAdminRate: r[36],
        kpiAdminAmt: r[37],
        total: r[38],
      });
    }
    console.log(`\n  Excel sheet 2.3 cost recons (${excelCosts.length}):`);
    for (const c of excelCosts) {
      console.log(`    Row ${c.row}: emp=${c.emp} · pmg=${fmt(Number(c.pmgPayable ?? 0))} · cs=${fmt(Number(c.csVal ?? 0))} · cdtSale=${fmt(Number(c.cdtBonusSale ?? 0))} · cdtMgr=${fmt(Number(c.cdtBonusMgr ?? 0))} · bsSale=${fmt(Number(c.bonusSale ?? 0))} · bsMgr=${fmt(Number(c.bonusMgr ?? 0))} · kpiCEO=${fmt(Number(c.kpiCeoAmt ?? 0))} · kpiTPKD=${fmt(Number(c.kpiTpkdAmt ?? 0))} · kpiAdm=${fmt(Number(c.kpiAdminAmt ?? 0))} · total=${fmt(Number(c.total ?? 0))}`);
    }

    // DB
    const [p] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.unitCode, unit));
    if (!p) {
      console.log("  DB: not found");
      continue;
    }
    const costs = await db
      .select()
      .from(costReconciliations)
      .where(eq(costReconciliations.productId, p.id));
    console.log(`\n  DB cost recons (${costs.length}):`);
    for (const c of costs) {
      console.log(`    [${c.id}] ${c.reconciliationDate} · ${c.costType.padEnd(20)} · ${fmt(Number(c.amountPayableThisTime)).padStart(14)} · ${c.employeeName}`);
    }
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
