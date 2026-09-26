/**
 * Migration: thêm cột projects.default_sale_type + backfill.
 *
 * Rule backfill:
 *   - Dự án có ≥1 sản phẩm primary → 'primary'
 *   - Dự án có ≥1 sản phẩm secondary → 'secondary'
 *   - Dự án 5 Bcons (Plaza, Polygon, Garden, Green View, Miền Đông) → 'secondary'
 *   - Còn lại → null
 *
 * Run: npx tsx scripts/add-default-sale-type.ts          # dry-run
 *      npx tsx scripts/add-default-sale-type.ts --apply  # execute
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");

const BCONS_SECONDARY = [
  "Bcons Plaza",
  "Bcons Polygon",
  "Bcons Garden",
  "Bcons Green View",
  "Bcons Miền Đông",
];

async function main() {
  const c = postgres(process.env.DATABASE_URL!, { prepare: false });

  // 1. Add column (idempotent — IF NOT EXISTS)
  console.log(`\n== Step 1: ADD COLUMN default_sale_type (${APPLY ? "APPLY" : "dry-run"}) ==`);
  if (APPLY) {
    await c`ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_sale_type text`;
    console.log("  ✅ Column added (or already exists)");
  } else {
    console.log("  Would run: ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_sale_type text");
  }

  // 2. Backfill via product analysis
  console.log("\n== Step 2: Backfill từ sản phẩm hiện có ==");
  const productCounts = await c`
    SELECT project_id,
      SUM(CASE WHEN sale_type = 'primary' THEN 1 ELSE 0 END)::int AS n_primary,
      SUM(CASE WHEN sale_type = 'secondary' THEN 1 ELSE 0 END)::int AS n_secondary
    FROM products WHERE project_id IS NOT NULL
    GROUP BY project_id`;
  const plan: { id: number; name: string; value: "primary" | "secondary" | null }[] = [];
  for (const r of productCounts) {
    const nP = Number(r.n_primary);
    const nS = Number(r.n_secondary);
    let value: "primary" | "secondary" | null = null;
    if (nP > 0 && nS === 0) value = "primary";
    else if (nS > 0 && nP === 0) value = "secondary";
    else if (nP > 0 && nS > 0) value = "primary"; // mixed → primary (dominant use case)
    if (!value) continue;
    const [pj] = await c`SELECT name FROM projects WHERE id = ${r.project_id}`;
    plan.push({ id: r.project_id!, name: pj?.name ?? "?", value });
  }
  console.log(`  Sẽ set ${plan.length} dự án từ product analysis:`);
  for (const p of plan.slice(0, 30)) console.log(`    ${p.name.padEnd(30)} → ${p.value}`);
  if (plan.length > 30) console.log(`    ... (${plan.length - 30} more)`);

  // 3. Override 5 Bcons secondary
  console.log("\n== Step 3: Override 5 Bcons → secondary ==");
  for (const name of BCONS_SECONDARY) {
    const rows = await c`SELECT id, name FROM projects WHERE name = ${name}`;
    if (rows.length === 0) {
      console.log(`    ⚠ Không tìm thấy dự án: ${name}`);
      continue;
    }
    for (const r of rows) {
      const existing = plan.find((p) => p.id === r.id);
      if (existing) existing.value = "secondary";
      else plan.push({ id: r.id, name: r.name, value: "secondary" });
      console.log(`    ${r.name.padEnd(30)} → secondary`);
    }
  }

  // 4. Apply
  console.log(`\n== Step 4: UPDATE projects (${plan.length} rows) ==`);
  if (APPLY) {
    for (const p of plan) {
      await c`UPDATE projects SET default_sale_type = ${p.value} WHERE id = ${p.id}`;
    }
    console.log(`  ✅ Updated ${plan.length} rows`);
  } else {
    console.log("  Would UPDATE all above rows");
  }

  // 5. Verify (skip in dry-run — column not yet added)
  if (!APPLY) {
    await c.end();
    console.log("\n(dry-run — add --apply to execute)");
    return;
  }
  console.log("\n== Step 5: Final state ==");
  const finalRows = await c`
    SELECT name, default_sale_type,
      (SELECT COUNT(*)::int FROM products p WHERE p.project_id = pj.id) AS n_products
    FROM projects pj ORDER BY default_sale_type NULLS LAST, name`;
  for (const r of finalRows) {
    console.log(
      `  ${(r.name ?? "").padEnd(30)} | ${(r.default_sale_type ?? "(null)").padEnd(10)} | ${r.n_products} sản phẩm`,
    );
  }

  await c.end();
  console.log(APPLY ? "\n✅ APPLIED" : "\n(dry-run — add --apply to execute)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
