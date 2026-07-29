/**
 * Re-import revenue_recons + payments_in từ sheet "2.2_Doanh thu".
 * Sheet 2.2 là ground truth: mỗi row = 1 đợt đối chiếu + 1 lần thanh toán.
 *
 * Logic:
 *   1. Đọc tất cả row từ sheet 2.2 (từ row idx 5+)
 *   2. Match product bằng (Ma_can + Du an) → productId
 *   3. Group rows by productId
 *   4. Wipe: payments_in + revenue_recons cho các product xuất hiện trong sheet
 *   5. Insert lại: mỗi row → 1 recon (đủ số BB, số HĐ, %PMG, đợt số...) +
 *      1 payment_in nếu Ngày nhận + Số tiền thực > 0
 *   6. Match Số HĐ → invoiceId (nếu HĐ đã có), tạo invoice mới nếu cần
 */
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import { eq, inArray, and } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const EXCEL_PATH = path.join(process.cwd(), "data-excel", "BAO CAO DOANH THU.xlsx");
if (!fs.existsSync(EXCEL_PATH)) {
  console.error("File not found:", EXCEL_PATH);
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const toStr = (v: unknown): string => (v == null ? "" : String(v).trim());
const toStrOrNull = (v: unknown): string | null => {
  const s = toStr(v);
  return s === "" ? null : s;
};
const toNum = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return isNaN(n) ? 0 : n;
};
const toDateStr = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  return s || null;
};
const parsePhase = (v: unknown): number | null => {
  const s = toStr(v);
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : null;
};

