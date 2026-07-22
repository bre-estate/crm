import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const before = await c<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM products WHERE recognition_month IS NOT NULL`;
  console.log("before non-null:", before[0].n);
  await c`UPDATE products SET recognition_month = NULL WHERE recognition_month IS NOT NULL`;
  const after = await c<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM products WHERE recognition_month IS NOT NULL`;
  console.log("after non-null:", after[0].n);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
