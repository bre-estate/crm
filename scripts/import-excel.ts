import * as XLSX from "xlsx";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const EXCEL_PATH = path.join(process.cwd(), "BAO CAO DOANH THU.xlsx");

if (!fs.existsSync(EXCEL_PATH)) {
  console.error("Excel file not found:", EXCEL_PATH);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL chưa set. Copy .env.example -> .env.local, điền thông tin Supabase.");
  process.exit(1);
}

const client = postgres(connectionString, { prepare: false });
const db = drizzle(client, { schema });

console.log("Reading Excel...");
const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true, cellNF: false });

function sheetToArray(name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet not found: ${name}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/[^\d.-]/g, ""));
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const toStr = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  return String(v).trim();
};

const toDateStr = (v: unknown): string => {
  if (!v) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? "20" + m[3] : m[3];
      const month = m[1].padStart(2, "0");
      const day = m[2].padStart(2, "0");
      return `${y}-${month}-${day}`;
    }
    return v.trim();
  }
  return String(v);
};

async function main() {
  console.log("Clearing existing data...");
  await db.delete(schema.paymentsOut);
  await db.delete(schema.paymentsIn);
  await db.delete(schema.costReconciliations);
  await db.delete(schema.revenueReconciliations);
  await db.delete(schema.invoices);
  await db.delete(schema.products);
  await db.delete(schema.pmgTiers);
  await db.delete(schema.projects);
  await db.delete(schema.partners);

  // ============ 1. PARTNERS (9_DANH MUC) ============
  console.log("\n=== Importing partners from 9_DANH MUC ===");
  const dmRows = sheetToArray("9_DANH MUC");
  const projectCodeMap = new Map<string, string>();
  const partnerCodeMap = new Map<string, string>();
  for (let i = 2; i < dmRows.length; i++) {
    const row = dmRows[i];
    if (!row) continue;
    const projName = toStr(row[0]);
    const projCode = toStr(row[1]);
    const partnerName = toStr(row[2]);
    const partnerCode = toStr(row[3]);
    if (projName && projCode) projectCodeMap.set(projName, projCode);
    if (partnerName && partnerCode) partnerCodeMap.set(partnerName, partnerCode);
  }
  console.log(`  Found ${projectCodeMap.size} project codes, ${partnerCodeMap.size} partner codes`);

  const partnerIdByCode = new Map<string, number>();
  for (const [name, code] of partnerCodeMap) {
    let type: "cdt" | "f1" | "f2" = "cdt";
    const lowered = name.toLowerCase();
    if (
      lowered.includes("dkrs") ||
      lowered.includes("dataloca") ||
      lowered.includes("t&a") ||
      lowered.includes("bamland") ||
      lowered.includes("dxmd") ||
      lowered.includes("oplus")
    ) {
      type = "f1";
    }
    const [r] = await db
      .insert(schema.partners)
      .values({ code, name, type })
      .returning({ id: schema.partners.id });
    partnerIdByCode.set(code, r.id);
  }
  console.log(`  Inserted ${partnerIdByCode.size} partners`);

  // ============ 2. PROJECTS (1_HOP DONG) ============
  console.log("\n=== Importing projects from 1_HOP DONG ===");
  const hdRows = sheetToArray("1_HOP DONG");
  const projectIdByFullCode = new Map<string, number>();
  let projectCount = 0;
  for (let i = 8; i < hdRows.length; i++) {
    const row = hdRows[i];
    if (!row) continue;
    const fullCode = toStr(row[1]);
    const projectName = toStr(row[2]);
    if (!fullCode || !projectName) continue;

    const parts = fullCode.split("_");
    if (parts.length < 2) continue;
    const projectCode = parts[0];
    const partnerCode = parts[1];
    const partnerId = partnerIdByCode.get(partnerCode);
    if (!partnerId) {
      console.warn(`  Skipped ${fullCode}: partner ${partnerCode} not found`);
      continue;
    }

    const contractInfo = toStr(row[4]);
    const contractStatusRaw = toStr(row[5]);
    const contractStatus: "chua_ky" | "dang_dam_phan" | "da_ky" | "ngung_hop_tac" =
      contractStatusRaw === "ĐÃ KÝ"
        ? "da_ky"
        : contractStatusRaw === "CHƯA KÝ"
          ? "chua_ky"
          : contractStatusRaw.includes("ĐÀM PHÁN")
            ? "dang_dam_phan"
            : contractStatusRaw.includes("NGỪNG")
              ? "ngung_hop_tac"
              : "chua_ky";

    const brokerageRate = toNum(row[6]);
    const bieuPmgText = toStr(row[7]);
    const brokerageRateSale = toNum(row[8]);
    const adminFee = toNum(row[9]);
    const adminFeeSale = toNum(row[10]);
    const paymentPhases = Math.round(toNum(row[11])) || 1;

    const parsePhase = (v: unknown): number => {
      if (v == null || v === "") return 0;
      if (typeof v === "number") return v;
      const s = String(v).trim();
      const m = s.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (m) return Number(m[1].replace(",", ".")) / 100;
      return toNum(v);
    };
    const phaseRate1 = parsePhase(row[12]);
    const phaseRate2 = parsePhase(row[13]);
    const phaseRate3 = parsePhase(row[14]);
    const phaseRate4 = parsePhase(row[15]);
    const phaseRate5 = parsePhase(row[16]);

    const partnerLegalName = toStr(row[24]);
    const partnerTaxCode = toStr(row[25]);
    const partnerAddr = toStr(row[26]);
    const partnerEmail = toStr(row[27]);
    const paymentDocs = toStr(row[28]);
    const ghiChu = toStr(row[29]);

    if (partnerLegalName || partnerTaxCode) {
      await db
        .update(schema.partners)
        .set({
          legalName: partnerLegalName || undefined,
          taxCode: partnerTaxCode || undefined,
          address: partnerAddr || undefined,
          email: partnerEmail || undefined,
        })
        .where(eq(schema.partners.id, partnerId));
    }

    const [inserted] = await db
      .insert(schema.projects)
      .values({
        code: projectCode,
        fullCode,
        name: projectName,
        partnerId,
        breRole: "f1",
        contractInfo,
        contractStatus,
        contractDocs: bieuPmgText ? `Biểu PMG: ${bieuPmgText}` : null,
        brokerageRate,
        brokerageRateSale,
        adminFee,
        adminFeeSale,
        paymentPhases,
        phaseRate1,
        phaseRate2,
        phaseRate3,
        phaseRate4,
        phaseRate5,
        cdtBonusSale: toNum(row[17]),
        cdtBonusManager: toNum(row[18]),
        otherFeePct: toNum(row[19]),
        otherRevenue: toNum(row[20]),
        revenueReduction: toNum(row[21]),
        ctyBonusSale: toNum(row[22]),
        ctyBonusManager: toNum(row[23]),
        paymentDocs,
        note: ghiChu,
      })
      .returning({ id: schema.projects.id });

    projectIdByFullCode.set(fullCode, inserted.id);
    projectCount++;
  }
  console.log(`  Inserted ${projectCount} projects`);

  // ============ 3. PRODUCTS (2.1_TT DU AN) ============
  console.log("\n=== Importing products from 2.1_TT DU AN ===");
  const ttRows = sheetToArray("2.1_TT DU AN");
  const productIdByCode = new Map<string, number>();
  let productCount = 0;
  for (let i = 5; i < ttRows.length; i++) {
    const row = ttRows[i];
    if (!row) continue;
    const productCode = toStr(row[1]);
    const unitCode = toStr(row[2]);
    if (!productCode || !unitCode) continue;

    const parts = productCode.split("_");
    if (parts.length < 3) continue;
    const projectFullCode = `${parts[0]}_${parts[1]}`;
    const projectId = projectIdByFullCode.get(projectFullCode);
    if (!projectId) {
      console.warn(`  Skipped product ${productCode}: project ${projectFullCode} not found`);
      continue;
    }

    const [inserted] = await db
      .insert(schema.products)
      .values({
        productCode,
        projectId,
        unitCode,
        customerName: toStr(row[5]),
        unitDescription: toStr(row[6]),
        salesPerson: toStr(row[7]),
        deptName: toStr(row[8]),
        depositDate: toDateStr(row[9]),
        expectedCompleteDate: toDateStr(row[10]),
        paymentMethod: toStr(row[11]),
        totalRevenue: toNum(row[12]),
        totalCost: toNum(row[13]),
        pmgBasePrice: toNum(row[15]),
        pmgRate: toNum(row[16]),
        otherFeePct: toNum(row[17]),
        otherRevenue: toNum(row[18]),
        revenueReduction: toNum(row[19]),
        adminFee: toNum(row[20]),
        note: toStr(row[21]),
        cdtBonusSale: toNum(row[22]),
        cdtBonusManager: toNum(row[23]),
        pmgSaleRate: toNum(row[24]),
        saleCommissionRate: toNum(row[25]),
        adminFeeSale: toNum(row[26]),
        customerSupport: toNum(row[27]),
        bonusSale: toNum(row[28]),
        bonusManager: toNum(row[29]),
        kpiCeoRate: toNum(row[30]),
        kpiTpkdRate: toNum(row[31]),
        kpiAdminRate: toNum(row[32]),
        otherCost: toNum(row[33]),
      })
      .returning({ id: schema.products.id });

    productIdByCode.set(productCode, inserted.id);
    productCount++;
  }
  console.log(`  Inserted ${productCount} products`);

  // ============ 4. REVENUE RECONCILIATIONS (2.2_Doanh thu) ============
  console.log("\n=== Importing revenue reconciliations from 2.2_Doanh thu ===");
  const dtRows = sheetToArray("2.2_Doanh thu");
  const invoiceIdByKey = new Map<string, number>();
  let revRecCount = 0;
  let invoiceCount = 0;
  let paymentInCount = 0;

  for (let i = 5; i < dtRows.length; i++) {
    const row = dtRows[i];
    if (!row) continue;
    const productCode = toStr(row[6]);
    if (!productCode) continue;
    const productId = productIdByCode.get(productCode);
    if (!productId) continue;

    const invoiceNumber = toStr(row[4]);
    const invoiceDate = toDateStr(row[3]);
    let invoiceId: number | undefined;
    if (invoiceNumber || invoiceDate) {
      const key = `${invoiceNumber}_${invoiceDate}`;
      if (invoiceIdByKey.has(key)) {
        invoiceId = invoiceIdByKey.get(key)!;
      } else {
        const [inv] = await db
          .insert(schema.invoices)
          .values({
            invoiceNumber: invoiceNumber || "(chưa có số)",
            invoiceDate: invoiceDate || null,
            totalAmountVat: toNum(row[5]),
          })
          .returning({ id: schema.invoices.id });
        invoiceId = inv.id;
        invoiceIdByKey.set(key, invoiceId);
        invoiceCount++;
      }
    }

    const phaseRaw = toStr(row[16]);
    const phaseMatch = phaseRaw.match(/(\d+)/);
    const phaseNumber = phaseMatch ? Number(phaseMatch[1]) : null;

    const [rec] = await db
      .insert(schema.revenueReconciliations)
      .values({
        productId,
        reconciliationDate: toDateStr(row[1]) || null,
        minutesNumber: toStr(row[2]),
        invoiceId: invoiceId ?? null,
        phaseNumber,
        phasePctThisTime: toNum(row[14]),
        pmgCumulativePct: toNum(row[11]),
        pmgSupportPct: toNum(row[12]),
        otherRevenuePct: toNum(row[13]),
        pmgBasePrice: toNum(row[10]),
        adminFeeVat: toNum(row[15]),
        revenueProgressCumulative: toNum(row[17]),
        revenueThisTime: toNum(row[18]),
        revenueReceivable: toNum(row[19]),
        revenueRemaining: toNum(row[20]),
        revenueOffProgress: toNum(row[21]),
        revenueReduction: toNum(row[22]),
        cdtBonusSale: toNum(row[23]),
        cdtBonusManager: toNum(row[24]),
        totalReceivableThisTime: toNum(row[25]),
      })
      .returning({ id: schema.revenueReconciliations.id });
    revRecCount++;

    const paymentDate = toDateStr(row[26]);
    const paymentAmount = toNum(row[27]);
    if (paymentDate || paymentAmount > 0) {
      await db.insert(schema.paymentsIn).values({
        reconciliationId: rec.id,
        paymentDate: paymentDate || null,
        amount: paymentAmount,
      });
      paymentInCount++;
    }
  }
  console.log(
    `  Inserted ${revRecCount} revenue reconciliations, ${invoiceCount} invoices, ${paymentInCount} payments_in`,
  );

  // ============ 5. COST RECONCILIATIONS (2.3_Gia von) ============
  console.log("\n=== Importing cost reconciliations from 2.3_Gia von ===");
  const gvRows = sheetToArray("2.3_Gia von");
  let costRecCount = 0;
  let paymentOutCount = 0;
  let costSkipped = 0;

  for (let i = 4; i < gvRows.length; i++) {
    const row = gvRows[i];
    if (!row) continue;
    const productCode = toStr(row[3]);
    const employeeName = toStr(row[2]);
    if (!productCode || !employeeName) {
      costSkipped++;
      continue;
    }
    const productId = productIdByCode.get(productCode);
    if (!productId) {
      costSkipped++;
      continue;
    }

    const csVal = toNum(row[23]);
    const bsVal = toNum(row[26]);
    const bmVal = toNum(row[27]);
    const kpiCeoRate = toNum(row[28]);
    const kpiTpkdRate = toNum(row[32]);
    const kpiAdminPct = toNum(row[36]);

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
        ? toNum(row[31])
        : costType === "kpi_tpkd"
          ? toNum(row[35])
          : costType === "kpi_admin"
            ? toNum(row[37])
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
        reconciliationDate: toDateStr(row[1]) || null,
        employeeName,
        costType,
        pmgBasePriceSale: toNum(row[11]),
        pmgLkSaleRate: toNum(row[12]),
        pmgProgressAmount: toNum(row[13]),
        pmgCumulativePctSale: toNum(row[14]),
        commissionRate: toNum(row[15]),
        adminFeeSale: toNum(row[16]),
        customerSupport: csVal,
        fiscalYear: toNum(row[18]) || null,
        pmgReconciledCumulative: toNum(row[19]),
        pmgThisTime: toNum(row[20]),
        pmgPayable: toNum(row[21]),
        pmgRemaining: toNum(row[22]),
        kpiRate,
        kpiAmount,
        amountPayableThisTime: toNum(row[38]),
      })
      .returning({ id: schema.costReconciliations.id });
    costRecCount++;

    const payDate = toDateStr(row[39]);
    const payAmount = toNum(row[40]);
    if (payDate || payAmount > 0) {
      await db.insert(schema.paymentsOut).values({
        costReconciliationId: rec.id,
        paymentDate: payDate || null,
        amount: payAmount,
      });
      paymentOutCount++;
    }
  }
  console.log(
    `  Inserted ${costRecCount} cost reconciliations, ${paymentOutCount} payments_out (skipped ${costSkipped} empty/unmapped)`,
  );

  // ============ SUMMARY ============
  console.log("\n=== SUMMARY ===");
  const counts = {
    partners: (await db.select().from(schema.partners)).length,
    projects: (await db.select().from(schema.projects)).length,
    products: (await db.select().from(schema.products)).length,
    invoices: (await db.select().from(schema.invoices)).length,
    revenueReconciliations: (await db.select().from(schema.revenueReconciliations)).length,
    paymentsIn: (await db.select().from(schema.paymentsIn)).length,
    costReconciliations: (await db.select().from(schema.costReconciliations)).length,
    paymentsOut: (await db.select().from(schema.paymentsOut)).length,
  };
  console.table(counts);
}

main()
  .then(async () => {
    await client.end();
    console.log("Done.");
  })
  .catch(async (err) => {
    console.error("Import failed:", err);
    await client.end();
    process.exit(1);
  });
