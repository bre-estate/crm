/**
 * Backup all DB tables to a single JSON snapshot.
 * Usage: npx tsx scripts/backup-tables.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import * as dotenv from "dotenv";
import { writeFileSync, mkdirSync } from "fs";

dotenv.config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

async function main() {
  const timestamp = process.argv[2] ?? new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("backups", { recursive: true });
  const outFile = `backups/bre-crm-snapshot-${timestamp}.json`;
  const tables = Object.entries(schema).filter(
    ([, v]) => v && typeof v === "object" && v.constructor?.name === "PgTable",
  );
  const snapshot: Record<string, unknown[]> = {};
  for (const [name, table] of tables) {
    try {
      const rows = await db.select().from(table as never);
      snapshot[name] = rows as unknown[];
      console.log(`  ${name}: ${rows.length} rows`);
    } catch (e) {
      console.warn(`  ${name}: skipped (${(e as Error).message.slice(0, 60)})`);
    }
  }
  writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
  const kb = Math.round((JSON.stringify(snapshot).length / 1024) * 10) / 10;
  console.log(`\nSaved: ${outFile} (${kb} KB)`);
  await client.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