async function main() {
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true, cellNF: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.2_Doanh thu"], {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  // Build product lookup: (projectName + unitCode) → productId
  const dbProducts = await db
    .select({
      id: schema.products.id,
      unitCode: schema.products.unitCode,
      projectName: schema.projects.name,
    })
    .from(schema.products)
    .leftJoin(schema.projects, eq(schema.products.projectId, schema.projects.id));
  const normalizeUnit = (s: string): string => s.trim().replace(/[.\-\s]/g, "");
  const productByKey = new Map<string, number>();
  for (const p of dbProducts) {
    const key = `${(p.projectName ?? "").trim()}|${normalizeUnit(p.unitCode)}`;
    productByKey.set(key, p.id);
  }
  console.log(`Loaded ${productByKey.size} products in DB`);

  // Parse sheet 2.2 rows
  type Row = {
    excelRow: number;
    productId: number;
    reconciliationDate: string | null;
    minutesNumber: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    invoiceTotalVat: number;
    pmgBasePrice: number;
    pmgCumulativePct: number;
    paymentProgressPct: number;
    phaseNumber: number | null;
    revenueThisTime: number;
    totalReceivableThisTime: number;
    cdtBonusSale: number;
    cdtBonusManager: number;
    adminFeeVat: number;
    revenueReduction: number;
    paymentDate: string | null;
    paymentAmount: number;
  };
  const parsed: Row[] = [];
  let notFound = 0;
  const notFoundKeys = new Set<string>();
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const unitCode = toStr(r[7]);
    const projectName = toStr(r[8]);
    if (!unitCode || !projectName) continue;
    const key = `${projectName}|${normalizeUnit(unitCode)}`;
    const productId = productByKey.get(key);
    if (!productId) {
      notFound++;
      notFoundKeys.add(`${projectName}|${unitCode}`);
      continue;
    }
    parsed.push({
      excelRow: i,
      productId,
      reconciliationDate: toDateStr(r[1]),
      minutesNumber: toStrOrNull(r[2]),
      invoiceNumber: toStrOrNull(r[4]),
      invoiceDate: toDateStr(r[3]),
      invoiceTotalVat: toNum(r[5]),
      pmgBasePrice: toNum(r[11]),
      pmgCumulativePct: toNum(r[12]),
      // Cột P sheet 2.2 = index 15 = "Ty le % thu PMG LK dot nay" (N thực)
      paymentProgressPct: toNum(r[15]),
      phaseNumber: parsePhase(r[17]),
      revenueThisTime: toNum(r[19]),
      totalReceivableThisTime: toNum(r[26]),
      cdtBonusSale: toNum(r[24]),
      cdtBonusManager: toNum(r[25]),
      adminFeeVat: toNum(r[16]),
      revenueReduction: toNum(r[23]),
      paymentDate: toDateStr(r[27]),
      paymentAmount: toNum(r[28]),
    });
  }
  console.log(`Parsed ${parsed.length} rows from sheet 2.2`);
  console.log(`Not found ${notFound} rows (${notFoundKeys.size} unique product keys)`);
  if (notFoundKeys.size > 0 && notFoundKeys.size < 20) {
    console.log("Missing keys:");
    for (const k of notFoundKeys) console.log(`  - ${k}`);
  }

  // Affected products
  const affectedProductIds = Array.from(new Set(parsed.map((r) => r.productId)));
  console.log(`Affected ${affectedProductIds.length} products`);

  // WIPE: payments_in + revenue_recons cho affected products
  console.log("\nWiping old revenue_recons + payments_in...");
  const oldRecons = await db
    .select({ id: schema.revenueReconciliations.id })
    .from(schema.revenueReconciliations)
    .where(inArray(schema.revenueReconciliations.productId, affectedProductIds));
  const oldReconIds = oldRecons.map((r) => r.id);
  if (oldReconIds.length > 0) {
    await db
      .delete(schema.paymentsIn)
      .where(inArray(schema.paymentsIn.reconciliationId, oldReconIds));
    await db
      .delete(schema.revenueReconciliations)
      .where(inArray(schema.revenueReconciliations.id, oldReconIds));
    console.log(`  Deleted ${oldReconIds.length} recons + payments`);
  }

  // Invoice cache
  const invoiceCache = new Map<string, number>(); // `${number}|${date}` → id

  // Insert
  console.log("\nInserting new recons + payments...");
  let reconCount = 0;
  let payCount = 0;
  for (const r of parsed) {
    // Match/create invoice
    let invoiceId: number | null = null;
    if (r.invoiceNumber) {
      const key = `${r.invoiceNumber}|${r.invoiceDate ?? ""}`;
      const cached = invoiceCache.get(key);
      if (cached) {
        invoiceId = cached;
      } else {
        const [existing] = await db
          .select({ id: schema.invoices.id })
          .from(schema.invoices)
          .where(
            and(
              eq(schema.invoices.invoiceNumber, r.invoiceNumber),
              r.invoiceDate
                ? eq(schema.invoices.invoiceDate, r.invoiceDate)
                : eq(schema.invoices.invoiceNumber, r.invoiceNumber),
            ),
          );
        if (existing) {
          invoiceId = existing.id;
        } else {
          const [inserted] = await db
            .insert(schema.invoices)
            .values({
              invoiceNumber: r.invoiceNumber,
              invoiceDate: r.invoiceDate,
              totalAmountVat: r.invoiceTotalVat,
            })
            .returning({ id: schema.invoices.id });
          invoiceId = inserted.id;
        }
        invoiceCache.set(key, invoiceId);
      }
    }

    // Insert recon
    const [reconRow] = await db
      .insert(schema.revenueReconciliations)
      .values({
        productId: r.productId,
        reconciliationDate: r.reconciliationDate,
        minutesNumber: r.minutesNumber,
        invoiceId,
        phaseNumber: r.phaseNumber,
        pmgCumulativePct: r.pmgCumulativePct,
        paymentProgressPct: r.paymentProgressPct,
        pmgBasePrice: r.pmgBasePrice,
        revenueThisTime: r.revenueThisTime,
        revenueReduction: r.revenueReduction,
        adminFeeVat: r.adminFeeVat,
        cdtBonusSale: r.cdtBonusSale,
        cdtBonusManager: r.cdtBonusManager,
        totalReceivableThisTime: r.totalReceivableThisTime,
      })
      .returning({ id: schema.revenueReconciliations.id });
    reconCount++;

    // Insert payment if có ngày hoặc số tiền
    if (r.paymentDate || r.paymentAmount > 0) {
      await db.insert(schema.paymentsIn).values({
        reconciliationId: reconRow.id,
        paymentDate: r.paymentDate,
        amount: r.paymentAmount,
      });
      payCount++;
    }
  }
  console.log(`  Inserted ${reconCount} recons + ${payCount} payments`);

  await client.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
