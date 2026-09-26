import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("═══ Departments 16 + 17 ═══");
  const depts = await sql`
    SELECT d.id, d.code, d.name, d.leader_name,
      (SELECT COUNT(*)::int FROM employees WHERE department_id = d.id) AS n_emp,
      (SELECT COUNT(*)::int FROM products WHERE department_id = d.id) AS n_prod
    FROM departments d WHERE d.id IN (16, 17) ORDER BY d.id
  `;
  depts.forEach((r: any) => console.log(`  #${r.id} ${r.code} "${r.name}" leader=${r.leader_name}: ${r.n_emp} nv, ${r.n_prod} căn`));

  console.log("\n═══ Nhân viên phòng CTV ═══");
  const emps = await sql`SELECT id, name, position FROM employees WHERE department_id = 17 ORDER BY id`;
  emps.forEach((r: any) => console.log(`  #${r.id} ${r.name} (${r.position})`));

  console.log("\n═══ Căn phòng CTV ═══");
  const prods = await sql`SELECT id, product_code, dept_name, sales_person FROM products WHERE department_id = 17 ORDER BY id`;
  prods.forEach((r: any) => console.log(`  #${r.id} ${r.product_code} dept_name="${r.dept_name}" NVKD=${r.sales_person}`));

  console.log("\n═══ Còn căn nào dept_name='Freelancer' text tự do không? ═══");
  const legacy = await sql`SELECT id, product_code FROM products WHERE dept_name = 'Freelancer'`;
  console.log(`  ${legacy.length} rows`);

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
