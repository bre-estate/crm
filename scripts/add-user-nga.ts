import { db } from "../lib/db";
import { userPermissions } from "../lib/schema";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    INSERT INTO user_permissions (email, full_name, role, permissions, active, invited_by)
    VALUES (
      'luongnga2124@gmail.com',
      'Nga (HR)',
      'custom',
      '{"costs": ["view"]}'::jsonb,
      true,
      'trietnguyen308@gmail.com'
    )
    ON CONFLICT (email) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      role = 'custom',
      permissions = '{"costs": ["view"]}'::jsonb,
      active = true,
      updated_at = now()
  `);

  const rows = await db.select().from(userPermissions);
  console.log("✅ Users hiện tại:");
  for (const u of rows) {
    console.log(
      `  ${u.email.padEnd(30)} · ${u.role.padEnd(8)} · perms=${JSON.stringify(u.permissions)} · active=${u.active}`,
    );
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
