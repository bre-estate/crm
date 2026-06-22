/**
 * Import từ file "Theo Dõi Doanh Thu BRE.xlsx" (file mới, source of truth)
 * Sheet:
 *   - DTHU Sơ cấp  → căn primary (HĐ với CĐT/F1)
 *   - DTHU Thứ cấp → căn secondary (môi giới second-hand)
 *
 * Logic:
 *   1. Clear: products, revenue_recons, cost_recons, payments_in/out, invoices, pmg_tiers
 *   2. Seed departments (4 phòng)
 *   3. Upsert partners (lookup by name, create if missing)
 *   4. Upsert projects (lookup by name+partner, create if missing)
 *   5. Insert products (primary + secondary)
 *   6. For each căn, insert revenue_recons cho từng đợt có data (T-AC)
 *   7. Nếu NOTE = "Đã chi đủ" → insert payment_in tổng = sum receivable
 */
import * as XLSX from "xlsx";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const EXCEL_PATH = path.join(process.cwd(), "public", "Theo Dõi Doanh Thu BRE.xlsx");

if (!fs.existsSync(EXCEL_PATH)) {
  console.error("Excel file not found:", EXCEL_PATH);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL chưa set.");
  process.exit(1);
}

const client = postgres(connectionString, { prepare: false });
const db = drizzle(client, { schema });

const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true, cellNF: false });
function sheet(name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet not found: ${name}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d.-]/g, "");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};
const toStr = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const toDateStr = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).trim() || null;
};

// Auto-derive partner code from partner name (4-letter slug-ish)
function partnerCodeOf(name: string): string {
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.slice(0, 4).padEnd(4, "X");
}
function projectCodeOf(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials.slice(0, 4).padEnd(4, "X");
}

// Map phòng text from Excel → department code
function deptCodeFromText(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("hồ gia") || t.includes("ho gia")) return "HoGia";
  if (t.includes("bld") || t.includes("blđ") || t.includes("ban lãnh") || t.includes("ban lanh"))
    return "BLD";
  if (t.includes("1 tỷ") || t.includes("1 ty") || t.includes("1ty") || t.includes("một tỷ"))
    return "MotTy";
  if (t.includes("freelance")) return "Freelancer";
  return null;
}

