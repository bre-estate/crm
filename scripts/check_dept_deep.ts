import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("\n═══ All columns of products (searching for dept/type/kind) ═══");
  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'products'
    ORDER BY ordinal_position
  `;
  cols.forEach((r: any) => console.log(`  ${r.column_name} (${r.data_type})`));

  console.log("\n═══ Full data 2 căn ═══");
  const rows = await sql`
    SELECT * FROM products WHERE id IN (933, 943)
  `;
  for (const r of rows) {
    console.log(`\n  ▸ #${r.id} ${r.product_code}`);
    for (const [k, v] of Object.entries(r)) {
      if (v !== null && v !== 0 && v !== "" && v !== false) {
        console.log(`      ${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  console.log("\n═══ Ai là sale_person của 2 căn này? ═══");
  const salePersons = await sql`
    SELECT p.id AS product_id, p.product_code, e.id AS emp_id, e.full_name, e.department_id, d.name AS dept_name, d.code AS dept_code
    FROM products p
    LEFT JOIN employees e ON e.id = p.sale_person_id
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE p.id IN (933, 943)
  `;
  salePersons.forEach((r: any) => console.log(`  #${r.product_id} ${r.product_code}: sale=${r.full_name} (emp#${r.emp_id}) → dept "${r.dept_name}" (code=${r.dept_code})`));

  console.log("\n═══ Distinct dept_name string trong products ═══");
  const deptStr = await sql`
    SELECT dept_name, COUNT(*) AS n
    FROM products
    WHERE dept_name IS NOT NULL AND dept_name != ''
    GROUP BY dept_name
    ORDER BY n DESC
  `;
  deptStr.forEach((r: any) => console.log(`  "${r.dept_name}": ${r.n} căn`));

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
