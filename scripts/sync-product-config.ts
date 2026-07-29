/**
 * Sync tất cả config products từ Excel sheet 2.1_TT DU AN.
 * Nguồn: Kim/HR cập nhật giá + phí trong sheet này.
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

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  const updates: string[] = [];
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const stt = r[0];
    if (typeof stt !== "number" || stt <= 0) continue;
    const unitCode = String(r[2] ?? "").trim();
    const projectName = String(r[3] ?? "").trim();
    if (!unitCode || !projectName) continue;

    const rowsFound = await db
      .select({ id: products.id, pmgBasePrice: products.pmgBasePrice, cdtBonusSale: products.cdtBonusSale, saleCommissionRate: products.saleCommissionRate })
      .from(products)
      .leftJoin(projects, eq(products.projectId, projects.id))
      .where(and(eq(products.unitCode, unitCode), eq(projects.name, projectName)));
    if (rowsFound.length === 0) {
      skipped++;
      continue;
    }
    const p = rowsFound[0];

    // Excel sheet 2.1 mapping:
    // T (index 19) = Gia tinh PMG (pmgBasePrice)
    // U (20) = %PMG_LK
    // Y (24) = Phi admin (dùng cho revenue side)
    // AA (26) = CĐT thuong sale (cdtBonusSale)
    // AB (27) = CĐT thuong QL (cdtBonusManager)
    // AC (28) = %PMG_LK_Sale (pmgSaleRate)
    // AD (29) = %HH sale (saleCommissionRate)
    // AE (30) = Phi admin_sale (adminFeeSale)
    // AF (31) = Cty ho tro khach (customerSupport)
    // AG (32) = CTY thuong NVKD (bonusSale)
    // AH (33) = CTY thuong quan ly (bonusManager)
    // AI (34) = %KPI CEO
    // AJ (35) = %KPI TPKD
    // AK (36) = %thuong admin (kpiAdminRate)
    // AL (37) = CP gia von khac (otherCosts)

    const newConfig = {
      pmgBasePrice: Number(r[19] ?? 0),
      pmgRate: Number(r[20] ?? 0),
      cdtBonusSale: Number(r[26] ?? 0),
      cdtBonusManager: Number(r[27] ?? 0),
      pmgSaleRate: Number(r[28] ?? 0),
      saleCommissionRate: Number(r[29] ?? 0),
      adminFeeSale: Number(r[30] ?? 0),
      customerSupport: Number(r[31] ?? 0),
      bonusSale: Number(r[32] ?? 0),
      bonusManager: Number(r[33] ?? 0),
      kpiCeoRate: Number(r[34] ?? 0),
      kpiTpkdRate: Number(r[35] ?? 0),
      kpiAdminRate: Number(r[36] ?? 0),
      otherCosts: Number(r[37] ?? 0),
    };

    // Detect changes
    const changed =
      Math.abs(Number(p.pmgBasePrice ?? 0) - newConfig.pmgBasePrice) > 100 ||
      Math.abs(Number(p.cdtBonusSale ?? 0) - newConfig.cdtBonusSale) > 100 ||
      Math.abs(Number(p.saleCommissionRate ?? 0) - newConfig.saleCommissionRate) > 0.0001;

    if (!changed) {
      unchanged++;
      continue;
    }
    await db.update(products).set(newConfig).where(eq(products.id, p.id));
    updates.push(`  ${unitCode.padEnd(15)} · ${projectName.substring(0, 25).padEnd(25)} · pmgBase: ${fmt(Number(p.pmgBasePrice ?? 0))} → ${fmt(newConfig.pmgBasePrice)}`);
    updated++;
  }
  console.log(`Updated ${updated} products:`);
  for (const u of updates.slice(0, 30)) console.log(u);
  if (updates.length > 30) console.log(`  ... and ${updates.length - 30} more`);
  console.log(`\nUpdated: ${updated}, unchanged: ${unchanged}, skipped: ${skipped}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
