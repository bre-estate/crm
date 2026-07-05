/**
 * Update product fields từ file "BAO CAO DOANH THU - New.xlsx" sheet 2.1_TT DU AN.
 * Chỉ UPDATE các trường có config đúng theo Excel mới:
 *   - deptLeaderName (col J)
 *   - totalRevenue (P), totalCost (R)
 *   - customerName (F), salesPerson (H), depositDate (K)
 *   - pmgBasePrice (T), pmgRate (U), otherFeePct (V), otherRevenue (W), revenueReduction (X)
 *   - adminFee (Y), cdtBonusSale (AA), cdtBonusManager (AB)
 *   - pmgSaleRate (AC), saleCommissionRate (AD), adminFeeSale (AE)
 *   - customerSupport (AF), bonusSale (AG), bonusManager (AH)
 *   - kpiCeoRate (AI), kpiTpkdRate (AJ), kpiAdminRate (AK), otherCost (AL)
 *
 * KHÔNG xóa data, chỉ update. Match by product_code = "{project}_{partner}_{unitCode}".
 */
import * as XLSX from "xlsx";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const EXCEL_PATH = path.join(process.cwd(), "BAO CAO DOANH THU - New.xlsx");
if (!fs.existsSync(EXCEL_PATH)) {
  console.error("File not found:", EXCEL_PATH);
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true, cellNF: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.1_TT DU AN"], {
  header: 1,
  raw: true,
  defval: null,
}) as unknown[][];

const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const toStr = (v: unknown): string => (v == null ? "" : String(v).trim());
const toStrOrNull = (v: unknown): string | null => {
  const s = toStr(v);
  return s === "" ? null : s;
};
const toDateStr = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).trim() || null;
};

async function main() {
  // Match by (unitCode + projectName) vì productCode DB vs Excel khác format
  const products = await db
    .select({
      id: schema.products.id,
      unitCode: schema.products.unitCode,
      projectName: schema.projects.name,
    })
    .from(schema.products)
    .leftJoin(schema.projects, eq(schema.products.projectId, schema.projects.id));
  const byKey = new Map<string, number>();
  for (const p of products) {
    byKey.set(`${(p.projectName ?? "").trim()}|${p.unitCode.trim()}`, p.id);
  }
  console.log(`Loaded ${byKey.size} products in DB`);

  // Header row 5 (idx 4), data row 6+ (idx 5+)
  let updated = 0;
  let notFound = 0;
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const unitCode = toStr(r[2]); // C: Ma_can
    const projectName = toStr(r[3]); // D: Du an
    if (!unitCode || !projectName) continue;

    const key = `${projectName}|${unitCode}`;
    const productId = byKey.get(key);
    if (!productId) {
      notFound++;
      continue;
    }

    const depositDate = toDateStr(r[10]); // K
    const totalRevenue = toNum(r[15]); // P
    const totalCost = toNum(r[17]); // R
    const pmgBasePrice = toNum(r[19]); // T
    const pmgRate = toNum(r[20]); // U
    const otherFeePct = toNum(r[21]); // V
    const otherRevenue = toNum(r[22]); // W
    const revenueReduction = toNum(r[23]); // X
    const adminFee = toNum(r[24]); // Y
    const cdtBonusSale = toNum(r[26]); // AA
    const cdtBonusManager = toNum(r[27]); // AB
    const pmgSaleRate = toNum(r[28]); // AC
    const saleCommissionRate = toNum(r[29]); // AD
    const adminFeeSale = toNum(r[30]); // AE
    const customerSupport = toNum(r[31]); // AF
    const bonusSale = toNum(r[32]); // AG
    const bonusManager = toNum(r[33]); // AH
    const kpiCeoRate = toNum(r[34]); // AI
    const kpiTpkdRate = toNum(r[35]); // AJ
    const kpiAdminRate = toNum(r[36]); // AK
    const otherCost = toNum(r[37]); // AL

    await db
      .update(schema.products)
      .set({
        customerName: toStrOrNull(r[5]), // F
        salesPerson: toStrOrNull(r[7]), // H
        deptLeaderName: toStrOrNull(r[9]), // J
        depositDate,
        totalRevenue,
        totalCost,
        pmgBasePrice,
        pmgRate,
        otherFeePct,
        otherRevenue,
        revenueReduction,
        adminFee,
        cdtBonusSale,
        cdtBonusManager,
        pmgSaleRate,
        saleCommissionRate,
        adminFeeSale,
        customerSupport,
        bonusSale,
        bonusManager,
        kpiCeoRate,
        kpiTpkdRate,
        kpiAdminRate,
        otherCost,
      })
      .where(eq(schema.products.id, productId));
    updated++;
  }
  console.log(`Updated ${updated} products (${notFound} not found in DB)`);
  await client.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
