import postgres from "postgres";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
dotenv.config({ path: ".env.local" });

const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const sql = readFileSync(join(process.cwd(), "drizzle", "0019_user_permissions.sql"), "utf8");
  await c.unsafe(sql);
  const users = await c<{ email: string; role: string; active: boolean }[]>`
    SELECT email, role, active FROM user_permissions ORDER BY invited_at
  `;
  console.log("✅ Migration 0019 applied. Users seeded:");
  for (const u of users) console.log(`  ${u.email.padEnd(30)} · ${u.role.padEnd(10)} · active=${u.active}`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
