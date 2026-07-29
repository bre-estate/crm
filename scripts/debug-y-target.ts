import * as XLSX from "xlsx";
import { db } from "../lib/db";
import { products, projects, revenueReconciliations } from "../lib/schema";
import { eq, or } from "drizzle-orm";
import { sum } from "drizzle-orm";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  // Load Excel row for A-05-07 to see col F (target DT)
  const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx");
  const ws = wb.Sheets["3_BC DOANH THU - GIA VON"];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });

  const testUnits = ["A-05-07", "A-29-12", "A-07-09", "B.14.08", "A.10.10"];
  console.log(`${"Căn".padEnd(15)} | ${"Excel F (Total DT)".padStart(18)} | ${"App pmgBase × pmgRate".padStart(22)} | ${"App SUM(rec)".padStart(18)} | ${"Excel O".padStart(15)} | ${"Δ target".padStart(14)}`);
  console.log("─".repeat(140));

  for (const unit of testUnits) {
    // Find row in Excel
    let excelRow: any[] | null = null;
    for (const r of rows) {
      if (r && String(r[2] ?? "").trim() === unit) {
        excelRow = r;
        break;
      }
    }
    if (!excelRow) {
      console.log(`  ${unit}: not in Excel`);
      continue;
    }
    const excelF = Number(excelRow[5] ?? 0); // col F
    const excelO = Number(excelRow[14] ?? 0); // col O

    // Find in DB
    const [p] = await db
      .select({
        id: products.id,
        unitCode: products.unitCode,
        pmgBasePrice: products.pmgBasePrice,
        pmgRate: products.pmgRate,
        pmgSaleRate: products.pmgSaleRate,
      })
      .from(products)
      .where(eq(products.unitCode, unit));
    if (!p) {
      console.log(`  ${unit}: not in DB`);
      continue;
    }

    const [rev] = await db
      .select({ s: sum(revenueReconciliations.totalReceivableThisTime) })
      .from(revenueReconciliations)
      .where(eq(revenueReconciliations.productId, p.id));
    const totalReceivable = Number(rev?.s ?? 0);

    const appTarget = Number(p.pmgBasePrice ?? 0) * Number(p.pmgRate ?? 0);

    console.log(
      `${unit.padEnd(15)} | ${fmt(excelF).padStart(18)} | ${fmt(appTarget).padStart(22)} | ${fmt(totalReceivable).padStart(18)} | ${fmt(excelO).padStart(15)} | ${fmt(appTarget - excelF).padStart(14)}`,
    );
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
