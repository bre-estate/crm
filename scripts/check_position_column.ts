import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const [r] = await sql`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'position'
  `;
  console.log("employees.position:", r);

  const [c] = await sql`
    SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'employees' AND contype = 'c'
  `;
  console.log("check constraints:", c);

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