// "2024-T10" → "2024-10"; or from K/L cols → "YYYY-MM"
function recognitionMonth(j: unknown, k: unknown, l: unknown): string | null {
  const jStr = toStr(j);
  const m = jStr.match(/^(\d{4})-T?(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  const month = toNum(k);
  const year = toNum(l);
  if (year > 1900 && month >= 1 && month <= 12) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  return null;
}

async function main() {
  console.log("=== Clearing existing data ===");
  await db.delete(schema.paymentsOut);
  await db.delete(schema.paymentsIn);
  await db.delete(schema.costReconciliations);
  await db.delete(schema.revenueReconciliations);
  await db.delete(schema.invoices);
  await db.delete(schema.products);
  await db.delete(schema.pmgTiers);
  // KEEP projects + partners (so user manual edits won't be lost — we'll upsert later)
  // For cleanliness, also reset:
  await db.delete(schema.projects);
  await db.delete(schema.partners);
  await db.delete(schema.departments);

  console.log("\n=== Seeding departments ===");
  const deptSeeds = [
    { code: "BLD", name: "Ban Lãnh Đạo", leaderName: "Đoàn Lê Bách (CEO)" },
    { code: "HoGia", name: "Phòng Hồ Gia", leaderName: "Hồ Nguyễn Công Thành" },
    { code: "MotTy", name: "Phòng 1 Tỷ", leaderName: "Lê Thị Cẩm Giang" },
    { code: "Freelancer", name: "Freelancer / Đối tác liên kết" },
  ];
  const deptIdByCode = new Map<string, number>();
  for (const d of deptSeeds) {
    const [r] = await db.insert(schema.departments).values(d).returning({ id: schema.departments.id });
    deptIdByCode.set(d.code, r.id);
  }
  console.log(`  Seeded ${deptIdByCode.size} departments`);

  // ============ Read Sơ cấp ============
  const primary = sheet("DTHU Sơ cấp");
  // headers row 4 (idx 3), data row 5+ (idx 4+)

  // Collect unique partners + projects from primary
  const partnerNames = new Set<string>();
  const projectByName = new Map<string, { partnerName: string; pmgRate: number; adminFee: number }>();
  for (let i = 4; i < primary.length; i++) {
    const row = primary[i];
    if (!row) continue;
    const unit = toStr(row[1]);
    const projName = toStr(row[2]);
    const partnerName = toStr(row[6]) || "Unknown";
    if (!unit || !projName) continue;
    partnerNames.add(partnerName);
    if (!projectByName.has(projName)) {
      projectByName.set(projName, {
        partnerName,
        pmgRate: toNum(row[4]),
        adminFee: toNum(row[15]),
      });
    }
  }

  console.log("\n=== Seeding partners ===");
  const partnerIdByName = new Map<string, number>();
  const partnerCodeByName = new Map<string, string>();
  for (const name of partnerNames) {
    const code = partnerCodeOf(name);
    const [r] = await db
      .insert(schema.partners)
      .values({ code, name, type: "cdt" })
      .returning({ id: schema.partners.id });
    partnerIdByName.set(name, r.id);
    partnerCodeByName.set(name, code);
  }
  console.log(`  Inserted ${partnerIdByName.size} partners`);

  console.log("\n=== Seeding projects ===");
  const projectIdByName = new Map<string, number>();
  const projectFullCodeByName = new Map<string, string>();
  for (const [name, info] of projectByName) {
    const partnerId = partnerIdByName.get(info.partnerName);
    if (!partnerId) continue;
    const projCode = projectCodeOf(name);
    const partnerCode = partnerCodeByName.get(info.partnerName)!;
    const fullCode = `${projCode}_${partnerCode}`;
    const [r] = await db
      .insert(schema.projects)
      .values({
        code: projCode,
        fullCode,
        name,
        partnerId,
        breRole: "f1",
        contractStatus: "da_ky",
        brokerageRate: info.pmgRate,
        adminFee: info.adminFee,
      })
      .returning({ id: schema.projects.id });
    projectIdByName.set(name, r.id);
    projectFullCodeByName.set(name, fullCode);
  }
  console.log(`  Inserted ${projectIdByName.size} projects`);

  // ============ Primary products + revenue recons ============
  console.log("\n=== Importing primary products + revenue recons ===");
  let primaryProductCount = 0;
  let primaryRecCount = 0;
  let primaryPaidCount = 0;

  for (let i = 4; i < primary.length; i++) {
    const row = primary[i];
    if (!row) continue;
    const unit = toStr(row[1]);
    const projName = toStr(row[2]);
    const partnerName = toStr(row[6]) || "Unknown";
    if (!unit || !projName) continue;

    const projectId = projectIdByName.get(projName);
    if (!projectId) continue;
    const fullCode = projectFullCodeByName.get(projName)!;
    const productCode = `${fullCode}_${unit}`;

    const phongText = toStr(row[5]);
    const deptCode = deptCodeFromText(phongText);
    const deptId = deptCode ? deptIdByCode.get(deptCode) ?? null : null;
    const recogMonth = recognitionMonth(row[9], row[10], row[11]);

    const pmgBasePrice = toNum(row[3]);
    const pmgRate = toNum(row[4]);
    const totalRevenueWithVat = toNum(row[14]);
    const adminFee = toNum(row[15]);
    const saleCommissionRate = toNum(row[18]);
    const note = toStr(row[29]);

    const [productRow] = await db
      .insert(schema.products)
      .values({
        productCode,
        projectId,
        unitCode: unit,
        salesPerson: toStr(row[7]) || null,
        deptName: phongText || null,
        departmentId: deptId,
        depositDate: toDateStr(row[8]),
        recognitionMonth: recogMonth,
        saleType: "primary",
        pmgBasePrice,
        pmgRate,
        totalRevenue: totalRevenueWithVat,
        adminFee,
        saleCommissionRate,
        note: note || null,
      })
      .returning({ id: schema.products.id });
    primaryProductCount++;

    // 5 phases: T(19)/U(20), V(21)/W(22), X(23)/Y(24), Z(25)/AA(26), AB(27)/AC(28)
    const phaseCols = [
      [19, 20],
      [21, 22],
      [23, 24],
      [25, 26],
      [27, 28],
    ];
    let totalRecvSum = 0;
    for (let p = 0; p < 5; p++) {
      const pct = toNum(row[phaseCols[p][0]]);
      const amount = toNum(row[phaseCols[p][1]]);
      if (pct === 0 && amount === 0) continue;
      await db.insert(schema.revenueReconciliations).values({
        productId: productRow.id,
        phaseNumber: p + 1,
        pmgCumulativePct: pct,
        revenueThisTime: amount,
        totalReceivableThisTime: amount,
        pmgBasePrice,
      });
      totalRecvSum += amount;
      primaryRecCount++;
    }

    // Nếu NOTE indicates đã chi đủ → tạo payment_in tổng
    if (note.toLowerCase().includes("đã chi đủ") && totalRecvSum > 0) {
      // Create one payment for the most recent recon (last phase with data)
      const recs = await db
        .select({ id: schema.revenueReconciliations.id })
        .from(schema.revenueReconciliations)
        .where(eq(schema.revenueReconciliations.productId, productRow.id));
      for (const rec of recs) {
        // Use the amount each rec received
        const [recRow] = await db
          .select({ amt: schema.revenueReconciliations.totalReceivableThisTime })
          .from(schema.revenueReconciliations)
          .where(eq(schema.revenueReconciliations.id, rec.id));
        await db.insert(schema.paymentsIn).values({
          reconciliationId: rec.id,
          amount: Number(recRow.amt ?? 0),
        });
        primaryPaidCount++;
      }
    }
  }
  console.log(
    `  Inserted ${primaryProductCount} primary products, ${primaryRecCount} recons, ${primaryPaidCount} payments`,
  );

  // ============ Secondary ============
  console.log("\n=== Importing secondary products ===");
  const secondary = sheet("DTHU Thứ cấp");
  // Ensure "Secondary Market" partner + projects exist
  let secondaryPartnerId = partnerIdByName.get("Secondary Market");
  if (!secondaryPartnerId) {
    const [r] = await db
      .insert(schema.partners)
      .values({ code: "SCND", name: "Secondary Market", type: "cdt" })
      .returning({ id: schema.partners.id });
    secondaryPartnerId = r.id;
    partnerIdByName.set("Secondary Market", r.id);
    partnerCodeByName.set("Secondary Market", "SCND");
  }

  let secondaryProductCount = 0;
  let secondaryRecCount = 0;
  for (let i = 4; i < secondary.length; i++) {
    const row = secondary[i];
    if (!row) continue;
    const unit = toStr(row[1]);
    const projName = toStr(row[2]);
    if (!unit || !projName) continue;

    // Find or create project (link to Secondary Market partner)
    let projectId = projectIdByName.get(projName);
    let fullCode = projectFullCodeByName.get(projName);
    if (!projectId) {
      const projCode = projectCodeOf(projName);
      // Bump suffix if fullCode collides (multiple secondary projects with same initials)
      let suffix = "SCND";
      let tryCode = `${projCode}_${suffix}`;
      let attempt = 1;
      while (true) {
        const existing = await db
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(eq(schema.projects.fullCode, tryCode));
        if (existing.length === 0) break;
        attempt++;
        suffix = `SCND${attempt}`;
        tryCode = `${projCode}_${suffix}`;
      }
      fullCode = tryCode;
      const [r] = await db
        .insert(schema.projects)
        .values({
          code: projCode,
          fullCode,
          name: projName,
          partnerId: secondaryPartnerId,
          breRole: "f1",
          contractStatus: "da_ky",
        })
        .returning({ id: schema.projects.id });
      projectId = r.id;
      projectIdByName.set(projName, r.id);
      projectFullCodeByName.set(projName, fullCode);
    }
    // Bump suffix if same căn appears multiple times in secondary
    let productCode = `${fullCode!}_${unit}_SEC`;
    {
      let attempt = 1;
      while (true) {
        const existing = await db
          .select({ id: schema.products.id })
          .from(schema.products)
          .where(eq(schema.products.productCode, productCode));
        if (existing.length === 0) break;
        attempt++;
        productCode = `${fullCode!}_${unit}_SEC${attempt}`;
      }
    }

    const phongText = toStr(row[4]);
    const deptCode = deptCodeFromText(phongText);
    const deptId = deptCode ? deptIdByCode.get(deptCode) ?? null : null;
    const recogMonth = recognitionMonth(row[8], null, null);

    const pmgBasePrice = toNum(row[3]);
    const totalRev = toNum(row[9]);
    const commissionRate = toNum(row[10]);
    const note = toStr(row[12]);

    const [productRow] = await db
      .insert(schema.products)
      .values({
        productCode,
        projectId,
        unitCode: unit,
        salesPerson: toStr(row[5]) || null,
        deptName: phongText || null,
        departmentId: deptId,
        depositDate: toDateStr(row[6]),
        expectedCompleteDate: toDateStr(row[7]),
        recognitionMonth: recogMonth,
        saleType: "secondary",
        pmgBasePrice,
        totalRevenue: totalRev,
        saleCommissionRate: commissionRate,
        note: note || null,
      })
      .returning({ id: schema.products.id });
    secondaryProductCount++;

    // Secondary: 1 recon with the full doanh thu
    if (totalRev > 0) {
      await db.insert(schema.revenueReconciliations).values({
        productId: productRow.id,
        phaseNumber: 1,
        revenueThisTime: totalRev,
        totalReceivableThisTime: totalRev,
        pmgBasePrice,
      });
      secondaryRecCount++;
    }
  }
  console.log(`  Inserted ${secondaryProductCount} secondary products, ${secondaryRecCount} recons`);

  // ============ Summary ============
  console.log("\n=== SUMMARY ===");
  const counts = {
    departments: (await db.select().from(schema.departments)).length,
    partners: (await db.select().from(schema.partners)).length,
    projects: (await db.select().from(schema.projects)).length,
    products: (await db.select().from(schema.products)).length,
    revenueReconciliations: (await db.select().from(schema.revenueReconciliations)).length,
    paymentsIn: (await db.select().from(schema.paymentsIn)).length,
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
