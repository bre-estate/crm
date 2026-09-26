import { db } from "../lib/db";
import { userPermissions } from "../lib/schema";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    UPDATE user_permissions
       SET permissions = '{
         "products": ["view", "edit"],
         "revenues": ["view", "edit"],
         "costs": ["view", "edit"],
         "invoices": ["view", "edit"],
         "partners": ["view", "edit"],
         "reports.segments": ["view", "edit"]
       }'::jsonb,
       updated_at = now()
     WHERE email = 'lanvienho@gmail.com'
  `);
  const rows = await db.select().from(userPermissions);
  for (const u of rows) {
    console.log(`  ${u.email.padEnd(30)} · ${u.role.padEnd(8)} · ${JSON.stringify(u.permissions)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
