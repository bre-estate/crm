/**
 * Fix: nhiều product bị gán sai project vì import lookup by name only.
 * VD: tất cả EMGV căn dồn vào project EMGV_Z26 (Zland) thay vì phân biệt
 * theo partner (Dataloca 2025 / Dataloca 2026 / Zland 2026 / Vạn Xuân 2026).
 *
 * Fix: đọc lại Excel 2.1 → dựa vào (project name × partner name) → match DB
 * project → update product.project_id.
 */
import * as XLSX from "xlsx";
import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const wb = XLSX.readFile("/Users/trietnguyen/Documents/Company/BRE/App/CRM/BAO CAO DOANH THU.xlsx");
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["2.1_TT DU AN"], { header: 1, defval: null });

  const projs = await c`
    SELECT p.id, p.name, pt.name AS partner_name
    FROM projects p LEFT JOIN partners pt ON pt.id = p.partner_id
  `;
  // Map (project_name × partner_name) → project_id
  const projByPair = new Map<string, number>();
  for (const p of projs) {
    projByPair.set(`${p.name}|${p.partner_name}`, p.id);
  }

  const products = await c`SELECT id, product_code, unit_code, project_id FROM products`;
  const productByCode = new Map(products.map((p) => [p.product_code, p]));

  let matched = 0;
  let alreadyCorrect = 0;
  let toReassign = 0;
  let missingProject = 0;
  const reassignPlan: string[] = [];
  const missingList: string[] = [];

  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const maSP = String(r[1] ?? "").trim();
    const maCan = String(r[2] ?? "").trim();
    const duAn = String(r[3] ?? "").trim();
    const doiTac = String(r[4] ?? "").trim();
    if (!maSP || !maCan || !duAn || !doiTac) continue;

    const product = productByCode.get(maSP);
    if (!product) continue;
    matched++;

    const correctProjectId = projByPair.get(`${duAn}|${doiTac}`);
    if (!correctProjectId) {
      missingProject++;
      if (missingList.length < 10) missingList.push(`${maSP}: no project for ${duAn} × ${doiTac}`);
      continue;
    }

    if (product.project_id === correctProjectId) {
      alreadyCorrect++;
    } else {
      toReassign++;
      if (reassignPlan.length < 20)
        reassignPlan.push(
          `  ${maSP} (${maCan}): #${product.project_id} → #${correctProjectId} (${duAn} × ${doiTac})`,
        );
      if (APPLY) {
        await c`UPDATE products SET project_id = ${correctProjectId} WHERE id = ${product.id}`;
      }
    }
  }

  console.log(`\n=== Fix product → project ===`);
  console.log(`Excel rows matched with DB: ${matched}`);
  console.log(`Already correct: ${alreadyCorrect}`);
  console.log(`Reassigned: ${toReassign}`);
  console.log(`Missing project (đối tác chưa có DB): ${missingProject}`);
  if (reassignPlan.length > 0) {
    console.log(`\nSample reassign:`);
    reassignPlan.forEach((s) => console.log(s));
  }
  if (missingList.length > 0) {
    console.log(`\nMissing projects:`);
    missingList.forEach((s) => console.log(`  ${s}`));
  }
  console.log(`\n${APPLY ? "✅ APPLIED" : "(dry-run, add --apply)"}`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
