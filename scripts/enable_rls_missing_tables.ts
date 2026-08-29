/**
 * Enable RLS trên 9 bảng còn thiếu (Supabase Advisor báo rls_disabled_in_public
 * + sensitive_columns_exposed).
 *
 * App KHÔNG dùng supabase client-side query bảng — mọi query qua Drizzle với
 * DATABASE_URL (postgres role bypass RLS). Enable RLS = chặn anon/authenticated
 * qua Supabase public API, KHÔNG ảnh hưởng server actions.
 *
 * RLS enable + 0 policy = default DENY toàn bộ. Đủ chặn public access.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const TABLES = [
  "bank_transactions",        // chứa account_number, partner_bank — CRITICAL
  "contracts",
  "general_expenses",
  "import_logs",
  "rentals",                  // chứa landlord_phone, tenant_phone — CRITICAL
  "secondary_sales",
  "trial_balance",
  "year_end_accruals",
  "year_end_other_accruals",
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  for (const t of TABLES) {
    const [{ rowsecurity }] = await sql`
      SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename=${t}
    `;
    if (rowsecurity) {
      console.log(`  ✓ ${t}: RLS đã enable, skip`);
      continue;
    }
    await sql.unsafe(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    console.log(`  ✓ ${t}: ENABLED`);
  }

  console.log("\n═══ Verify sau khi apply ═══");
  const remaining = await sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND rowsecurity=false
    ORDER BY tablename
  `;
  if (remaining.length === 0) {
    console.log("  ✅ Mọi table public đã có RLS.");
  } else {
    console.log(`  ⚠️  Còn ${remaining.length} table không RLS:`);
    remaining.forEach((r: any) => console.log(`    - ${r.tablename}`));
  }

  await sql.end();
  console.log();
}
main().catch(e => { console.error(e); process.exit(1); });
