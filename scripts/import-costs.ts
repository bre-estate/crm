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

const EXCEL_PATH = path.join(process.cwd(), "data-excel", "BAO CAO DOANH THU.xlsx");
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

const normalizeUnit = (s: string): string => s.trim().replace(/[.\-\s]/g, "");

async function main() {
  // Build unit_code -> product_id map (normalized)
  const products = await db
    .select({ id: schema.products.id, unitCode: schema.products.unitCode })
    .from(schema.products);
  const productByUnitCode = new Map<string, number>();
  for (const p of products) {
    productByUnitCode.set(normalizeUnit(p.unitCode), p.id);
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
    const productId = productByUnitCode.get(normalizeUnit(unitCode));
    if (!productId) {
      skipped++;
      continue;
    }

    // Columns
    const pmgPayable = toNum(row[21]); // V = PMG phải trả (HH sale phần chính)
    const csVal = toNum(row[23]); // X = customer support
    const cdtBonusSaleVal = toNum(row[24]); // Y = CĐT thưởng sale (NVKD)
    const cdtBonusMgrVal = toNum(row[25]); // Z = CĐT thưởng QL
    const bsVal = toNum(row[26]); // AA = CTY thưởng sale
    const bmVal = toNum(row[27]); // AB = CTY thưởng quản lý
    const kpiCeoRate = toNum(row[28]); // AC
    const kpiTpkdRate = toNum(row[32]); // AG
    const kpiAdminPct = toNum(row[36]); // AK
    const totalAmount = toNum(row[38]); // AM = Tổng phải trả
    const payDate = toDateStr(row[39]);
    const payAmount = toNum(row[40]);

    // Detect the primary cost_type for the row. Priority: specific → generic.
    // 1 dòng có thể chứa 2 loại chi phí gộp (vd HH sale + CĐT thưởng sale = 63.6M).
    // Split thành 2 dòng cost_recon riêng để phân biệt được.
    const rowsToInsert: Array<{
      costType:
        | "sale_commission"
        | "customer_support"
        | "bonus_sale"
        | "bonus_manager"
        | "cdt_bonus_sale"
        | "cdt_bonus_manager"
        | "kpi_ceo"
        | "kpi_tpkd"
        | "kpi_admin";
      amount: number;
      kpiRate: number;
      kpiAmount: number;
    }> = [];

    if (csVal > 0) {
      rowsToInsert.push({ costType: "customer_support", amount: totalAmount, kpiRate: 0, kpiAmount: 0 });
    } else if (kpiCeoRate > 0) {
      rowsToInsert.push({
        costType: "kpi_ceo",
        amount: totalAmount,
        kpiRate: kpiCeoRate,
        kpiAmount: toNum(row[31]),
      });
    } else if (kpiTpkdRate > 0) {
      rowsToInsert.push({
        costType: "kpi_tpkd",
        amount: totalAmount,
        kpiRate: kpiTpkdRate,
        kpiAmount: toNum(row[35]),
      });
    } else if (kpiAdminPct > 0) {
      rowsToInsert.push({
        costType: "kpi_admin",
        amount: totalAmount,
        kpiRate: kpiAdminPct,
        kpiAmount: toNum(row[37]),
      });
    } else {
      // Bonus / HH sale group
      // Split nếu có cả PMG phải trả (HH sale) + CĐT/CTY thưởng
      if (pmgPayable > 0) {
        rowsToInsert.push({
          costType: "sale_commission",
          amount: pmgPayable,
          kpiRate: 0,
          kpiAmount: 0,
        });
      }
      if (cdtBonusSaleVal > 0) {
        rowsToInsert.push({
          costType: "cdt_bonus_sale",
          amount: cdtBonusSaleVal,
          kpiRate: 0,
          kpiAmount: 0,
        });
      }
      if (cdtBonusMgrVal > 0) {
        rowsToInsert.push({
          costType: "cdt_bonus_manager",
          amount: cdtBonusMgrVal,
          kpiRate: 0,
          kpiAmount: 0,
        });
      }
      if (bsVal > 0) {
        rowsToInsert.push({
          costType: "bonus_sale",
          amount: bsVal,
          kpiRate: 0,
          kpiAmount: 0,
        });
      }
      if (bmVal > 0) {
        rowsToInsert.push({
          costType: "bonus_manager",
          amount: bmVal,
          kpiRate: 0,
          kpiAmount: 0,
        });
      }
      // Fallback: nếu không detect được nhưng có tổng phải trả → gán sale_commission
      if (rowsToInsert.length === 0 && totalAmount !== 0) {
        rowsToInsert.push({
          costType: "sale_commission",
          amount: totalAmount,
          kpiRate: 0,
          kpiAmount: 0,
        });
      }
    }

    for (const [idx, ins] of rowsToInsert.entries()) {
      const [rec] = await db
        .insert(schema.costReconciliations)
        .values({
          productId,
          reconciliationDate: toDateStr(row[1]),
          employeeName,
          costType: ins.costType,
          pmgBasePriceSale: toNum(row[11]),
          pmgLkSaleRate: toNum(row[12]),
          pmgProgressAmount: toNum(row[13]),
          pmgCumulativePctSale: toNum(row[14]),
          commissionRate: toNum(row[15]),
          adminFeeSale: toNum(row[16]),
          customerSupport: ins.costType === "customer_support" ? csVal : 0,
          fiscalYear: toNum(row[18]) || null,
          pmgReconciledCumulative: toNum(row[19]),
          pmgThisTime: toNum(row[20]),
          pmgPayable: ins.costType === "sale_commission" ? pmgPayable : 0,
          pmgRemaining: toNum(row[22]),
          kpiRate: ins.kpiRate,
          kpiAmount: ins.kpiAmount,
          amountPayableThisTime: ins.amount,
        })
        .returning({ id: schema.costReconciliations.id });
      costRecCount++;

      // Payment out chỉ attach vào dòng đầu (Excel gốc 1 dòng = 1 payment)
      if (idx === 0 && (payDate || payAmount > 0)) {
        await db.insert(schema.paymentsOut).values({
          costReconciliationId: rec.id,
          paymentDate: payDate,
          amount: payAmount,
        });
        paymentOutCount++;
      }
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
