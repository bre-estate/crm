/**
 * Setup 2 phòng mới + rename 2 phòng KD + assign HR/Admin/Content Writer
 * vào phòng tương ứng.
 *
 * - Add "Hành chính" (leader null), "Marketing" (leader null)
 * - Rename "Hồ Gia" → "Kinh doanh - Hồ Gia", "1 Tỷ" → "Kinh doanh - 1 Tỷ"
 * - HR + Admin (dept null) → Hành chính
 * - Content Writer (dept null) → Marketing
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const dryRun = process.argv.includes("--dry");

  const existing = await sql<{ id: number; name: string }[]>`SELECT id, name FROM departments`;
  const byName = new Map(existing.map((d) => [d.name, d.id]));

  // 1. INSERT 2 phòng nếu chưa có
  let adminDeptId: number | undefined = byName.get("Hành chính");
  let marketingDeptId: number | undefined = byName.get("Marketing");

  if (!adminDeptId) {
    console.log("+ INSERT Hành chính");
    if (!dryRun) {
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO departments (code, name) VALUES ('HC', 'Hành chính') RETURNING id
      `;
      adminDeptId = row.id;
    }
  } else {
    console.log(`= Hành chính đã tồn tại (id=${adminDeptId})`);
  }

  if (!marketingDeptId) {
    console.log("+ INSERT Marketing");
    if (!dryRun) {
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO departments (code, name) VALUES ('MKT', 'Marketing') RETURNING id
      `;
      marketingDeptId = row.id;
    }
  } else {
    console.log(`= Marketing đã tồn tại (id=${marketingDeptId})`);
  }

  // 2. Rename 2 phòng KD (nếu chưa đổi)
  if (byName.has("Hồ Gia")) {
    console.log("~ RENAME 'Hồ Gia' → 'Kinh doanh - Hồ Gia'");
    if (!dryRun) {
      await sql`UPDATE departments SET name = 'Kinh doanh - Hồ Gia' WHERE id = ${byName.get("Hồ Gia")!}`;
    }
  }
  if (byName.has("1 Tỷ")) {
    console.log("~ RENAME '1 Tỷ' → 'Kinh doanh - 1 Tỷ'");
    if (!dryRun) {
      await sql`UPDATE departments SET name = 'Kinh doanh - 1 Tỷ' WHERE id = ${byName.get("1 Tỷ")!}`;
    }
  }

  // 3. Move HR + Admin (dept null, active) → Hành chính
  const hrAdmin = await sql<{ id: number; name: string; position: string }[]>`
    SELECT id, name, position FROM employees
    WHERE active = true AND department_id IS NULL AND position IN ('hr', 'admin')
  `;
  console.log(`\n→ Hành chính: ${hrAdmin.length} người`);
  console.table(hrAdmin);
  if (!dryRun && adminDeptId && hrAdmin.length) {
    for (const e of hrAdmin) {
      await sql`UPDATE employees SET department_id = ${adminDeptId} WHERE id = ${e.id}`;
    }
  }

  // 4. Move Content Writer (dept null, active) → Marketing
  const contentWriters = await sql<{ id: number; name: string; position: string }[]>`
    SELECT id, name, position FROM employees
    WHERE active = true AND department_id IS NULL AND position = 'content_writer'
  `;
  console.log(`\n→ Marketing: ${contentWriters.length} người`);
  console.table(contentWriters);
  if (!dryRun && marketingDeptId && contentWriters.length) {
    for (const e of contentWriters) {
      await sql`UPDATE employees SET department_id = ${marketingDeptId} WHERE id = ${e.id}`;
    }
  }

  // 5. Sync products.dept_name cho các căn thuộc 2 phòng vừa rename
  if (!dryRun) {
    const upd = await sql`
      UPDATE products p
      SET dept_name = d.name
      FROM departments d
      WHERE p.department_id = d.id
        AND d.name LIKE 'Kinh doanh - %'
        AND p.dept_name != d.name
      RETURNING p.id
    `;
    console.log(`\n~ Sync products.dept_name cho ${upd.length} căn (2 phòng KD)`);
  }

  if (dryRun) console.log("\n(dry-run, không apply)");
  await sql.end();
}
main();
