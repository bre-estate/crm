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
import { eq, inArray } from "drizzle-orm";
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

// Parse Excel cell → JS Number. Preserves decimal (không round ở đây).
const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
};

// Parse Excel + round về integer. Dùng cho amount fields (VND không có phần lẻ).
// Chốt 2026-08-08: Excel cells có underlying decimal (do công thức /1.1),
// display round. Import từng amount cần Math.round để DB match Excel display.
const toAmount = (v: unknown): number => Math.round(toNum(v));
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
  const { runWithImportLog } = await import("../lib/import-log");
  await runWithImportLog({
    scriptName: "import-costs",
    sourceFile: "BAO CAO DOANH THU.xlsx",
    targetTable: "cost_reconciliations",
  }, async (log) => {
  // Build unit_code -> product_id map (normalized)
  const products = await db
    .select({ id: schema.products.id, unitCode: schema.products.unitCode })
    .from(schema.products);
  const productByUnitCode = new Map<string, number>();
  for (const p of products) {
    productByUnitCode.set(normalizeUnit(p.unitCode), p.id);
  }
  console.log(`Loaded ${productByUnitCode.size} products`);

  console.log("\n=== Reading sheet 2.3_Gia von ===");
  const rows = sheet("2.3_Gia von");

  // Collect productIds that will be re-imported → chỉ delete phạm vi đó.
  // Tránh nuke manual recons cho products không có trong Excel.
  const affectedProductIds = new Set<number>();
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const unitCode = toStr(row[4]);
    if (!unitCode) continue;
    const pid = productByUnitCode.get(normalizeUnit(unitCode));
    if (pid) affectedProductIds.add(pid);
  }
  console.log(`Clearing cost reconciliations cho ${affectedProductIds.size} products...`);
  if (affectedProductIds.size > 0) {
    const pidArr = [...affectedProductIds];
    // xóa payments_out trước (FK ref cost_reconciliations)
    const recIds = await db
      .select({ id: schema.costReconciliations.id })
      .from(schema.costReconciliations)
      .where(inArray(schema.costReconciliations.productId, pidArr));
    if (recIds.length > 0) {
      await db.delete(schema.paymentsOut).where(
        inArray(schema.paymentsOut.costReconciliationId, recIds.map((r) => r.id)),
      );
    }
    await db
      .delete(schema.costReconciliations)
      .where(inArray(schema.costReconciliations.productId, pidArr));
  }

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

    // Columns — amounts dùng toAmount (round integer, match Excel display)
    const pmgPayable = toAmount(row[21]); // V = PMG phải trả (HH sale phần chính)
    const csVal = toAmount(row[23]); // X = customer support
    const cdtBonusSaleVal = toAmount(row[24]); // Y = CĐT thưởng sale (NVKD)
    const cdtBonusMgrVal = toAmount(row[25]); // Z = CĐT thưởng QL
    const bsVal = toAmount(row[26]); // AA = CTY thưởng sale
    const bmVal = toAmount(row[27]); // AB = CTY thưởng quản lý
    const kpiCeoRate = toNum(row[28]); // AC (rate — không round)
    const kpiTpkdRate = toNum(row[32]); // AG (rate — không round)
    const kpiAdminPct = toNum(row[36]); // AK (rate — không round)
    const totalAmount = toAmount(row[38]); // AM = Tổng phải trả
    const payDate = toDateStr(row[39]);
    const payAmount = toAmount(row[40]);

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

    // Excel 1 dòng cost recon = TỔNG chi cho 1 người/đợt, có thể gồm nhiều
    // component. Amount total (AM) = SUM(V + X:AB + AF + AJ + AL).
    // Cần SPLIT thành 1 recon per component, mỗi recon amount = phần đó.
    const kpiCeoAmt = toAmount(row[31]); // AF = KPI CEO còn thanh toán đợt này
    const kpiTpkdAmt = toAmount(row[35]); // AJ = KPI TPKD còn đợt này
    const kpiAdminAmt = toAmount(row[37]); // AL = KPI Admin

    // Fix 2026-07-29: !== 0 thay > 0 để handle số âm (điều chỉnh giảm).
    if (pmgPayable !== 0) {
      rowsToInsert.push({ costType: "sale_commission", amount: pmgPayable, kpiRate: 0, kpiAmount: 0 });
    }
    if (csVal !== 0) {
      rowsToInsert.push({ costType: "customer_support", amount: csVal, kpiRate: 0, kpiAmount: 0 });
    }
    if (cdtBonusSaleVal !== 0) {
      rowsToInsert.push({ costType: "cdt_bonus_sale", amount: cdtBonusSaleVal, kpiRate: 0, kpiAmount: 0 });
    }
    if (cdtBonusMgrVal !== 0) {
      rowsToInsert.push({ costType: "cdt_bonus_manager", amount: cdtBonusMgrVal, kpiRate: 0, kpiAmount: 0 });
    }
    if (bsVal !== 0) {
      rowsToInsert.push({ costType: "bonus_sale", amount: bsVal, kpiRate: 0, kpiAmount: 0 });
    }
    if (bmVal !== 0) {
      rowsToInsert.push({ costType: "bonus_manager", amount: bmVal, kpiRate: 0, kpiAmount: 0 });
    }
    if (kpiCeoAmt !== 0) {
      rowsToInsert.push({ costType: "kpi_ceo", amount: kpiCeoAmt, kpiRate: kpiCeoRate, kpiAmount: kpiCeoAmt });
    }
    if (kpiTpkdAmt !== 0) {
      rowsToInsert.push({ costType: "kpi_tpkd", amount: kpiTpkdAmt, kpiRate: kpiTpkdRate, kpiAmount: kpiTpkdAmt });
    }
    if (kpiAdminAmt !== 0) {
      rowsToInsert.push({ costType: "kpi_admin", amount: kpiAdminAmt, kpiRate: kpiAdminPct, kpiAmount: kpiAdminAmt });
    }
    // Ưu tiên Kim's adjustment: nếu chỉ 1 component và AM ≠ AL → dùng AM.
    // VD row 245 (B.31.20): AL=253,401, AM=231,559 (Kim adjust tay -21,842).
    if (rowsToInsert.length === 1 && Math.abs(totalAmount - rowsToInsert[0].amount) > 1) {
      rowsToInsert[0].amount = totalAmount;
    }
    // Fallback: nếu không detect được component nào nhưng có totalAmount → sale_commission
    if (rowsToInsert.length === 0 && totalAmount !== 0) {
      rowsToInsert.push({
        costType: "sale_commission",
        amount: totalAmount,
        kpiRate: 0,
        kpiAmount: 0,
      });
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
          // Cột N Excel = "Tiến độ PMG đã thu tiền (%)" — đây là N (khách
          // trả CĐT), map vào paymentProgressPct chứ KHÔNG pmgProgressAmount.
          paymentProgressPct: toNum(row[13]),
          pmgCumulativePctSale: toNum(row[14]),
          commissionRate: toNum(row[15]),
          adminFeeSale: toNum(row[16]),
          customerSupport: ins.costType === "customer_support" ? csVal : 0,
          fiscalYear: toNum(row[18]) || null,
          pmgReconciledCumulative: toAmount(row[19]),
          pmgThisTime: toAmount(row[20]),
          pmgPayable: ins.costType === "sale_commission" ? pmgPayable : 0,
          pmgRemaining: toAmount(row[22]),
          kpiRate: ins.kpiRate,
          kpiAmount: ins.kpiAmount,
          amountPayableThisTime: ins.amount,
        })
        .returning({ id: schema.costReconciliations.id });
      costRecCount++;

      // Payment per recon = amount RIÊNG của recon đó (KHÔNG phải tổng payAmount
      // của cả row Excel — làm vậy sẽ dồn hết vào recon đầu, các recon anh em
      // paid=0 → "còn nợ" âm/dương lệch dù batch tổng cân).
      // Chỉ ghi payment khi row Excel có payDate hoặc payAmount ≠ 0
      // (nghĩa là NV được trả đợt đó).
      if (payDate || payAmount > 0) {
        await db.insert(schema.paymentsOut).values({
          costReconciliationId: rec.id,
          paymentDate: payDate,
          amount: ins.amount,
        });
        paymentOutCount++;
      }
    }
  }

  console.log(`\nInserted ${costRecCount} cost reconciliations`);
  console.log(`Inserted ${paymentOutCount} payments_out`);
  console.log(`Skipped ${skipped} rows (empty or unit not found)`);
    log.created = costRecCount;
    log.skipped = skipped;
    log.details = { payments_out: paymentOutCount };
  });
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
