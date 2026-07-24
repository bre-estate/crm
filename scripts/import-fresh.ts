/**
 * Fresh import từ BAO CAO DOANH THU.xlsx.
 *
 * DEFAULT: WIPE + INSERT products/revenue/cost/payments/invoices; giữ partners/projects/departments/pmg_tiers.
 * --full : WIPE luôn partners + projects + pmg_tiers + activity_logs + product_adjustments;
 *          GIỮ departments (script lookup by name — nếu Excel có dept mới sẽ auto-create).
 *          GIỮ users/profiles/company_settings/company_expenses/company_investments.
 *
 * Run: npx tsx scripts/import-fresh.ts                 # dry-run (partial wipe)
 *      npx tsx scripts/import-fresh.ts --apply         # execute (partial wipe)
 *      npx tsx scripts/import-fresh.ts --full          # dry-run (full wipe)
 *      npx tsx scripts/import-fresh.ts --full --apply  # execute (full wipe)
 */
import * as XLSX from "xlsx";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const XLSX_PATH = "/Users/trietnguyen/Documents/Company/BRE/App/CRM/BAO CAO DOANH THU.xlsx";
const APPLY = process.argv.includes("--apply");
const FULL_WIPE = process.argv.includes("--full");

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const excelDate = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    const dt = new Date(ms);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
};

const toNum = (v: unknown): number => {
  if (v == null || v === "") return 0;
  // Excel cell với format công thức chia có thể có phần thập phân (VD 37414177.31).
  // VND không dùng cent → floor về integer để tránh accumulation errors.
  if (typeof v === "number") return Number.isFinite(v) ? Math.floor(v) : 0;
  const s = String(v).trim();
  if (!s) return 0;
  // fallthrough parse below
  return parseVNString(s);
};

/**
 * Parse rate/pct từ Excel giữ nguyên decimal (0.0575, 0.65, ...).
 * KHÔNG floor như toNum vì rate fraction < 1 sẽ mất về 0.
 * Excel lưu %PMG_LK dưới dạng 0.0575 (5.75%). DB cũng lưu decimal.
 */
const toRate = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  // "5.75%" / "5,75%" → 0.0575; "0.0575" → 0.0575
  const clean = s.replace(/[%\s]/g, "").replace(/,/g, ".");
  const n = Number(clean);
  if (!Number.isFinite(n)) return 0;
  return s.includes("%") ? n / 100 : n;
};

function parseVNString(s: string): number {
  // String với separator (thousand/decimal) — smart parse tránh strip nhầm
  // dấu thập phân thành concat digits (bug ×100).
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart = s;
  if (lastComma > lastDot) {
    const after = s.length - lastComma - 1;
    if (after >= 1 && after <= 2 && /^\d+$/.test(s.slice(lastComma + 1))) {
      intPart = s.substring(0, lastComma);
    }
  } else if (lastDot > lastComma) {
    const after = s.length - lastDot - 1;
    if (after >= 1 && after <= 2 && /^\d+$/.test(s.slice(lastDot + 1))) {
      intPart = s.substring(0, lastDot);
    }
  }
  const digits = intPart.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
};

const toStr = (v: unknown): string => (v == null ? "" : String(v).trim());
const norm = (s: string): string => s.replace(/\s+/g, " ").trim();
const toTitleCase = (v: string): string =>
  v.trim().toLowerCase().replace(/(^|\s|-)([\p{L}])/gu, (_m, sep, ch) => sep + ch.toUpperCase());
const normUnit = (s: string): string => s.replace(/[.\-\s]/g, "").toLowerCase();

