/**
 * Audit consistency giữa Excel "BAO CAO DOANH THU.xlsx" và DB (Supabase).
 * Focus: sheet 2.2 Doanh thu (revenue_reconciliations) + sheet 2.3 Gia von (cost_reconciliations).
 *
 * Usage: cd BRE/App/CRM && npx tsx scripts/audit_bcdt_vs_app.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import * as XLSX from "xlsx";
import path from "path";

const EXCEL_PATH =
  "/Users/trietnguyen/Documents/Company/BRE/App/CRM/data-excel/BAO CAO DOANH THU.xlsx";
const DIFF_THRESHOLD = 1000; // VND

const sql = postgres(process.env.DATABASE_URL!, { max: 4 });
const fmt = (n: number) =>
  Math.round(n).toLocaleString("vi-VN", { maximumFractionDigits: 0 });

function normCode(s: unknown): string {
  if (s == null) return "";
  return String(s).trim().toUpperCase();
}

function toNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").replace(/\s/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function excelDateToISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial: 1900-01-01 = 1. 1900 leap-year bug adds a phantom day.
    // Anchor 1899-12-30 + (serial-1) gives Excel-visible date for serial >= 61.
    const utc = new Date(Date.UTC(1899, 11, 30) + (Math.floor(v) - 1) * 86400000);
    return utc.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // MM/DD/YYYY or M/D/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, mm, dd, yy] = m;
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // YYYY-MM-DD already
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return m2[0];
  return null;
}

type RevRow = {
  reconDate: string | null;
  minutesNumber: string;
  invoiceDate: string | null;
  invoiceNumber: string;
  productCode: string;
  unitCode: string;
  totalReceivable: number;
};

type CostRow = {
  reconDate: string | null;
  employeeName: string;
  productCode: string;
  unitCode: string;
  amountPayable: number;
};

async function main() {
  console.log("═══ AUDIT: BAO CAO DOANH THU.xlsx vs App DB ═══\n");
  console.log("Reading Excel...");
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: false });

  // ── Sheet 2.2 Doanh thu ─────────────────────────────
  const shRev = wb.Sheets["2.2_Doanh thu"];
  if (!shRev) throw new Error("Sheet '2.2_Doanh thu' not found");
  const revRaw = XLSX.utils.sheet_to_json<any[]>(shRev, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  // Data starts at row 5 (index 4)
  const revData = revRaw.slice(4);
  const revRows: RevRow[] = [];
  for (const r of revData) {
    if (!r) continue;
    const productCode = normCode(r[6]);
    if (productCode === "MA_SP" || productCode === "#N/A") continue; // header / bad
    // Col 26 = "Tong khoan phai thu dot nay" = base col 20 + CĐT thưởng sale col 24 + CĐT thưởng QL sàn col 25.
    // This is the column that maps to DB revenue_reconciliations.total_receivable_this_time.
    const total = toNum(r[26]);
    if (!productCode && total === 0) continue;
    revRows.push({
      reconDate: excelDateToISO(r[1]),
      minutesNumber: r[2] == null ? "" : String(r[2]).trim(),
      invoiceDate: excelDateToISO(r[3]),
      invoiceNumber: r[4] == null ? "" : String(r[4]).trim(),
      productCode,
      unitCode: normCode(r[7]),
      totalReceivable: total,
    });
  }

  // ── Sheet 2.3 Gia von ───────────────────────────────
  const shCost = wb.Sheets["2.3_Gia von"];
  if (!shCost) throw new Error("Sheet '2.3_Gia von' not found");
  const costRaw = XLSX.utils.sheet_to_json<any[]>(shCost, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  // Data starts at row 4 (index 3)
  const costData = costRaw.slice(3);
  const costRows: CostRow[] = [];
  for (const r of costData) {
    if (!r) continue;
    const productCode = normCode(r[3]);
    if (productCode === "MA_SP" || productCode === "#N/A") continue; // header / bad
    const amt = toNum(r[38]); // AM
    if (!productCode && amt === 0) continue;
    costRows.push({
      reconDate: excelDateToISO(r[1]),
      employeeName: r[2] == null ? "" : String(r[2]).trim(),
      productCode,
      unitCode: normCode(r[4]),
      amountPayable: amt,
    });
  }

  console.log(`Excel 2.2 rows (non-blank): ${revRows.length}`);
  console.log(`Excel 2.3 rows (non-blank): ${costRows.length}\n`);

  // ── DB queries ─────────────────────────────────────
  console.log("Querying DB...");
  const dbProducts = await sql`
    SELECT id, product_code, unit_code FROM products
  `;
  const productByCode = new Map<string, { id: number; unit_code: string | null }>();
  for (const p of dbProducts) {
    productByCode.set(normCode(p.product_code), {
      id: p.id,
      unit_code: p.unit_code,
    });
  }

  const dbRev = await sql<
    {
      id: number;
      product_id: number;
      product_code: string;
      reconciliation_date: string;
      minutes_number: string | null;
      total_receivable_this_time: string;
    }[]
  >`
    SELECT rr.id, rr.product_id, p.product_code,
           substr(rr.reconciliation_date::text, 1, 10) as reconciliation_date,
           rr.minutes_number,
           rr.total_receivable_this_time::float8 as total_receivable_this_time
    FROM revenue_reconciliations rr
    JOIN products p ON p.id = rr.product_id
  `;

  const dbCost = await sql<
    {
      id: number;
      product_id: number;
      product_code: string;
      reconciliation_date: string;
      cost_type: string;
      employee_name: string | null;
      amount_payable_this_time: string;
    }[]
  >`
    SELECT cr.id, cr.product_id, p.product_code,
           substr(cr.reconciliation_date::text, 1, 10) as reconciliation_date,
           cr.cost_type, cr.employee_name,
           cr.amount_payable_this_time::float8 as amount_payable_this_time
    FROM cost_reconciliations cr
    JOIN products p ON p.id = cr.product_id
  `;

  console.log(`DB products: ${dbProducts.length}`);
  console.log(`DB revenue_reconciliations rows: ${dbRev.length}`);
  console.log(`DB cost_reconciliations rows: ${dbCost.length}\n`);

  // ── PART 2: Aggregate per product_code (revenue) ───
  const excelRevByCode = new Map<string, number>();
  for (const r of revRows) {
    excelRevByCode.set(
      r.productCode,
      (excelRevByCode.get(r.productCode) || 0) + r.totalReceivable
    );
  }
  const dbRevByCode = new Map<string, number>();
  for (const r of dbRev) {
    const code = normCode(r.product_code);
    dbRevByCode.set(
      code,
      (dbRevByCode.get(code) || 0) + Number(r.total_receivable_this_time)
    );
  }

  const revDiffs: { code: string; excel: number; db: number; diff: number }[] =
    [];
  const allRevCodes = new Set([
    ...excelRevByCode.keys(),
    ...dbRevByCode.keys(),
  ]);
  for (const code of allRevCodes) {
    const e = excelRevByCode.get(code) || 0;
    const d = dbRevByCode.get(code) || 0;
    const diff = Math.abs(e - d);
    if (diff > DIFF_THRESHOLD) revDiffs.push({ code, excel: e, db: d, diff });
  }
  revDiffs.sort((a, b) => b.diff - a.diff);

  const excelRevTotal = Array.from(excelRevByCode.values()).reduce(
    (s, v) => s + v,
    0
  );
  const dbRevTotal = Array.from(dbRevByCode.values()).reduce(
    (s, v) => s + v,
    0
  );

  console.log("═══ PART 2: DOANH THU per mã SP ═══");
  console.log(`Excel tổng DT      : ${fmt(excelRevTotal)}`);
  console.log(`DB tổng DT         : ${fmt(dbRevTotal)}`);
  console.log(
    `Chênh tổng         : ${fmt(Math.abs(excelRevTotal - dbRevTotal))}`
  );
  console.log(`Số mã SP có diff > ${DIFF_THRESHOLD}: ${revDiffs.length}\n`);
  if (revDiffs.length > 0) {
    console.log("Top 20 mã SP diff lớn nhất (Doanh thu):");
    console.log(
      "| # | Mã SP | Excel | DB | |Diff| |"
    );
    console.log("|---|---|---:|---:|---:|");
    for (const [i, d] of revDiffs.slice(0, 20).entries()) {
      console.log(
        `| ${i + 1} | ${d.code} | ${fmt(d.excel)} | ${fmt(d.db)} | ${fmt(d.diff)} |`
      );
    }
    console.log();
  } else {
    console.log("→ Khớp 100% (diff ≤ threshold).\n");
  }

  // ── PART 3: Aggregate per product_code (cost) ──────
  const excelCostByCode = new Map<string, number>();
  for (const r of costRows) {
    excelCostByCode.set(
      r.productCode,
      (excelCostByCode.get(r.productCode) || 0) + r.amountPayable
    );
  }
  const dbCostByCode = new Map<string, number>();
  for (const r of dbCost) {
    const code = normCode(r.product_code);
    dbCostByCode.set(
      code,
      (dbCostByCode.get(code) || 0) + Number(r.amount_payable_this_time)
    );
  }

  const costDiffs: {
    code: string;
    excel: number;
    db: number;
    diff: number;
  }[] = [];
  const allCostCodes = new Set([
    ...excelCostByCode.keys(),
    ...dbCostByCode.keys(),
  ]);
  for (const code of allCostCodes) {
    const e = excelCostByCode.get(code) || 0;
    const d = dbCostByCode.get(code) || 0;
    const diff = Math.abs(e - d);
    if (diff > DIFF_THRESHOLD) costDiffs.push({ code, excel: e, db: d, diff });
  }
  costDiffs.sort((a, b) => b.diff - a.diff);

  const excelCostTotal = Array.from(excelCostByCode.values()).reduce(
    (s, v) => s + v,
    0
  );
  const dbCostTotal = Array.from(dbCostByCode.values()).reduce(
    (s, v) => s + v,
    0
  );

  console.log("═══ PART 3: GIÁ VỐN per mã SP ═══");
  console.log(`Excel tổng GV      : ${fmt(excelCostTotal)}`);
  console.log(`DB tổng GV         : ${fmt(dbCostTotal)}`);
  console.log(
    `Chênh tổng         : ${fmt(Math.abs(excelCostTotal - dbCostTotal))}`
  );
  console.log(`Số mã SP có diff > ${DIFF_THRESHOLD}: ${costDiffs.length}\n`);
  if (costDiffs.length > 0) {
    console.log("Top 20 mã SP diff lớn nhất (Giá vốn):");
    console.log(
      "| # | Mã SP | Excel | DB | |Diff| |"
    );
    console.log("|---|---|---:|---:|---:|");
    for (const [i, d] of costDiffs.slice(0, 20).entries()) {
      console.log(
        `| ${i + 1} | ${d.code} | ${fmt(d.excel)} | ${fmt(d.db)} | ${fmt(d.diff)} |`
      );
    }
    console.log();
  } else {
    console.log("→ Khớp 100% (diff ≤ threshold).\n");
  }

  // ── PART 4: Sanity check số BB (join code+date) ────
  console.log("═══ PART 4: Kiểm tra số BB (minutes_number) ═══");
  // Build map DB: key = code|date → minutes_number
  const dbMinutesByKey = new Map<string, Set<string>>();
  for (const r of dbRev) {
    if (!r.minutes_number) continue;
    const key = `${normCode(r.product_code)}|${r.reconciliation_date}`;
    if (!dbMinutesByKey.has(key)) dbMinutesByKey.set(key, new Set());
    dbMinutesByKey.get(key)!.add(String(r.minutes_number).trim());
  }
  // Build map Excel
  const excelMinutesByKey = new Map<string, Set<string>>();
  for (const r of revRows) {
    if (!r.minutesNumber || !r.reconDate) continue;
    const key = `${r.productCode}|${r.reconDate}`;
    if (!excelMinutesByKey.has(key)) excelMinutesByKey.set(key, new Set());
    excelMinutesByKey.get(key)!.add(r.minutesNumber);
  }
  // For each DB key with minutes, verify Excel key contains the same
  let bbMatch = 0;
  let bbMismatch = 0;
  let bbMissingInExcel = 0;
  const bbMismatchList: {
    key: string;
    dbSet: string[];
    excelSet: string[];
  }[] = [];
  for (const [key, dbSet] of dbMinutesByKey) {
    const excelSet = excelMinutesByKey.get(key);
    if (!excelSet) {
      bbMissingInExcel++;
      continue;
    }
    // Check overlap
    const overlap = Array.from(dbSet).some((v) => excelSet.has(v));
    if (overlap) bbMatch++;
    else {
      bbMismatch++;
      bbMismatchList.push({
        key,
        dbSet: Array.from(dbSet),
        excelSet: Array.from(excelSet),
      });
    }
  }
  console.log(`Số (product+date) trong DB có minutes_number: ${dbMinutesByKey.size}`);
  console.log(`  → match Excel: ${bbMatch}`);
  console.log(`  → mismatch  : ${bbMismatch}`);
  console.log(`  → không tìm thấy key trong Excel: ${bbMissingInExcel}`);
  if (bbMismatchList.length > 0) {
    console.log("\nTop 20 mismatch số BB:");
    console.log("| product_code | date | DB minutes | Excel minutes |");
    console.log("|---|---|---|---|");
    for (const m of bbMismatchList.slice(0, 20)) {
      const [code, date] = m.key.split("|");
      console.log(
        `| ${code} | ${date} | ${m.dbSet.join(",")} | ${m.excelSet.join(",")} |`
      );
    }
  }
  console.log();

  // ── PART 5: Products presence ─────────────────────
  console.log("═══ PART 5: Mã SP chỉ có ở 1 phía ═══");
  const excelCodes = new Set([
    ...excelRevByCode.keys(),
    ...excelCostByCode.keys(),
  ]);
  const dbCodes = new Set(productByCode.keys());
  const inExcelNotDb = Array.from(excelCodes).filter(
    (c) => c && !dbCodes.has(c)
  );
  const inDbNotExcel = Array.from(dbCodes).filter(
    (c) => c && !excelCodes.has(c)
  );
  // Filter DB-only ones — many products may have no recons at all; more informative: DB-with-recons but not in Excel
  const dbCodesWithRecons = new Set([
    ...dbRevByCode.keys(),
    ...dbCostByCode.keys(),
  ]);
  const inDbReconsNotExcel = Array.from(dbCodesWithRecons).filter(
    (c) => c && !excelCodes.has(c)
  );

  console.log(`Mã SP ở Excel không có DB (products): ${inExcelNotDb.length}`);
  if (inExcelNotDb.length > 0) {
    console.log("  Top 20:");
    for (const c of inExcelNotDb.slice(0, 20)) console.log(`  - ${c}`);
  }
  console.log(
    `\nMã SP DB có recon nhưng không xuất hiện ở Excel: ${inDbReconsNotExcel.length}`
  );
  if (inDbReconsNotExcel.length > 0) {
    console.log("  Top 20:");
    for (const c of inDbReconsNotExcel.slice(0, 20)) console.log(`  - ${c}`);
  }

  await sql.end();
  console.log("\n═══ DONE ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
