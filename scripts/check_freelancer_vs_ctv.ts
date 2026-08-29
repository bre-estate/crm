/**
 * Điều tra 2 phòng "Freelancer" và "CTV" — user muốn gộp về 1 (CTV).
 * A-07-09 = phòng Freelancer, B-30-10 = phòng CTV.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("\n═══ 1. Bảng departments ═══");
  const depts = await sql`SELECT * FROM departments ORDER BY id`;
  depts.forEach((r: any) => console.log(`  #${r.id} ${JSON.stringify(r)}`));

  console.log("\n═══ 2. Số nhân viên mỗi department ═══");
  const empByDept = await sql`
    SELECT d.id, d.name, COUNT(e.id) AS n
    FROM departments d
    LEFT JOIN employees e ON e.department_id = d.id
    GROUP BY d.id, d.name
    ORDER BY d.id
  `;
  empByDept.forEach((r: any) => console.log(`  #${r.id} "${r.name}": ${r.n} nhân viên`));

  console.log("\n═══ 3. Products có foreign key gì tới department? ═══");
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'products' AND (column_name LIKE '%department%' OR column_name LIKE '%dept%')
  `;
  cols.forEach((r: any) => console.log(`  products.${r.column_name}`));

  console.log("\n═══ 4. Cost_reconciliations có FK tới department? ═══");
  const crCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'cost_reconciliations' AND (column_name LIKE '%department%' OR column_name LIKE '%dept%')
  `;
  crCols.forEach((r: any) => console.log(`  cost_reconciliations.${r.column_name}`));

  console.log("\n═══ 5. 2 căn A-07-09 và B-30-10 ═══");
  const rows = await sql`
    SELECT * FROM products
    WHERE product_code LIKE '%A-07-09%' OR product_code LIKE '%B-30-10%'
    ORDER BY product_code
  `;
  rows.forEach((r: any) => {
    console.log(`\n  ▸ #${r.id} ${r.product_code}`);
    const relevantKeys = Object.keys(r).filter(k => k.includes("depart") || k.includes("dept") || k === "sale_person_id" || k === "sale_person" || k === "employee_id");
    relevantKeys.forEach(k => console.log(`      ${k}: ${JSON.stringify(r[k])}`));
  });

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
