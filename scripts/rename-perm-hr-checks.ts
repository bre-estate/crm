/**
 * Đổi tên permission key 'reports.hr-checks' → 'costs-report' trong DB user_permissions.
 */
import { db } from "../lib/db";
import { userPermissions } from "../lib/schema";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    UPDATE user_permissions
       SET permissions = permissions
                         - 'reports.hr-checks'
                         || jsonb_build_object('costs-report', permissions->'reports.hr-checks'),
           updated_at = now()
     WHERE permissions ? 'reports.hr-checks'
    RETURNING email, permissions
  `);
  const rows = (result as any) as { email: string; permissions: any }[];
  console.log(`Updated ${rows.length} users:`);
  for (const r of rows) {
    console.log(`  ${r.email}: ${JSON.stringify(r.permissions)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
