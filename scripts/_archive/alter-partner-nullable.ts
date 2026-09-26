import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  await client.unsafe(`ALTER TABLE projects ALTER COLUMN partner_id DROP NOT NULL;`);
  console.log("projects.partner_id → nullable");
  await client.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
