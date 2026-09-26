import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  console.log("═══ RLS status per table (schema=public) ═══");
  const tables = await sql`
    SELECT
      tablename,
      rowsecurity,
      (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tablename) AS n_policies
    FROM pg_tables t
    WHERE schemaname = 'public'
    ORDER BY rowsecurity, tablename
  `;
  const noRLS = tables.filter((t: any) => !t.rowsecurity);
  const withRLS = tables.filter((t: any) => t.rowsecurity);
  console.log(`\n  ⚠️  ${noRLS.length} tables KHÔNG RLS (public accessible):`);
  noRLS.forEach((t: any) => console.log(`    - ${t.tablename}`));
  console.log(`\n  ✓ ${withRLS.length} tables CÓ RLS:`);
  withRLS.forEach((t: any) => console.log(`    ${t.tablename} (${t.n_policies} policies)`));

  console.log("\n═══ Sensitive columns (email/password/token/phone) ═══");
  const sensitive = await sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        column_name ILIKE '%password%' OR
        column_name ILIKE '%token%' OR
        column_name ILIKE '%secret%' OR
        column_name ILIKE '%api_key%' OR
        column_name ILIKE '%email%' OR
        column_name ILIKE '%phone%' OR
        column_name ILIKE '%tax%' OR
        column_name ILIKE '%bank%' OR
        column_name ILIKE '%account_number%' OR
        column_name ILIKE '%ssn%' OR
        column_name ILIKE '%cccd%' OR
        column_name ILIKE '%cmnd%'
      )
    ORDER BY table_name, column_name
  `;
  sensitive.forEach((c: any) => console.log(`  ${c.table_name}.${c.column_name} (${c.data_type})`));

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
