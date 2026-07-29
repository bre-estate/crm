import { db } from "../lib/db";
import { userPermissions } from "../lib/schema";
import { sql, eq } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    UPDATE user_permissions
       SET permissions = permissions || '{"reports.hr-checks": ["view"]}'::jsonb,
           updated_at = now()
     WHERE email = 'luongnga2124@gmail.com'
  `);
  const [row] = await db
    .select()
    .from(userPermissions)
    .where(eq(userPermissions.email, "luongnga2124@gmail.com"));
  console.log("Nga sau update:", JSON.stringify(row?.permissions, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
