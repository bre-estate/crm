import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  const nvkds = ["Đinh Viết Hân", "Bùi Thị Kiều Chi"];
  console.log("\n═══ NVKD của 2 căn ═══");
  for (const name of nvkds) {
    const rows = await sql`
      SELECT e.id, e.name, e.position, e.department_id, d.name AS dept_name, d.code AS dept_code
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.name = ${name}
    `;
    console.log(`\n  ${name}:`);
    rows.forEach((r: any) => console.log(`    #${r.id} position=${r.position}, dept=${r.dept_name} (code=${r.dept_code}, id=${r.department_id})`));
    if (rows.length === 0) console.log(`    ⚠️  Không tìm thấy trong employees`);
  }

  console.log("\n═══ dept_name = 'Freelancer' text tự do trong products ═══");
  const legacyFreelancer = await sql`
    SELECT id, product_code, sales_person, dept_name, department_id
    FROM products
    WHERE dept_name = 'Freelancer' OR dept_name ILIKE '%freelance%' OR dept_name ILIKE '%ctv%'
    ORDER BY id DESC LIMIT 20
  `;
  legacyFreelancer.forEach((r: any) => console.log(`  #${r.id} ${r.product_code} sales=${r.sales_person} dept_name="${r.dept_name}" (department_id=${r.department_id})`));
  console.log(`  Total: ${legacyFreelancer.length}`);

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