const parsePhase = (v: unknown): number | null => {
  const s = toStr(v);
  const m = s.match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);

  const partners = await db.select().from(schema.partners);
  const projects = await db
    .select({ id: schema.projects.id, name: schema.projects.name, fullCode: schema.projects.fullCode, partnerId: schema.projects.partnerId })
    .from(schema.projects);
  const depts = await db.select().from(schema.departments);
  const partnerByName = new Map(partners.map((p) => [p.name, p.id]));
  // Project lookup by (projectName × partnerId) — mỗi hợp đồng CĐT khác nhau =
  // 1 project riêng dù cùng tên dự án (VD: Emerald Garden View × Dataloca 2025
  // vs Emerald Garden View × Zland 2026).
  const projectByPair = new Map<string, number>();
  for (const p of projects) {
    projectByPair.set(`${p.name}|${p.partnerId}`, p.id);
  }
  const deptByName = new Map(depts.map((d) => [d.name.toLowerCase(), d.id]));
  const partnerCodes = new Set(partners.map((p) => p.code));
  const projectFullCodes = new Set(projects.map((p) => p.fullCode));
  console.log(`DB: ${partners.length} partners, ${projects.length} projects, ${depts.length} depts`);

  // Extract 4-char code prefix from productCode like "FENI_DXFE_C.05.01" → { project: "FENI", partner: "DXFE" }
  const extractCodes = (maSP: string): { projCode: string; partnerCode: string } | null => {
    const parts = maSP.split("_");
    if (parts.length < 2) return null;
    return { projCode: parts[0], partnerCode: parts[1] };
  };

  const ensurePartner = async (name: string, code: string): Promise<number> => {
    let id = partnerByName.get(name);
    if (id) return id;
    let uniqueCode = code;
    let n = 2;
    while (partnerCodes.has(uniqueCode)) {
      uniqueCode = `${code}${n++}`;
    }
    if (APPLY) {
      const [ins] = await db
        .insert(schema.partners)
        .values({ code: uniqueCode, name, type: "cdt" })
        .returning({ id: schema.partners.id });
      id = ins.id;
    } else {
      id = -1; // placeholder for dry-run
    }
    partnerByName.set(name, id);
    partnerCodes.add(uniqueCode);
    console.log(`  + Created partner: "${name}" (code=${uniqueCode})`);
    return id;
  };

  const ensureProject = async (name: string, projCode: string, partnerCode: string, partnerId: number): Promise<number> => {
    // Lookup theo (name × partnerId) — cùng tên dự án nhưng khác partner = 2 project riêng
    let id = projectByPair.get(`${name}|${partnerId}`);
    if (id) return id;
    const fullCode = `${projCode}_${partnerCode}`;
    let uniqueFull = fullCode;
    let n = 2;
    while (projectFullCodes.has(uniqueFull)) {
      uniqueFull = `${fullCode}${n++}`;
    }
    if (APPLY) {
      const [ins] = await db
        .insert(schema.projects)
        .values({ code: projCode, fullCode: uniqueFull, name, partnerId })
        .returning({ id: schema.projects.id });
      id = ins.id;
    } else {
      id = -1;
    }
    projectByPair.set(`${name}|${partnerId}`, id);
    projectFullCodes.add(uniqueFull);
    console.log(`  + Created project: "${name}" (fullCode=${uniqueFull}, partnerId=${partnerId})`);
    return id;
  };

  // Phase 0: Wipe
  console.log(`\n== ${APPLY ? "Wiping" : "(dry-run) Would wipe"} ${FULL_WIPE ? "FULL" : "partial"} ==`);
  if (APPLY) {
    await db.delete(schema.paymentsOut);
    await db.delete(schema.paymentsIn);
    await db.delete(schema.costReconciliations);
    await db.delete(schema.revenueReconciliations);
    await db.delete(schema.invoices);
    await db.delete(schema.productAdjustments);
    await db.delete(schema.products);
    console.log("  ✅ Wiped 7 core tables");
    if (FULL_WIPE) {
      await db.delete(schema.pmgTiers);
      await db.delete(schema.projects);
      await db.delete(schema.partners);
      await db.delete(schema.activityLogs);
      console.log("  ✅ Wiped 4 config tables (partners, projects, pmg_tiers, activity_logs)");
      // Sau khi wipe, reload các Map lookup rỗng
      partnerByName.clear();
      partnerCodes.clear();
      projectByPair.clear();
      projectFullCodes.clear();
    }
  }

  // ================= Phase 1: PRODUCTS (Sheet 2.1) =================
  console.log("\n== Sheet 2.1 → products ==");
  const ws21 = wb.Sheets["2.1_TT DU AN"];
  const rows21 = XLSX.utils.sheet_to_json<any[]>(ws21, { header: 1, defval: null });

  const productMap = new Map<string, number>(); // productCode + normUnit → productId
  let productCount = 0;
  const missingProjects = new Set<string>();
  const missingPartners = new Set<string>();
  const skipped: string[] = [];

  for (let i = 5; i < rows21.length; i++) {
    const r = rows21[i];
    if (!r || !r[0]) continue;
    const maSP = toStr(r[1]);
    const maCan = toStr(r[2]);
    if (!maCan || !maSP) continue;
    // Skip fake "căn thưởng" (thưởng booking chung, không phải căn thật)
    if (/thưởng|thuong/i.test(maCan)) continue;

    const duAn = toStr(r[3]);
    const doiTac = toStr(r[4]);
    const codes = extractCodes(maSP);
    if (!codes) {
      skipped.push(`row ${i + 1}: cannot parse code from "${maSP}"`);
      continue;
    }
    const partnerId = doiTac ? await ensurePartner(doiTac, codes.partnerCode) : null;
    if (!partnerId) {
      skipped.push(`row ${i + 1}: no partner for ${maSP}`);
      continue;
    }
    const projectId = await ensureProject(duAn, codes.projCode, codes.partnerCode, partnerId);

    const deptName = toStr(r[8]);
    const deptId = deptByName.get(deptName.toLowerCase()) ?? null;

    if (APPLY) {
      const [ins] = await db
        .insert(schema.products)
        .values({
          productCode: maSP,
          unitCode: maCan,
          projectId,
          customerName: toStr(r[5]) || null,
          unitDescription: toStr(r[6]) || null,
          salesPerson: toStr(r[7]) ? toTitleCase(toStr(r[7])) : null,
          deptLeaderName: toStr(r[9]) ? toTitleCase(toStr(r[9])) : null,
          deptName: deptName || null,
          departmentId: deptId,
          depositDate: excelDate(r[10]),
          expectedCompleteDate: excelDate(r[13]),
          paymentMethod: toStr(r[14]) || null,
          saleType: "primary",
          sellPrice: toNum(r[15]),
          totalRevenue: toNum(r[15]),
          totalCost: toNum(r[17]),
          pmgBasePrice: toNum(r[19]),
          pmgRate: toRate(r[20]),
          otherFeePct: toRate(r[21]),
          otherRevenue: toNum(r[22]),
          revenueReduction: toNum(r[23]),
          adminFee: toNum(r[24]),
          cdtBonusSale: toNum(r[26]),
          cdtBonusManager: toNum(r[27]),
          pmgSaleRate: toRate(r[28]),
          saleCommissionRate: toRate(r[29]),
          adminFeeSale: toNum(r[30]),
          customerSupport: toNum(r[31]),
          bonusSale: toNum(r[32]),
          bonusManager: toNum(r[33]),
          kpiCeoRate: toRate(r[34]),
          kpiTpkdRate: toRate(r[35]),
          kpiAdminRate: toRate(r[36]),
          otherCost: toNum(r[37]),
          note: [toStr(r[25]), toStr(r[38])].filter(Boolean).join(" | ") || null,
        })
        .returning({ id: schema.products.id });
      productMap.set(maSP, ins.id);
      productMap.set(normUnit(maCan), ins.id);
    } else {
      productMap.set(maSP, i); // fake for dry-run
      productMap.set(normUnit(maCan), i);
    }
    productCount++;
  }

  console.log(`  ${APPLY ? "Inserted" : "Would insert"}: ${productCount} products`);
  if (skipped.length) console.log(`  Skipped: ${skipped.length}`);
  if (missingProjects.size) console.log(`  Missing projects: ${[...missingProjects].join(", ")}`);
  if (missingPartners.size) console.log(`  Missing partners: ${[...missingPartners].join(", ")}`);

  // ================= Phase 2: REVENUE (Sheet 2.2) =================
  console.log("\n== Sheet 2.2 → revenue_reconciliations + payments_in ==");
  const ws22 = wb.Sheets["2.2_Doanh thu"];
  const rows22 = XLSX.utils.sheet_to_json<any[]>(ws22, { header: 1, defval: null });

  let revCount = 0;
  let payInCount = 0;
  let revSkip = 0;
  const revSkipList: string[] = [];

  for (let i = 5; i < rows22.length; i++) {
    const r = rows22[i];
    if (!r || !r[0]) continue;
    const maSP = toStr(r[6]);
    const maCan = toStr(r[7]);
    let productId = productMap.get(maSP) ?? productMap.get(normUnit(maCan));
    if (!productId) {
      revSkip++;
      if (revSkipList.length < 10) revSkipList.push(`row ${i + 1}: ${maSP} / ${maCan}`);
      continue;
    }

    const reconDate = excelDate(r[1]);
    const totalRec = toNum(r[26]);
    const payDate = excelDate(r[27]);
    const payAmt = toNum(r[28]);
    const invDate = excelDate(r[3]);
    const invNum = toStr(r[4]);
    const invValue = toNum(r[5]) || totalRec;

    // Get or create invoice khi có Số Inv + Ngày Inv
    let invoiceId: number | null = null;
    if (APPLY && invNum && invDate) {
      // Lookup partnerId từ project của product
      const [proj] = await db
        .select({ partnerId: schema.projects.partnerId })
        .from(schema.products)
        .leftJoin(schema.projects, sql`${schema.projects.id} = ${schema.products.projectId}`)
        .where(sql`${schema.products.id} = ${productId}`);
      const partnerId = proj?.partnerId ?? null;
      // Dedupe theo (number + date + partner)
      const existing = await db
        .select({ id: schema.invoices.id })
        .from(schema.invoices)
        .where(
          sql`${schema.invoices.invoiceNumber} = ${invNum} AND ${schema.invoices.invoiceDate} = ${invDate} AND ${partnerId != null ? sql`${schema.invoices.partnerId} = ${partnerId}` : sql`${schema.invoices.partnerId} IS NULL`}`,
        );
      if (existing.length > 0) {
        invoiceId = existing[0].id;
      } else {
        const [ins] = await db
          .insert(schema.invoices)
          .values({
            invoiceNumber: invNum,
            invoiceDate: invDate,
            partnerId,
            totalAmountVat: invValue,
          })
          .returning({ id: schema.invoices.id });
        invoiceId = ins.id;
      }
    }

    if (APPLY) {
      const [ins] = await db
        .insert(schema.revenueReconciliations)
        .values({
          productId,
          reconciliationDate: reconDate,
          minutesNumber: toStr(r[2]) || null,
          invoiceId,
          phaseNumber: parsePhase(r[17]),
          pmgCumulativePct: toRate(r[12]),
          pmgSupportPct: toRate(r[13]),
          otherRevenuePct: toRate(r[14]),
          phasePctThisTime: toRate(r[15]),
          pmgBasePrice: toNum(r[11]),
          adminFeeVat: toNum(r[16]),
          revenueProgressCumulative: toNum(r[18]),
          revenueThisTime: toNum(r[20]),
          revenueReceivable: toNum(r[19]),
          revenueRemaining: toNum(r[21]),
          revenueOffProgress: toNum(r[22]),
          revenueReduction: toNum(r[23]),
          cdtBonusSale: toNum(r[24]),
          cdtBonusManager: toNum(r[25]),
          totalReceivableThisTime: totalRec,
        })
        .returning({ id: schema.revenueReconciliations.id });
      revCount++;

      if (payDate || payAmt > 0) {
        await db.insert(schema.paymentsIn).values({
          reconciliationId: ins.id,
          paymentDate: payDate,
          amount: payAmt,
        });
        payInCount++;
      }
    } else {
      revCount++;
      if (payDate || payAmt > 0) payInCount++;
    }
  }
  console.log(`  ${APPLY ? "Inserted" : "Would insert"}: ${revCount} revenue recons, ${payInCount} payments_in`);
  if (revSkip) {
    console.log(`  Skipped ${revSkip}:`);
    revSkipList.forEach((s) => console.log(`    ${s}`));
  }

  // ================= Phase 3: COSTS (Sheet 2.3) =================
  console.log("\n== Sheet 2.3 → cost_reconciliations + payments_out ==");
  const ws23 = wb.Sheets["2.3_Gia von"];
  const rows23 = XLSX.utils.sheet_to_json<any[]>(ws23, { header: 1, defval: null });

  // Cost type mapping: (excel col idx for amount, DB costType)
  const componentDefs: Array<{ col: number; type: schema.NewCostReconciliation["costType"]; rateCol?: number }> = [
    { col: 21, type: "sale_commission", rateCol: 15 }, // V (PMG phai tra dot nay), P (%HH sale)
    { col: 24, type: "cdt_bonus_sale" }, // Y
    { col: 25, type: "cdt_bonus_manager" }, // Z
    { col: 26, type: "bonus_sale" }, // AA
    { col: 27, type: "bonus_manager" }, // AB
    { col: 31, type: "kpi_ceo", rateCol: 28 }, // AF, AC
    { col: 35, type: "kpi_tpkd", rateCol: 32 }, // AJ, AG
    { col: 37, type: "kpi_admin", rateCol: 36 }, // AL, AK
    { col: 23, type: "customer_support" }, // X (Chi ho tro khach)
  ];

  let costCount = 0;
  let payOutCount = 0;
  let costSkip = 0;
  const costSkipList: string[] = [];

  for (let i = 4; i < rows23.length; i++) {
    const r = rows23[i];
    if (!r || !r[0]) continue;
    const maSP = toStr(r[3]);
    const maCan = toStr(r[4]);
    let productId = productMap.get(maSP) ?? productMap.get(normUnit(maCan));
    if (!productId) {
      costSkip++;
      if (costSkipList.length < 10) costSkipList.push(`row ${i + 1}: ${maSP} / ${maCan}`);
      continue;
    }

    const reconDate = excelDate(r[1]);
    const employeeName = toTitleCase(norm(toStr(r[2])));
    if (!employeeName) {
      costSkip++;
      continue;
    }
    const payDate = excelDate(r[39]);
    const payAmt = toNum(r[40]);
    const totalAM = toNum(r[38]);
    if (totalAM === 0 && payAmt === 0) continue;

    for (const def of componentDefs) {
      const amount = toNum(r[def.col]);
      if (amount === 0) continue;

      if (APPLY) {
        const [ins] = await db
          .insert(schema.costReconciliations)
          .values({
            productId,
            reconciliationDate: reconDate,
            employeeName,
            costType: def.type,
            pmgBasePriceSale: toNum(r[11]),
            pmgLkSaleRate: toRate(r[12]),
            pmgCumulativePctSale: toRate(r[14]),
            commissionRate: def.type === "sale_commission" ? toRate(r[15]) : 0,
            adminFeeSale: def.type === "sale_commission" ? toNum(r[16]) : 0,
            customerSupport: def.type === "customer_support" ? amount : 0,
            fiscalYear: toNum(r[18]) || null,
            pmgReconciledCumulative: def.type === "sale_commission" ? toNum(r[19]) : 0,
            pmgThisTime: def.type === "sale_commission" ? toNum(r[20]) : 0,
            pmgPayable: def.type === "sale_commission" ? toNum(r[21]) : 0,
            pmgRemaining: def.type === "sale_commission" ? toNum(r[22]) : 0,
            kpiRate: def.rateCol && def.type.startsWith("kpi_") ? toRate(r[def.rateCol]) : 0,
            kpiAmount: def.type.startsWith("kpi_") ? amount : 0,
            amountPayableThisTime: amount,
          })
          .returning({ id: schema.costReconciliations.id });
        costCount++;

        if (payDate) {
          await db.insert(schema.paymentsOut).values({
            costReconciliationId: ins.id,
            paymentDate: payDate,
            amount,
          });
          payOutCount++;
        }
      } else {
        costCount++;
        if (payDate) payOutCount++;
      }
    }
  }
  console.log(`  ${APPLY ? "Inserted" : "Would insert"}: ${costCount} cost recons, ${payOutCount} payments_out`);
  if (costSkip) {
    console.log(`  Skipped ${costSkip}:`);
    costSkipList.forEach((s) => console.log(`    ${s}`));
  }

  console.log(`\n${APPLY ? "✅ APPLIED" : "\n(dry-run — add --apply to execute)"}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
