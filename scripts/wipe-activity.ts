import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const [before] = await c<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM activity_logs`;
  console.log("before:", before.n, "rows");
  await c`DELETE FROM activity_logs`;
  const [after] = await c<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM activity_logs`;
  console.log("after:", after.n, "rows");
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
