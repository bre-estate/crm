/**
 * Fix cost_reconciliations.employee_name: normalize case theo bảng employees
 * (LOWER match). Trước đây bulk import Excel giữ nguyên case chị Kim gõ →
 * ALL CAPS và Title Case cùng tồn tại → GROUP BY tách 1 người thành 2 rows
 * trong /reports/commissions.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  // Tìm các recon có case khác canonical
  const mismatched = await sql`
    SELECT
      cr.id,
      cr.employee_name AS recon_name,
      e.name AS canonical_name
    FROM cost_reconciliations cr
    JOIN employees e ON LOWER(e.name) = LOWER(cr.employee_name)
    WHERE cr.employee_name != e.name
    ORDER BY cr.id
  `;
  console.log(`Sắp fix ${mismatched.length} recons:\n`);

  const seen = new Set<string>();
  for (const r of mismatched) {
    const key = `${r.recon_name} → ${r.canonical_name}`;
    if (!seen.has(key)) {
      console.log(`  "${r.recon_name}" → "${r.canonical_name}"`);
      seen.add(key);
    }
    await sql`UPDATE cost_reconciliations SET employee_name = ${r.canonical_name} WHERE id = ${r.id}`;
  }

  console.log(`\n✅ Fixed ${mismatched.length} recons.`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
