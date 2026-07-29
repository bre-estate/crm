/**
 * Sync products.totalRevenue từ Excel sheet 3 col F (TỔNG DT gồm VAT).
 * Không đụng recon, chỉ update field trên products.
 */
import * as XLSX from "xlsx";
import { db } from "../lib/db";
import { products, projects } from "../lib/schema";
import { eq, and } from "drizzle-orm";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx");
  const ws = wb.Sheets["3_BC DOANH THU - GIA VON"];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  for (let i = 9; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const stt = r[0];
    if (typeof stt !== "number" || stt <= 0) continue;
    const unitCode = String(r[2] ?? "").trim();
    const projectName = String(r[3] ?? "").trim();
    const totalRev = Number(r[5] ?? 0); // col F
    if (!unitCode || !projectName || !totalRev) continue;

    const rowsFound = await db
      .select({ id: products.id, currentRev: products.totalRevenue })
      .from(products)
      .leftJoin(projects, eq(products.projectId, projects.id))
      .where(and(eq(products.unitCode, unitCode), eq(projects.name, projectName)));
    if (rowsFound.length === 0) {
      skipped++;
      continue;
    }
    const p = rowsFound[0];
    const cur = Number(p.currentRev ?? 0);
    if (Math.abs(cur - totalRev) < 100) {
      unchanged++;
      continue;
    }
    await db
      .update(products)
      .set({ totalRevenue: totalRev })
      .where(eq(products.id, p.id));
    console.log(`  ${unitCode.padEnd(15)} · ${projectName.substring(0, 30).padEnd(30)} · ${fmt(cur).padStart(14)} → ${fmt(totalRev).padStart(14)}`);
    updated++;
  }
  console.log(`\nUpdated: ${updated}, unchanged: ${unchanged}, skipped: ${skipped}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
