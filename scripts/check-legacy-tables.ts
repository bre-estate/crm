import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const [inv] = await c<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM company_investments`;
  const [exp] = await c<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM company_expenses`;
  const [set] = await c<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM company_settings`;
  console.log("company_investments:", inv.n, "rows");
  console.log("company_expenses:", exp.n, "rows");
  console.log("company_settings:", set.n, "rows");
  if (Number(set.n) > 0) {
    const s = await c`SELECT * FROM company_settings`;
    console.log("Settings:", s);
  }
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
