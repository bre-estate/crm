/**
 * List chi tiết các mismatch còn lại + probable root cause + action.
 * Focus vào field còn chênh: Y, AA, AB, AI.
 */

import * as XLSX from "xlsx";
import { db } from "../lib/db";
import { products, projects, partners, revenueReconciliations, costReconciliations, paymentsIn } from "../lib/schema";
import { eq, sum } from "drizzle-orm";
import { computeHrChecks, PERCENT_FIELDS, type HrCheckField } from "../lib/hrChecks";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const colIdx = (letter: string): number => {
  let n = 0;
  for (const c of letter.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

const FIELDS: HrCheckField[] = ["Y", "AA", "AB", "AI"];
const FIELD_TO_COL: Record<HrCheckField, number> = {
  Y: colIdx("Y"),
  AA: colIdx("AA"),
  AB: colIdx("AB"),
  AI: colIdx("AI"),
  W: 0, X: 0, Z: 0, AC: 0, AD: 0, AE: 0, AF: 0, AG: 0, AH: 0,
};

async function main() {
  const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx");
  const ws = wb.Sheets["3_BC DOANH THU - GIA VON"];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });

  const excelByKey = new Map<string, Record<HrCheckField, number>>();
  for (let i = 9; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r) continue;
    const stt = r[0];
    if (typeof stt !== "number" || stt <= 0) continue;
    const key = `${String(r[2] ?? "").trim()}|${String(r[3] ?? "").trim()}`;
    const vals = {} as Record<HrCheckField, number>;
    for (const f of FIELDS) {
      const v = r[FIELD_TO_COL[f]];
      vals[f] = typeof v === "number" ? v : 0;
    }
    excelByKey.set(key, vals);
  }

  // Load app data
  const [productRows, revRows, costRows, payRows] = await Promise.all([
    db.select({
      id: products.id, productCode: products.productCode, unitCode: products.unitCode,
      projectName: projects.name, partnerName: partners.name,
      salesPerson: products.salesPerson, deptLeaderName: products.deptLeaderName,
      totalRevenue: products.totalRevenue,
      pmgBasePrice: products.pmgBasePrice, pmgSaleRate: products.pmgSaleRate,
      pmgRate: products.pmgRate, adminFeeSale: products.adminFeeSale,
      customerSupport: products.customerSupport, saleCommissionRate: products.saleCommissionRate,
      kpiCeoRate: products.kpiCeoRate, kpiTpkdRate: products.kpiTpkdRate,
      kpiAdminRate: products.kpiAdminRate, bonusSale: products.bonusSale,
      bonusManager: products.bonusManager, cdtBonusSale: products.cdtBonusSale,
      cdtBonusManager: products.cdtBonusManager,
    }).from(products)
      .leftJoin(projects, eq(products.projectId, projects.id))
      .leftJoin(partners, eq(projects.partnerId, partners.id)),
    db.select({
      id: revenueReconciliations.id, productId: revenueReconciliations.productId,
      invoiceId: revenueReconciliations.invoiceId,
      totalReceivableThisTime: revenueReconciliations.totalReceivableThisTime,
      revenueThisTime: revenueReconciliations.revenueThisTime,
      paymentProgressPct: revenueReconciliations.paymentProgressPct,
      pmgCumulativePct: revenueReconciliations.pmgCumulativePct,
      cdtBonusSale: revenueReconciliations.cdtBonusSale,
      cdtBonusManager: revenueReconciliations.cdtBonusManager,
    }).from(revenueReconciliations),
    db.select({
      productId: costReconciliations.productId, costType: costReconciliations.costType,
      amountPayableThisTime: costReconciliations.amountPayableThisTime,
      paymentProgressPct: costReconciliations.paymentProgressPct,
    }).from(costReconciliations),
    db.select({
      reconciliationId: paymentsIn.reconciliationId, amount: paymentsIn.amount,
    }).from(paymentsIn),
  ]);

  const appRows = computeHrChecks(
    productRows.map((p) => ({
      ...p,
      totalRevenue: p.totalRevenue == null ? null : Number(p.totalRevenue),
      otherCosts: 0,
      pmgBasePrice: Number(p.pmgBasePrice ?? 0),
      pmgSaleRate: Number(p.pmgSaleRate ?? 0),
      pmgRate: Number(p.pmgRate ?? 0),
      adminFeeSale: Number(p.adminFeeSale ?? 0),
      customerSupport: Number(p.customerSupport ?? 0),
      saleCommissionRate: Number(p.saleCommissionRate ?? 0),
      kpiCeoRate: Number(p.kpiCeoRate ?? 0),
      kpiTpkdRate: Number(p.kpiTpkdRate ?? 0),
      kpiAdminRate: Number(p.kpiAdminRate ?? 0),
      bonusSale: Number(p.bonusSale ?? 0),
      bonusManager: Number(p.bonusManager ?? 0),
      cdtBonusSale: Number(p.cdtBonusSale ?? 0),
      cdtBonusManager: Number(p.cdtBonusManager ?? 0),
    })),
    revRows.map((r) => ({
      id: r.id, productId: r.productId, invoiceId: r.invoiceId,
      totalReceivableThisTime: Number(r.totalReceivableThisTime ?? 0),
      revenueThisTime: Number(r.revenueThisTime ?? 0),
      paymentProgressPct: Number(r.paymentProgressPct ?? 0),
      pmgCumulativePct: Number(r.pmgCumulativePct ?? 0),
      cdtBonusSale: Number(r.cdtBonusSale ?? 0),
      cdtBonusManager: Number(r.cdtBonusManager ?? 0),
    })),
    costRows.map((c) => ({
      productId: c.productId, costType: c.costType,
      amountPayableThisTime: Number(c.amountPayableThisTime ?? 0),
      paymentProgressPct: Number(c.paymentProgressPct ?? 0),
    })),
    payRows.filter((p) => p.reconciliationId !== null).map((p) => ({
      reconciliationId: p.reconciliationId as number,
      amount: Number(p.amount ?? 0),
    })),
  );

  const productMeta = new Map(productRows.map((p) => [`${p.unitCode}|${p.projectName}`, p]));
  const appByKey = new Map(appRows.map((a) => [`${a.unitCode}|${a.projectName ?? ""}`, a]));

  const close = (f: HrCheckField, a: number, e: number) =>
    Math.abs(a - e) < (PERCENT_FIELDS.has(f) ? 0.005 : 5000);

  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log("  15 MISMATCH CÒN LẠI — cần verify với Kim/HR để đạt 100%");
  console.log("═══════════════════════════════════════════════════════════════════════════════");

  for (const f of FIELDS) {
    const mismatches: Array<{ key: string; excel: number; app: number; diff: number }> = [];
    for (const [k, excelVals] of excelByKey) {
      const app = appByKey.get(k);
      if (!app) continue;
      const e = excelVals[f];
      const a = app.values[f];
      if (close(f, a, e)) continue;
      mismatches.push({ key: k, excel: e, app: a, diff: a - e });
    }
    if (mismatches.length === 0) continue;

    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║ ${f}. ${mismatches.length} căn mismatch`);
    console.log(`╚══════════════════════════════════════════════╝`);
    mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    for (const m of mismatches) {
      const [unit, proj] = m.key.split("|");
      const p = productMeta.get(m.key);
      console.log(`\n  🏠 ${unit} · ${proj}`);
      console.log(`     Excel = ${fmt(m.excel).padStart(14)}  |  App = ${fmt(m.app).padStart(14)}  |  Δ = ${fmt(m.diff).padStart(14)}`);

      if (f === "Y") {
        // Y = totalRevenue - SUM(rec.totalReceivable)
        const totalRev = Number(p?.totalRevenue ?? 0);
        console.log(`     product.totalRevenue = ${fmt(totalRev)}`);
        console.log(`     Suspect: totalRevenue trong DB không khớp Excel col F (${fmt(totalRev + m.excel - m.excel)}).`);
        console.log(`     → Action: Kim verify Total DT gồm VAT của căn này (Excel col F, sheet 3).`);
      } else if (f === "AA") {
        console.log(`     Config: pmgBase=${fmt(Number(p?.pmgBasePrice ?? 0))}, pmgSaleRate=${p?.pmgSaleRate}, commRate=${p?.saleCommissionRate}`);
        console.log(`     Config: adminFeeSale=${fmt(Number(p?.adminFeeSale ?? 0))}, customerSupport=${fmt(Number(p?.customerSupport ?? 0))}`);
        console.log(`     Config: cdtBonusSale=${fmt(Number(p?.cdtBonusSale ?? 0))}, cdtBonusMgr=${fmt(Number(p?.cdtBonusManager ?? 0))}`);
        console.log(`     Config: kpiCeoRate=${p?.kpiCeoRate}, kpiTpkdRate=${p?.kpiTpkdRate}, kpiAdminRate=${p?.kpiAdminRate}`);
        console.log(`     Suspect: AV (CP giá vốn khác) từ sheet 2.1 col AL không import vào app.`);
        console.log(`     → Action: Kim verify sheet 2.1 col AL của căn — nếu có value, cần thêm vào config.`);
      } else if (f === "AB") {
        console.log(`     product.cdtBonusSale = ${fmt(Number(p?.cdtBonusSale ?? 0))}`);
        console.log(`     Excel AB = SUMIF sheet 2.2 col Y (CĐT thưởng sale thực tế trả) / 1.1 - SUMIF cost recon Y`);
        console.log(`     App AB = cdtBonusSale/1.1 - SUM(cost cdt_bonus_sale)`);
        console.log(`     Suspect: cdtBonusSale trong product config khác cdtBonusSale thực tế CĐT trả trong revenue recon.`);
        console.log(`     → Action: Kim verify — hoặc cdtBonusSale config sai, hoặc revenue recon cột CĐT bonus không match.`);
      } else if (f === "AI") {
        console.log(`     kpiAdminRate = ${p?.kpiAdminRate}`);
        console.log(`     Suspect: có cost recon kpi_admin nhưng amount hơi lệch.`);
        console.log(`     → Action: Kim verify KPI Admin cho căn này.`);
      }
    }
  }

  // Group by căn (căn nào bị nhiều field)
  console.log(`\n\n═══════════════════════════════════════════════════════════════════════════════`);
  console.log(`  DANH SÁCH CĂN CẦN VERIFY (tổng ${new Set([...excelByKey.keys()].filter((k) => FIELDS.some((f) => {
    const a = appByKey.get(k)?.values[f];
    const e = excelByKey.get(k)?.[f];
    return a != null && e != null && !close(f, a, e);
  }))).size} căn unique)`);
  console.log(`═══════════════════════════════════════════════════════════════════════════════`);
  const byUnit = new Map<string, HrCheckField[]>();
  for (const f of FIELDS) {
    for (const [k, ev] of excelByKey) {
      const app = appByKey.get(k);
      if (!app) continue;
      if (close(f, app.values[f], ev[f])) continue;
      const arr = byUnit.get(k) ?? [];
      arr.push(f);
      byUnit.set(k, arr);
    }
  }
  for (const [k, fields] of [...byUnit.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const [unit, proj] = k.split("|");
    console.log(`  ${unit.padEnd(15)} · ${proj.padEnd(30)} · fields: ${fields.join(", ")}`);
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
