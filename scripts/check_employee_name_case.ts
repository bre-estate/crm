import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("═══ Employee names trong cost_reconciliations có case KHÁC vs employees.name ═══");
  const rows = await sql`
    SELECT
      cr.employee_name AS recon_name,
      e.name AS canonical_name,
      COUNT(*)::int AS n
    FROM cost_reconciliations cr
    LEFT JOIN employees e ON LOWER(e.name) = LOWER(cr.employee_name)
    WHERE cr.employee_name IS NOT NULL AND cr.employee_name != ''
    GROUP BY cr.employee_name, e.name
    ORDER BY cr.employee_name
  `;
  const mismatched = rows.filter((r: any) => r.canonical_name && r.recon_name !== r.canonical_name);
  console.log(`  Total distinct case: ${rows.length}, mismatched: ${mismatched.length}\n`);
  mismatched.forEach((r: any) => {
    console.log(`  "${r.recon_name}" (${r.n} recon) → canonical "${r.canonical_name}"`);
  });

  console.log("\n═══ Employee names KHÔNG match với bảng employees ═══");
  const orphan = rows.filter((r: any) => !r.canonical_name);
  orphan.forEach((r: any) => console.log(`  "${r.recon_name}" (${r.n} recon)`));

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
