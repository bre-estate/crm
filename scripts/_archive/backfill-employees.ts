/**
 * Backfill employees table từ text fields hiện có:
 * - products.salesPerson → position=nvkd (default), lấy departmentId từ product.departmentId
 * - products.deptLeaderName → position=tpkd
 * - cost_reconciliations.employeeName → position=nvkd (default nếu chưa có)
 *
 * Dedupe theo LOWER(name). Ai đã ở employees rồi thì skip.
 *
 * Run: npx tsx scripts/backfill-employees.ts            # dry-run
 *      npx tsx scripts/backfill-employees.ts --apply    # execute
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

const toTitleCase = (v: string): string =>
  v.trim().toLowerCase().replace(/(^|\s|-)([\p{L}])/gu, (_m, sep, ch) => sep + ch.toUpperCase());

const normName = (s: string): string => s.trim().replace(/\s+/g, " ");

async function main() {
  const existing = await c<{ name: string }[]>`SELECT LOWER(name) AS name FROM employees`;
  const seen = new Set(existing.map((r) => r.name));

  // 1. Sales persons từ products (position=nvkd), gom cả departmentId
  const sales = await c<{ name: string; dept_id: number | null; cnt: number }[]>`
    SELECT sales_person AS name, MAX(department_id)::int AS dept_id, COUNT(*)::int AS cnt
    FROM products
    WHERE sales_person IS NOT NULL AND TRIM(sales_person) <> ''
    GROUP BY sales_person
  `;

  // 2. Dept leaders từ products (position=tpkd), gom cả departmentId
  const leaders = await c<{ name: string; dept_id: number | null }[]>`
    SELECT dept_leader_name AS name, MAX(department_id)::int AS dept_id
    FROM products
    WHERE dept_leader_name IS NOT NULL AND TRIM(dept_leader_name) <> ''
    GROUP BY dept_leader_name
  `;

  // 3. Employees từ cost_recons (position=nvkd default nếu chưa gặp)
  const costEmp = await c<{ name: string; cnt: number }[]>`
    SELECT employee_name AS name, COUNT(*)::int AS cnt
    FROM cost_reconciliations
    WHERE employee_name IS NOT NULL AND TRIM(employee_name) <> ''
    GROUP BY employee_name
  `;

  // Merge: leaders có priority (tpkd), rồi sales (nvkd), rồi cost (nvkd)
  const map = new Map<string, { name: string; position: string; deptId: number | null; source: string }>();

  for (const l of leaders) {
    const n = normName(toTitleCase(l.name));
    const key = n.toLowerCase();
    map.set(key, { name: n, position: "tpkd", deptId: l.dept_id, source: "leader" });
  }
  for (const s of sales) {
    const n = normName(toTitleCase(s.name));
    const key = n.toLowerCase();
    if (map.has(key)) continue; // đã là leader
    map.set(key, { name: n, position: "nvkd", deptId: s.dept_id, source: "sales" });
  }
  for (const e of costEmp) {
    const n = normName(toTitleCase(e.name));
    const key = n.toLowerCase();
    if (map.has(key)) continue;
    map.set(key, { name: n, position: "nvkd", deptId: null, source: "cost" });
  }

  const toInsert = [...map.values()].filter((e) => !seen.has(e.name.toLowerCase()));

  console.log(`Tổng unique: ${map.size}`);
  console.log(`Đã có trong employees: ${map.size - toInsert.length}`);
  console.log(`Sẽ ${APPLY ? "insert" : "insert (dry-run)"}: ${toInsert.length}`);
  console.log();
  for (const e of toInsert.slice(0, 30)) {
    console.log(`  ${e.position.padEnd(4)}  ${e.name.padEnd(30)}  dept=${e.deptId ?? "—"}  (${e.source})`);
  }
  if (toInsert.length > 30) console.log(`  ...và ${toInsert.length - 30} người khác`);

  if (APPLY && toInsert.length > 0) {
    for (const e of toInsert) {
      await c`
        INSERT INTO employees (name, position, department_id, active)
        VALUES (${e.name}, ${e.position}, ${e.deptId}, true)
        ON CONFLICT DO NOTHING
      `;
    }
    console.log(`\n✅ APPLIED: ${toInsert.length} employees`);
  } else if (!APPLY) {
    console.log(`\n(dry-run — add --apply to execute)`);
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
