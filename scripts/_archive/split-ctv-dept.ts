/**
 * Tách phòng CTV riêng khỏi "Đối tác liên kết" (#16).
 *
 * Trước: phòng #16 "Đối tác liên kết" gộp 3 nhân viên position=ctv.
 * Sau: tạo phòng mới "CTV" cho các nhân viên position=ctv. Phòng "Đối tác
 *      liên kết" giữ nguyên (dành cho đối tác thực trong tương lai, có thể
 *      thành trống tạm thời).
 *
 * - Tạo departments row mới: code=CTV, name=CTV
 * - Update employees.department_id: 16 → new_id (chỉ những ai position=ctv)
 * - Update products.department_id + clear dept_name text cho 3 căn EMGB
 *   (đang có dept_name="Freelancer" text tự do)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("═══ Before ═══");
  const before = await sql`
    SELECT d.id, d.code, d.name, COUNT(e.id)::int AS n_emp
    FROM departments d LEFT JOIN employees e ON e.department_id = d.id
    WHERE d.id IN (16) OR e.position = 'ctv'
    GROUP BY d.id, d.code, d.name ORDER BY d.id
  `;
  before.forEach((r: any) => console.log(`  #${r.id} ${r.code} "${r.name}": ${r.n_emp} nv`));

  console.log("\n═══ Step 1: Tạo phòng CTV ═══");
  const [existing] = await sql`SELECT id FROM departments WHERE code = 'CTV'`;
  let ctvDeptId: number;
  if (existing) {
    ctvDeptId = existing.id;
    console.log(`  Phòng CTV đã tồn tại: #${ctvDeptId}`);
  } else {
    const [newDept] = await sql`
      INSERT INTO departments (code, name, leader_name, note)
      VALUES ('CTV', 'CTV', 'Đoàn Lê Bách', 'Cộng tác viên / Freelance cá nhân')
      RETURNING id
    `;
    ctvDeptId = newDept.id;
    console.log(`  Tạo phòng CTV: #${ctvDeptId}`);
  }

  console.log("\n═══ Step 2: Move nhân viên position=ctv từ dept #16 → #" + ctvDeptId + " ═══");
  const emps = await sql`
    SELECT id, name FROM employees
    WHERE position = 'ctv' AND department_id = 16
  `;
  for (const e of emps) {
    await sql`UPDATE employees SET department_id = ${ctvDeptId} WHERE id = ${e.id}`;
    console.log(`  ✓ Move ${e.name} (#${e.id}) sang dept #${ctvDeptId}`);
  }
  console.log(`  Total: ${emps.length} nv`);

  console.log("\n═══ Step 3: Link 3 căn EMGB có dept_name='Freelancer' text tự do ═══");
  const legacyRows = await sql`
    SELECT id, product_code FROM products
    WHERE dept_name = 'Freelancer' AND department_id IS NULL
  `;
  for (const p of legacyRows) {
    await sql`
      UPDATE products
      SET department_id = ${ctvDeptId}, dept_name = NULL
      WHERE id = ${p.id}
    `;
    console.log(`  ✓ #${p.id} ${p.product_code}: department_id=${ctvDeptId}, dept_name=NULL`);
  }
  console.log(`  Total: ${legacyRows.length} căn`);

  console.log("\n═══ After ═══");
  const after = await sql`
    SELECT d.id, d.code, d.name, COUNT(DISTINCT e.id)::int AS n_emp, COUNT(DISTINCT p.id)::int AS n_prod
    FROM departments d
    LEFT JOIN employees e ON e.department_id = d.id
    LEFT JOIN products p ON p.department_id = d.id
    WHERE d.id IN (16, ${ctvDeptId})
    GROUP BY d.id, d.code, d.name ORDER BY d.id
  `;
  after.forEach((r: any) => console.log(`  #${r.id} ${r.code} "${r.name}": ${r.n_emp} nv, ${r.n_prod} căn`));

  await sql.end();
  console.log("\n✅ Done.\n");
}
main().catch(e => { console.error(e); process.exit(1); });
