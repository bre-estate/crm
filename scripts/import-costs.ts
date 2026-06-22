/**
 * Import sheet 2.3_Gia von từ file Excel cũ (BAO CAO DOANH THU.xlsx)
 * Mỗi dòng = 1 cá nhân × 1 căn × 1 lần đối chiếu giá vốn
 * Cộng dồn cost_reconciliations + payments_out cho căn nào đã có trong DB.
 *
 * Map mã căn (excel) -> product trong DB qua unit_code.
 * Excel 2.3 dùng Ma_can (col E, idx 4) — không có format mã SP đầy đủ.
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

const EXCEL_PATH = path.join(process.cwd(), "BAO CAO DOANH THU.xlsx");
if (!fs.existsSync(EXCEL_PATH)) {
  console.error("Old Excel file not found:", EXCEL_PATH);
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true, cellNF: false });
function sheet(name: string): unknown[][] {
  const ws = wb.Sheets[name];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const toStr = (v: unknown): string => (v == null ? "" : String(v).trim());
const toDateStr = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? "20" + m[3] : m[3];
    // Excel cũ dùng MM/DD/YYYY (theo hướng dẫn sheet)
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return s || null;
};

async function main() {
  // Build unit_code -> product_id map
  const products = await db
    .select({ id: schema.products.id, unitCode: schema.products.unitCode })
    .from(schema.products);
  const productByUnitCode = new Map<string, number>();
  for (const p of products) {
    productByUnitCode.set(p.unitCode.trim(), p.id);
  }
  console.log(`Loaded ${productByUnitCode.size} products`);

  // Clear existing cost recons + payments_out
  console.log("Clearing existing cost reconciliations...");
  await db.delete(schema.paymentsOut);
  await db.delete(schema.costReconciliations);

  console.log("\n=== Reading sheet 2.3_Gia von ===");
  const rows = sheet("2.3_Gia von");
  // header row 4 (idx 3), data row 5+ (idx 4+)
  let costRecCount = 0;
  let paymentOutCount = 0;
  let skipped = 0;

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const employeeName = toStr(row[2]); // col C
    const unitCode = toStr(row[4]); // col E
    if (!employeeName || !unitCode) {
      skipped++;
      continue;
    }
    const productId = productByUnitCode.get(unitCode);
    if (!productId) {
      skipped++;
      continue;
    }

    // Determine cost type by which columns are filled
    const csVal = toNum(row[23]); // X = customer support
    const bsVal = toNum(row[26]); // AA = CTY thưởng sale
    const bmVal = toNum(row[27]); // AB = CTY thưởng quản lý
    const kpiCeoRate = toNum(row[28]); // AC
    const kpiTpkdRate = toNum(row[32]); // AG
    const kpiAdminPct = toNum(row[36]); // AK

    let costType:
      | "sale_commission"
      | "customer_support"
      | "bonus_sale"
      | "bonus_manager"
      | "kpi_ceo"
      | "kpi_tpkd"
      | "kpi_admin" = "sale_commission";
    if (csVal > 0) costType = "customer_support";
    else if (kpiCeoRate > 0) costType = "kpi_ceo";
    else if (kpiTpkdRate > 0) costType = "kpi_tpkd";
    else if (kpiAdminPct > 0) costType = "kpi_admin";
    else if (bsVal > 0) costType = "bonus_sale";
    else if (bmVal > 0) costType = "bonus_manager";

    const kpiAmount =
      costType === "kpi_ceo"
        ? toNum(row[31]) // AF
        : costType === "kpi_tpkd"
          ? toNum(row[35]) // AJ
          : costType === "kpi_admin"
            ? toNum(row[37]) // AL
            : 0;
    const kpiRate =
      costType === "kpi_ceo"
        ? kpiCeoRate
        : costType === "kpi_tpkd"
          ? kpiTpkdRate
          : costType === "kpi_admin"
            ? kpiAdminPct
            : 0;

    const [rec] = await db
      .insert(schema.costReconciliations)
      .values({
        productId,
        reconciliationDate: toDateStr(row[1]),
        employeeName,
        costType,
        pmgBasePriceSale: toNum(row[11]), // L
        pmgLkSaleRate: toNum(row[12]), // M
        pmgProgressAmount: toNum(row[13]), // N
        pmgCumulativePctSale: toNum(row[14]), // O
        commissionRate: toNum(row[15]), // P
        adminFeeSale: toNum(row[16]), // Q
        customerSupport: csVal,
        fiscalYear: toNum(row[18]) || null, // S
        pmgReconciledCumulative: toNum(row[19]), // T
        pmgThisTime: toNum(row[20]), // U
        pmgPayable: toNum(row[21]), // V
        pmgRemaining: toNum(row[22]), // W
        kpiRate,
        kpiAmount,
        amountPayableThisTime: toNum(row[38]), // AM
      })
      .returning({ id: schema.costReconciliations.id });
    costRecCount++;

    // Payment out if cột AN (39) ngày TT hoặc AO (40) số tiền có data
    const payDate = toDateStr(row[39]);
    const payAmount = toNum(row[40]);
    if (payDate || payAmount > 0) {
      await db.insert(schema.paymentsOut).values({
        costReconciliationId: rec.id,
        paymentDate: payDate,
        amount: payAmount,
      });
      paymentOutCount++;
    }
  }

  console.log(`\nInserted ${costRecCount} cost reconciliations`);
  console.log(`Inserted ${paymentOutCount} payments_out`);
  console.log(`Skipped ${skipped} rows (empty or unit not found)`);
}

main()
  .then(async () => {
    await client.end();
    console.log("Done.");
  })
  .catch(async (err) => {
    console.error("Failed:", err);
    await client.end();
    process.exit(1);
  });
