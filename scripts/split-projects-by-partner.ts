/**
 * Split projects theo (project × partner) từ sheet 2.2_Doanh thu.
 *
 * Vấn đề: 1 dự án (vd Emerald Garden View) có thể được phân phối qua
 * nhiều F1 khác nhau với biểu phí khác nhau (Dataloca 2025, Dataloca 2026,
 * Vạn Xuân 2026, Zland 2026). Schema hiện tại 1 project → 1 partner nên
 * cần tạo nhiều project rows.
 *
 * Steps:
 *   1. Đọc sheet 2.2 → map (unitCode + projectName) → partnerName (mỗi
 *      căn dùng partner từ Excel; nếu conflict giữa các row, dùng row đầu)
 *   2. Ensure partners exist (create với type=f1 nếu chưa có)
 *   3. Ensure project rows exist cho mỗi (projectName × partnerName)
 *      combination — tạo mới với fullCode = projectCode_partnerCode
 *   4. Update products.projectId về đúng project
 */
import * as XLSX from "xlsx";
import path from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import { eq, and } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const toStr = (v: unknown): string => (v == null ? "" : String(v).trim());

// Slug partner name → mã ngắn viết hoa, bỏ dấu
const partnerCodeOf = (name: string): string => {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase();
  // Lấy các chữ đầu của mỗi từ + 2 chữ số cuối nếu có
  const words = clean.split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join("");
  const yearMatch = clean.match(/20(\d{2})/);
  return yearMatch ? `${initials.replace(/\d/g, "")}${yearMatch[1]}` : initials.slice(0, 4);
};

const normalizeUnit = (s: string): string => s.trim().replace(/[.\-\s]/g, "");

async function main() {
  const wb = XLSX.readFile(
    path.join(process.cwd(), "BAO CAO DOANH THU - New.xlsx"),
    { cellDates: true, cellNF: false },
  );
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.2_Doanh thu"], {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  // Step 1: Build (unitNorm + projectName) → partnerName from sheet 2.2
  const canonicalPartner = new Map<string, { unitCode: string; project: string; partner: string }>();
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const unit = toStr(r[7]);
    const project = toStr(r[8]);
    const partner = toStr(r[9]);
    if (!unit || !project || !partner) continue;
    // Skip note rows
    if (unit.length > 30) continue;
    const key = `${project}|${normalizeUnit(unit)}`;
    if (!canonicalPartner.has(key)) {
      canonicalPartner.set(key, { unitCode: unit, project, partner });
    }
  }
  console.log(`Built ${canonicalPartner.size} (unit × project) → partner mappings`);

  // Load existing partners
  const partnerByName = new Map<string, number>();
  const existingPartners = await db.select().from(schema.partners);
  for (const p of existingPartners) partnerByName.set(p.name.trim(), p.id);

  // Step 2: Ensure partners exist
  const uniquePartners = new Set<string>();
  for (const v of canonicalPartner.values()) uniquePartners.add(v.partner);

  const createdPartners: string[] = [];
  for (const name of uniquePartners) {
    if (!partnerByName.has(name)) {
      const code = partnerCodeOf(name);
      const [inserted] = await db
        .insert(schema.partners)
        .values({ code, name, type: "f1" })
        .returning({ id: schema.partners.id });
      partnerByName.set(name, inserted.id);
      createdPartners.push(`${name} (code=${code}, id=${inserted.id})`);
    }
  }
  console.log(`\nCreated ${createdPartners.length} new partners:`);
  for (const p of createdPartners) console.log(`  - ${p}`);

  // Step 3: Load existing projects, build (name × partner) → project id
  const projectByKey = new Map<string, { id: number; fullCode: string }>();
  const existingProjects = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      partnerId: schema.projects.partnerId,
      fullCode: schema.projects.fullCode,
      code: schema.projects.code,
    })
    .from(schema.projects);
  for (const p of existingProjects) {
    projectByKey.set(`${p.name}|${p.partnerId ?? ""}`, { id: p.id, fullCode: p.fullCode });
  }
  const projectCodeByName = new Map<string, string>();
  for (const p of existingProjects) projectCodeByName.set(p.name, p.code);

  // Determine which (project × partner) combos need to be created
  const uniqueCombos = new Set<string>();
  for (const v of canonicalPartner.values()) {
    uniqueCombos.add(`${v.project}|${v.partner}`);
  }

  const createdProjects: string[] = [];
  for (const combo of uniqueCombos) {
    const [projectName, partnerName] = combo.split("|");
    const partnerId = partnerByName.get(partnerName)!;
    const key = `${projectName}|${partnerId}`;
    if (projectByKey.has(key)) continue;

    // Need to create new project row
    const projectCode = projectCodeByName.get(projectName);
    if (!projectCode) {
      console.warn(`  ⚠ Không tìm thấy project code cho "${projectName}", skip.`);
      continue;
    }
    const partnerCode = partnerCodeOf(partnerName);
    // Bump suffix nếu fullCode trùng
    let fullCode = `${projectCode}_${partnerCode}`;
    let attempt = 1;
    while (true) {
      const exists = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.fullCode, fullCode));
      if (exists.length === 0) break;
      attempt++;
      fullCode = `${projectCode}_${partnerCode}${attempt}`;
    }

    // Copy config from existing project of same name (if any)
    const template = existingProjects.find((p) => p.name === projectName);
    const [inserted] = await db
      .insert(schema.projects)
      .values({
        code: projectCode,
        fullCode,
        name: projectName,
        partnerId,
        breRole: "f2", // Sàn F1 phân phối → BRE là F2
        contractStatus: "da_ky",
      })
      .returning({ id: schema.projects.id });
    projectByKey.set(key, { id: inserted.id, fullCode });
    createdProjects.push(`${projectName} × ${partnerName} → ${fullCode} (id=${inserted.id})`);
  }
  console.log(`\nCreated ${createdProjects.length} new project rows:`);
  for (const p of createdProjects) console.log(`  - ${p}`);

  // Step 4: Update products.projectId
  const dbProducts = await db
    .select({
      id: schema.products.id,
      unitCode: schema.products.unitCode,
      currentProjectId: schema.products.projectId,
    })
    .from(schema.products);
  const productByUnitProject = new Map<string, { id: number; currentProjectId: number }>();
  for (const p of dbProducts) {
    // Look up product's current project name
    const currProj = existingProjects.find((ep) => ep.id === p.currentProjectId);
    if (!currProj) continue;
    const key = `${currProj.name}|${normalizeUnit(p.unitCode)}`;
    productByUnitProject.set(key, { id: p.id, currentProjectId: p.currentProjectId });
  }

  let updated = 0;
  let unchanged = 0;
  let notFound = 0;
  for (const [key, v] of canonicalPartner) {
    const prod = productByUnitProject.get(key);
    if (!prod) {
      notFound++;
      continue;
    }
    const partnerId = partnerByName.get(v.partner)!;
    const targetProject = projectByKey.get(`${v.project}|${partnerId}`);
    if (!targetProject) continue;
    if (prod.currentProjectId === targetProject.id) {
      unchanged++;
      continue;
    }
    await db
      .update(schema.products)
      .set({ projectId: targetProject.id })
      .where(eq(schema.products.id, prod.id));
    updated++;
  }
  console.log(
    `\nUpdated ${updated} products (unchanged=${unchanged}, not found=${notFound})`,
  );

  await client.end();
  console.log("\nDone.");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
