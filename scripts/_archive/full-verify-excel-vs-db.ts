/**
 * Full verify: so sánh 100% cost_reconciliations giữa Excel sheet 2.3 và DB.
 *
 * READ-ONLY — KHÔNG update, KHÔNG delete, KHÔNG insert. Chỉ báo lỗi.
 *
 * Cách so sánh:
 *   - Mỗi row Excel có thể có nhiều components → tách thành các bucket
 *     (unit_code + date + employee + costType).
 *   - Sum bucket từ Excel vs DB. Nếu khác nhau (|diff| > 1) → mismatch.
 *   - Report:
 *     A. Excel row có unit_code không có trong DB (product không tồn tại)
 *     B. Bucket có ở Excel nhưng không có ở DB (import bỏ sót)
 *     C. Bucket có ở DB nhưng không có ở Excel (dư — có thể do nhập tay ngoài Excel)
 *     D. Bucket có cả 2 nhưng số tiền khác
 */
import * as XLSX from "xlsx";
import path from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const EXCEL_PATH = path.join(process.cwd(), "data-excel", "BAO CAO DOANH THU.xlsx");
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const toNum = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[.,\s]/g, "");
  const n = Number(s);
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
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return s || null;
};
const normalizeUnit = (s: string): string => s.trim().replace(/[.\-\s]/g, "");
const normalizeName = (s: string): string => s.trim().toLowerCase();

type BucketKey = string; // `${unit}|${date}|${employee}|${costType}`
const bucketKey = (unit: string, date: string | null, emp: string, type: string) =>
  `${normalizeUnit(unit)}|${date ?? ""}|${normalizeName(emp)}|${type}`;

