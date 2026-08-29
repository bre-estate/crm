/**
 * Backfill products.department_id + products.dept_name cho các căn có
 * sales_person là alias của 1 employee (chưa set department vì Excel import
 * không resolve alias).
 *
 * Rule: nếu emp.alias_of_id → dùng owner.department_id; nếu emp gốc → dùng
 * emp.department_id trực tiếp. Không đè các row đã có department_id đúng.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const dryRun = process.argv.includes("--dry");

  // Map salesPerson (lowercase) → { departmentId, deptName }
  const employees = await sql<
    { id: number; name: string; department_id: number | null; alias_of_id: number | null; dept_name: string | null }[]
  >`
    SELECT e.id, e.name, e.department_id, e.alias_of_id,
           d.name AS dept_name
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
  `;
  const byId = new Map(employees.map((e) => [e.id, e]));
  const nameToDept = new Map<string, { id: number; name: string }>();
  for (const e of employees) {
    let target = e;
    if (e.alias_of_id) {
      const owner = byId.get(e.alias_of_id);
      if (owner) target = owner;
    }
    if (target.department_id && target.dept_name) {
      nameToDept.set(e.name.toLowerCase().trim(), {
        id: target.department_id,
        name: target.dept_name,
      });
    }
  }

  // Lấy products có department_id chưa khớp expected
  const rows = await sql<
    { id: number; unit_code: string; sales_person: string; department_id: number | null; dept_name: string | null }[]
  >`
    SELECT id, unit_code, sales_person, department_id, dept_name
    FROM products
    WHERE sales_person IS NOT NULL
  `;

  const updates: { id: number; unit_code: string; sales_person: string; from: string; to: string; deptId: number; deptName: string }[] = [];
  for (const r of rows) {
    const expected = nameToDept.get(r.sales_person.toLowerCase().trim());
    if (!expected) continue;
    if (r.department_id === expected.id && r.dept_name === expected.name) continue;
    updates.push({
      id: r.id,
      unit_code: r.unit_code,
      sales_person: r.sales_person,
      from: `${r.department_id ?? "null"}/${r.dept_name ?? "null"}`,
      to: `${expected.id}/${expected.name}`,
      deptId: expected.id,
      deptName: expected.name,
    });
  }

  console.log(`Cần update ${updates.length} căn`);
  console.table(updates.slice(0, 30));

  if (dryRun) {
    console.log("(dry-run, không apply)");
    await sql.end();
    return;
  }

  for (const u of updates) {
    await sql`
      UPDATE products
      SET department_id = ${u.deptId}, dept_name = ${u.deptName}
      WHERE id = ${u.id}
    `;
  }
  console.log(`Đã update ${updates.length} căn`);
  await sql.end();
}
main();
