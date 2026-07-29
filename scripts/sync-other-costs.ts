/**
 * Sync products.other_costs từ Excel sheet 2.1 col AL "CP giá vốn khác".
 */
import * as XLSX from "xlsx";
import { db } from "../lib/db";
import { products, projects } from "../lib/schema";
import { eq, and } from "drizzle-orm";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx");
  const ws = wb.Sheets["2.1_TT DU AN"];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });

  // Sheet 2.1 header row 4 (0-indexed = 3). Data từ row 4 (0-indexed = 4).
  // Col H = Ma_can, Col I = Du an, Col AL = CP giá vốn khác (index 37).
  let updated = 0;
  let skipped = 0;
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const stt = r[0];
    if (typeof stt !== "number" || stt <= 0) continue;
    const unitCode = String(r[2] ?? "").trim(); // col C = Ma_can
    const projectName = String(r[3] ?? "").trim(); // col D = Du an
    const otherCosts = Number(r[37] ?? 0); // col AL
    if (!unitCode || !projectName) continue;

    const rowsFound = await db
      .select({ id: products.id })
      .from(products)
      .leftJoin(projects, eq(products.projectId, projects.id))
      .where(and(eq(products.unitCode, unitCode), eq(projects.name, projectName)));
    if (rowsFound.length === 0) {
      skipped++;
      continue;
    }
    await db
      .update(products)
      .set({ otherCosts: otherCosts })
      .where(eq(products.id, rowsFound[0].id));
    if (otherCosts !== 0) {
      console.log(`  ${unitCode.padEnd(15)} · ${projectName.substring(0, 30).padEnd(30)} · ${fmt(otherCosts).padStart(14)}`);
    }
    updated++;
  }
  console.log(`\nUpdated: ${updated}, skipped: ${skipped}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