async function main() {
  console.log("=== FULL VERIFY: Excel sheet 2.3_Gia von ↔ DB cost_reconciliations ===\n");
  console.log("READ-ONLY mode. KHÔNG update/insert/delete gì.\n");

  // Load DB
  const prodRows = await db.execute(sql`SELECT id, unit_code FROM products`);
  const products = prodRows as unknown as Array<{ id: number; unit_code: string }>;
  const unitToId = new Map<string, number>();
  for (const p of products) unitToId.set(normalizeUnit(p.unit_code), p.id);

  const dbRecons = await db.execute(sql`
    SELECT
      cr.id, cr.product_id, cr.reconciliation_date, cr.employee_name,
      cr.cost_type, cr.amount_payable_this_time::float8 AS amt
    FROM cost_reconciliations cr
  `);
  const dbList = dbRecons as unknown as Array<{
    id: number;
    product_id: number;
    reconciliation_date: string | null;
    employee_name: string;
    cost_type: string;
    amt: number;
  }>;
  // Build DB bucket map (aggregate cùng key)
  const dbBuckets = new Map<BucketKey, { amt: number; reconIds: number[] }>();
  const productIdToUnit = new Map(products.map((p) => [p.id, p.unit_code]));
  for (const r of dbList) {
    const unit = productIdToUnit.get(r.product_id) ?? "?";
    const k = bucketKey(unit, r.reconciliation_date, r.employee_name, r.cost_type);
    const cur = dbBuckets.get(k) ?? { amt: 0, reconIds: [] };
    cur.amt += r.amt;
    cur.reconIds.push(r.id);
    dbBuckets.set(k, cur);
  }
  console.log(`DB: ${dbList.length} recons, ${dbBuckets.size} unique buckets`);

  // Load Excel
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
  const ws = wb.Sheets["2.3_Gia von"];
  if (!ws) throw new Error("Sheet 2.3_Gia von not found");
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];

  // Build Excel bucket map
  const excelBuckets = new Map<BucketKey, { amt: number; rowIdxs: number[] }>();
  const excelMissingProduct: { rowIdx: number; unit: string }[] = [];

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const employeeName = toStr(row[2]); // col C
    const unitCode = toStr(row[4]); // col E
    if (!employeeName || !unitCode) continue;
    const normalized = normalizeUnit(unitCode);
    if (!unitToId.has(normalized)) {
      excelMissingProduct.push({ rowIdx: i, unit: unitCode });
      continue;
    }
    const reconDate = toDateStr(row[1]);
    // Components
    const components: { type: string; amt: number }[] = [
      { type: "sale_commission", amt: toNum(row[21]) }, // V
      { type: "customer_support", amt: toNum(row[23]) }, // X
      { type: "cdt_bonus_sale", amt: toNum(row[24]) }, // Y
      { type: "cdt_bonus_manager", amt: toNum(row[25]) }, // Z
      { type: "bonus_sale", amt: toNum(row[26]) }, // AA
      { type: "bonus_manager", amt: toNum(row[27]) }, // AB
      { type: "kpi_ceo", amt: toNum(row[31]) }, // AF
      { type: "kpi_tpkd", amt: toNum(row[35]) }, // AJ
      { type: "kpi_admin", amt: toNum(row[37]) }, // AL
    ];
    const totalAM = toNum(row[38]); // AM
    const nonZeroComponents = components.filter((c) => c.amt !== 0);

    // Nếu không có component nào nhưng AM có → fallback sale_commission
    if (nonZeroComponents.length === 0 && totalAM !== 0) {
      nonZeroComponents.push({ type: "sale_commission", amt: totalAM });
    }
    // Nếu chỉ 1 component và AM khác → dùng AM (Kim adjustment)
    if (nonZeroComponents.length === 1 && Math.abs(totalAM - nonZeroComponents[0].amt) > 1) {
      nonZeroComponents[0].amt = totalAM;
    }

    for (const c of nonZeroComponents) {
      const k = bucketKey(unitCode, reconDate, employeeName, c.type);
      const cur = excelBuckets.get(k) ?? { amt: 0, rowIdxs: [] };
      cur.amt += c.amt;
      cur.rowIdxs.push(i + 1); // 1-indexed for Excel display
      excelBuckets.set(k, cur);
    }
  }
  console.log(`Excel: ${rows.length - 4} data rows, ${excelBuckets.size} unique buckets`);
  console.log(
    `Excel missing product: ${excelMissingProduct.length} rows (căn không có trong DB)\n`,
  );

  // ============================================================
  // Compare
  // ============================================================
  const inBothMatch: BucketKey[] = [];
  const inBothMismatch: {
    key: BucketKey;
    excel: number;
    db: number;
    diff: number;
    reconIds: number[];
    excelRowIdxs: number[];
  }[] = [];
  const onlyExcel: { key: BucketKey; amt: number; excelRowIdxs: number[] }[] = [];
  const onlyDb: { key: BucketKey; amt: number; reconIds: number[] }[] = [];

  for (const [k, ex] of excelBuckets) {
    const dbEntry = dbBuckets.get(k);
    if (!dbEntry) {
      onlyExcel.push({ key: k, amt: ex.amt, excelRowIdxs: ex.rowIdxs });
      continue;
    }
    if (Math.abs(ex.amt - dbEntry.amt) <= 1) {
      inBothMatch.push(k);
    } else {
      inBothMismatch.push({
        key: k,
        excel: ex.amt,
        db: dbEntry.amt,
        diff: dbEntry.amt - ex.amt,
        reconIds: dbEntry.reconIds,
        excelRowIdxs: ex.rowIdxs,
      });
    }
  }
  for (const [k, dbEntry] of dbBuckets) {
    if (!excelBuckets.has(k)) {
      onlyDb.push({ key: k, amt: dbEntry.amt, reconIds: dbEntry.reconIds });
    }
  }

  // ============================================================
  // Report
  // ============================================================
  console.log("=== A. Excel row có unit_code KHÔNG có trong DB (căn không tồn tại) ===");
  if (excelMissingProduct.length === 0) {
    console.log("  ✓ Không có\n");
  } else {
    const uniqUnits = new Set(excelMissingProduct.map((x) => x.unit));
    console.log(`  ${excelMissingProduct.length} rows, ${uniqUnits.size} unit_code unique`);
    for (const u of [...uniqUnits].slice(0, 10)) console.log(`  - ${u}`);
    if (uniqUnits.size > 10) console.log(`  ... và ${uniqUnits.size - 10} nữa`);
    console.log("");
  }

  console.log("=== B. Excel CÓ nhưng DB KHÔNG (import bỏ sót) ===");
  if (onlyExcel.length === 0) {
    console.log("  ✓ Không có bucket nào bị bỏ sót\n");
  } else {
    console.log(`  ${onlyExcel.length} buckets bỏ sót:`);
    for (const x of onlyExcel.slice(0, 20)) {
      console.log(
        `  - ${x.key} = ${fmt(x.amt)}   (Excel row ${x.excelRowIdxs.join(",")})`,
      );
    }
    if (onlyExcel.length > 20) console.log(`  ... và ${onlyExcel.length - 20} nữa`);
    console.log("");
  }

  console.log("=== C. DB CÓ nhưng Excel KHÔNG (nhập tay ngoài Excel) ===");
  if (onlyDb.length === 0) {
    console.log("  ✓ Không có bucket nào dư\n");
  } else {
    console.log(`  ${onlyDb.length} buckets chỉ có ở DB:`);
    for (const x of onlyDb.slice(0, 20)) {
      console.log(`  - ${x.key} = ${fmt(x.amt)}   (recon ids: ${x.reconIds.join(",")})`);
    }
    if (onlyDb.length > 20) console.log(`  ... và ${onlyDb.length - 20} nữa`);
    console.log("");
  }

  console.log("=== D. Cả 2 có nhưng SỐ TIỀN KHÁC ===");
  if (inBothMismatch.length === 0) {
    console.log("  ✓ Không có bucket nào lệch số\n");
  } else {
    console.log(`  ${inBothMismatch.length} buckets lệch:`);
    inBothMismatch.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    for (const x of inBothMismatch.slice(0, 20)) {
      console.log(
        `  - ${x.key}: Excel ${fmt(x.excel)} · DB ${fmt(x.db)} · chênh ${x.diff > 0 ? "+" : ""}${fmt(x.diff)}   (Excel row ${x.excelRowIdxs.join(",")}, recon ${x.reconIds.join(",")})`,
      );
    }
    if (inBothMismatch.length > 20)
      console.log(`  ... và ${inBothMismatch.length - 20} nữa`);
    console.log("");
  }

  console.log("=== TỔNG KẾT ===");
  console.log(`  Buckets match: ${inBothMatch.length}`);
  console.log(`  Buckets lệch số: ${inBothMismatch.length}`);
  console.log(`  Bỏ sót (Excel có, DB không): ${onlyExcel.length}`);
  console.log(`  Dư (DB có, Excel không): ${onlyDb.length}`);
  console.log(`  Excel rows unit không có DB: ${excelMissingProduct.length}`);
  const allGood =
    inBothMismatch.length === 0 && onlyExcel.length === 0 && onlyDb.length === 0;
  console.log(
    `\n${allGood ? "✅ TẤT CẢ KHỚP — không có bug import" : "⚠ Có lệch — xem chi tiết ở trên"}`,
  );
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error("Lỗi:", err);
    await client.end();
    process.exit(1);
  });
