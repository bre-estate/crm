/**
 * Reconcile 13 fields W→AI của Excel sheet "3_BC DOANH THU - GIA VON"
 * với logic compute trong app (lib/hrChecks.ts).
 *
 * Output: bảng gap per căn per field.
 */

import * as XLSX from "xlsx";
import { db } from "../lib/db";
import {
  products,
  projects,
  partners,
  revenueReconciliations,
  costReconciliations,
  paymentsIn,
} from "../lib/schema";
import { eq } from "drizzle-orm";
import { computeHrChecks, HR_CHECK_LABELS, PERCENT_FIELDS, type HrCheckField } from "../lib/hrChecks";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtPct = (n: number) => (n * 100).toFixed(2) + "%";

const FIELDS: HrCheckField[] = [
  "W", "X", "Y", "Z", "AA",
  "AB", "AC", "AD", "AE", "AF",
  "AG", "AH", "AI",
];
const colIdx = (letter: string): number => {
  let n = 0;
  for (const c of letter.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};
const FIELD_TO_EXCEL_COL: Record<HrCheckField, number> = {
  W: colIdx("W"),
  X: colIdx("X"),
  Y: colIdx("Y"),
  Z: colIdx("Z"),
  AA: colIdx("AA"),
  AB: colIdx("AB"),
  AC: colIdx("AC"),
  AD: colIdx("AD"),
  AE: colIdx("AE"),
  AF: colIdx("AF"),
  AG: colIdx("AG"),
  AH: colIdx("AH"),
  AI: colIdx("AI"),
};

async function main() {
  // 1. Load Excel
  const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx");
  const ws = wb.Sheets["3_BC DOANH THU - GIA VON"];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });

  // Data starts row 9 (row 8 = header)
  const excelByKey = new Map<string, Record<HrCheckField, number>>();
  const excelMeta = new Map<string, { unitCode: string; projectName: string; ma_sp: string }>();
  let excelCount = 0;
  for (let i = 9; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r) continue;
    const stt = r[0];
    if (typeof stt !== "number" || stt <= 0) continue;
    const ma_sp = String(r[1] ?? "").trim();
    const ma_can = String(r[2] ?? "").trim();
    const du_an = String(r[3] ?? "").trim();
    if (!ma_can || !du_an) continue;
    const key = `${ma_can}|${du_an}`;
    const vals: Record<HrCheckField, number> = {} as Record<HrCheckField, number>;
    for (const f of FIELDS) {
      const v = r[FIELD_TO_EXCEL_COL[f]];
      vals[f] = typeof v === "number" ? v : 0;
    }
    excelByKey.set(key, vals);
    excelMeta.set(key, { unitCode: ma_can, projectName: du_an, ma_sp });
    excelCount++;
  }
  console.log(`Excel data rows: ${excelCount}`);

  // 2. Load app data + compute
  const [productRows, revRows, costRows, payRows] = await Promise.all([
    db.select({
      id: products.id,
      productCode: products.productCode,
      unitCode: products.unitCode,
      projectName: projects.name,
      partnerName: partners.name,
      salesPerson: products.salesPerson,
      deptLeaderName: products.deptLeaderName,
      totalRevenue: products.totalRevenue,
      pmgBasePrice: products.pmgBasePrice,
      pmgSaleRate: products.pmgSaleRate,
      pmgRate: products.pmgRate,
      adminFeeSale: products.adminFeeSale,
      customerSupport: products.customerSupport,
      saleCommissionRate: products.saleCommissionRate,
      kpiCeoRate: products.kpiCeoRate,
      kpiTpkdRate: products.kpiTpkdRate,
      kpiAdminRate: products.kpiAdminRate,
      bonusSale: products.bonusSale,
      bonusManager: products.bonusManager,
      cdtBonusSale: products.cdtBonusSale,
      cdtBonusManager: products.cdtBonusManager,
    }).from(products)
      .leftJoin(projects, eq(products.projectId, projects.id))
      .leftJoin(partners, eq(projects.partnerId, partners.id)),
    db.select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      invoiceId: revenueReconciliations.invoiceId,
      totalReceivableThisTime: revenueReconciliations.totalReceivableThisTime,
      revenueThisTime: revenueReconciliations.revenueThisTime,
      paymentProgressPct: revenueReconciliations.paymentProgressPct,
      pmgCumulativePct: revenueReconciliations.pmgCumulativePct,
    }).from(revenueReconciliations),
    db.select({
      productId: costReconciliations.productId,
      costType: costReconciliations.costType,
      amountPayableThisTime: costReconciliations.amountPayableThisTime,
    }).from(costReconciliations),
    db.select({
      reconciliationId: paymentsIn.reconciliationId,
      amount: paymentsIn.amount,
    }).from(paymentsIn),
  ]);

  const appRows = computeHrChecks(
    productRows.map((p) => ({
      ...p,
      totalRevenue: p.totalRevenue == null ? null : Number(p.totalRevenue),
      pmgBasePrice: p.pmgBasePrice == null ? null : Number(p.pmgBasePrice),
      pmgSaleRate: p.pmgSaleRate == null ? null : Number(p.pmgSaleRate),
      pmgRate: p.pmgRate == null ? null : Number(p.pmgRate),
      adminFeeSale: p.adminFeeSale == null ? null : Number(p.adminFeeSale),
      customerSupport: p.customerSupport == null ? null : Number(p.customerSupport),
      saleCommissionRate: p.saleCommissionRate == null ? null : Number(p.saleCommissionRate),
      kpiCeoRate: p.kpiCeoRate == null ? null : Number(p.kpiCeoRate),
      kpiTpkdRate: p.kpiTpkdRate == null ? null : Number(p.kpiTpkdRate),
      kpiAdminRate: p.kpiAdminRate == null ? null : Number(p.kpiAdminRate),
      bonusSale: p.bonusSale == null ? null : Number(p.bonusSale),
      bonusManager: p.bonusManager == null ? null : Number(p.bonusManager),
      cdtBonusSale: p.cdtBonusSale == null ? null : Number(p.cdtBonusSale),
      cdtBonusManager: p.cdtBonusManager == null ? null : Number(p.cdtBonusManager),
    })),
    revRows.map((r) => ({
      id: r.id,
      productId: r.productId,
      invoiceId: r.invoiceId,
      totalReceivableThisTime: Number(r.totalReceivableThisTime ?? 0),
      revenueThisTime: Number(r.revenueThisTime ?? 0),
      paymentProgressPct: Number(r.paymentProgressPct ?? 0),
      pmgCumulativePct: Number(r.pmgCumulativePct ?? 0),
    })),
    costRows.map((c) => ({
      productId: c.productId,
      costType: c.costType,
      amountPayableThisTime: Number(c.amountPayableThisTime ?? 0),
    })),
    payRows.filter((p) => p.reconciliationId !== null).map((p) => ({
      reconciliationId: p.reconciliationId as number,
      amount: Number(p.amount ?? 0),
    })),
  );
  const appByKey = new Map<string, typeof appRows[number]>();
  for (const a of appRows) {
    const key = `${a.unitCode}|${a.projectName ?? ""}`;
    appByKey.set(key, a);
  }
  console.log(`App products: ${appRows.length}\n`);

  // 3. Compare
  const matchedKeys = [...excelByKey.keys()].filter((k) => appByKey.has(k));
  const excelOnlyKeys = [...excelByKey.keys()].filter((k) => !appByKey.has(k));
  const appOnlyKeys = [...appByKey.keys()].filter((k) => !excelByKey.has(k));
  console.log(`Matched căn: ${matchedKeys.length}`);
  console.log(`Excel-only: ${excelOnlyKeys.length}`);
  console.log(`App-only: ${appOnlyKeys.length}`);

  // Threshold cho "khớp": tiền |Δ| < 5000 VND, % |Δ| < 0.5%
  const closeEnough = (f: HrCheckField, a: number, e: number) => {
    const diff = Math.abs(a - e);
    return PERCENT_FIELDS.has(f) ? diff < 0.005 : diff < 5000;
  };

  // Per-field summary
  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`  FIELD SUMMARY (matched căn)`);
  console.log(`═════════════════════════════════════════════════`);
  console.log(`${"Field".padEnd(5)} | ${"Label".padEnd(45)} | ${"Match".padStart(7)} | ${"Mismatch".padStart(9)} | ${"Excel Total".padStart(16)} | ${"App Total".padStart(16)} | ${"Δ Total".padStart(14)}`);
  console.log("─".repeat(140));
  for (const f of FIELDS) {
    let matchCnt = 0;
    let mismatchCnt = 0;
    let excelSum = 0;
    let appSum = 0;
    for (const k of matchedKeys) {
      const e = excelByKey.get(k)![f];
      const a = appByKey.get(k)!.values[f];
      excelSum += e;
      appSum += a;
      if (closeEnough(f, a, e)) matchCnt++;
      else mismatchCnt++;
    }
    const isPct = PERCENT_FIELDS.has(f);
    console.log(
      `${f.padEnd(5)} | ${HR_CHECK_LABELS[f].padEnd(45)} | ${String(matchCnt).padStart(7)} | ${String(mismatchCnt).padStart(9)} | ${(isPct ? fmtPct(excelSum) : fmt(excelSum)).padStart(16)} | ${(isPct ? fmtPct(appSum) : fmt(appSum)).padStart(16)} | ${(isPct ? fmtPct(appSum - excelSum) : fmt(appSum - excelSum)).padStart(14)}`,
    );
  }

  // Top mismatches per field
  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`  TOP 5 MISMATCHES PER FIELD (|Δ| lớn nhất)`);
  console.log(`═════════════════════════════════════════════════`);
  for (const f of FIELDS) {
    const isPct = PERCENT_FIELDS.has(f);
    const rows: Array<{ key: string; excel: number; app: number; diff: number }> = [];
    for (const k of matchedKeys) {
      const e = excelByKey.get(k)![f];
      const a = appByKey.get(k)!.values[f];
      if (closeEnough(f, a, e)) continue;
      rows.push({ key: k, excel: e, app: a, diff: a - e });
    }
    if (rows.length === 0) continue;
    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    console.log(`\n  ${f}. ${HR_CHECK_LABELS[f]} (${rows.length} mismatch)`);
    for (const r of rows.slice(0, 5)) {
      const meta = excelMeta.get(r.key)!;
      console.log(
        `    ${meta.unitCode.padEnd(15)} · ${meta.projectName.substring(0, 30).padEnd(30)} · Excel=${(isPct ? fmtPct(r.excel) : fmt(r.excel)).padStart(14)} · App=${(isPct ? fmtPct(r.app) : fmt(r.app)).padStart(14)} · Δ=${(isPct ? fmtPct(r.diff) : fmt(r.diff)).padStart(12)}`,
      );
    }
  }

  // App-only / Excel-only (sanity check)
  if (excelOnlyKeys.length > 0) {
    console.log(`\n  === Excel-only căn (top 10) ===`);
    for (const k of excelOnlyKeys.slice(0, 10)) {
      const meta = excelMeta.get(k)!;
      console.log(`    ${meta.unitCode} · ${meta.projectName} · ma_sp=${meta.ma_sp}`);
    }
  }
  if (appOnlyKeys.length > 0) {
    console.log(`\n  === App-only căn (top 10) ===`);
    for (const k of appOnlyKeys.slice(0, 10)) {
      console.log(`    ${k}`);
    }
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
