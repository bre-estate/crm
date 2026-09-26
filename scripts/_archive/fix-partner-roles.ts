/**
 * Fix partner types + project breRole based on user's confirmation:
 * - DXMD, DKRS, Dataloca: partners → type=f1 (sàn phân phối, không phải CĐT)
 * - Projects gắn với 3 partner trên: breRole=f2 (BRE bán qua họ)
 * - Rename "Secondary Market" → "Chợ thứ cấp"
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import { eq, inArray } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

async function main() {
  const F1_PARTNER_NAMES = ["DXMD", "DKRS", "Dataloca"];

  // 1. Update partner types
  for (const name of F1_PARTNER_NAMES) {
    const result = await db
      .update(schema.partners)
      .set({ type: "f1" })
      .where(eq(schema.partners.name, name))
      .returning({ id: schema.partners.id });
    console.log(`Updated partner "${name}" → type=f1 (${result.length} rows)`);
  }

  // 2. Get partner IDs
  const f1Partners = await db
    .select({ id: schema.partners.id, name: schema.partners.name })
    .from(schema.partners)
    .where(inArray(schema.partners.name, F1_PARTNER_NAMES));
  const f1PartnerIds = f1Partners.map((p) => p.id);
  console.log(`Found ${f1PartnerIds.length} F1 partner IDs:`, f1PartnerIds);

  // 3. Update projects → breRole=f2
  if (f1PartnerIds.length > 0) {
    const result = await db
      .update(schema.projects)
      .set({ breRole: "f2" })
      .where(inArray(schema.projects.partnerId, f1PartnerIds))
      .returning({ id: schema.projects.id, name: schema.projects.name });
    console.log(`Updated ${result.length} projects → breRole=f2:`);
    for (const p of result) console.log(`  - ${p.name}`);
  }

  // 4. Rename "Secondary Market" → "Chợ thứ cấp"
  const renamed = await db
    .update(schema.partners)
    .set({ name: "Chợ thứ cấp" })
    .where(eq(schema.partners.name, "Secondary Market"))
    .returning({ id: schema.partners.id });
  console.log(`Renamed "Secondary Market" → "Chợ thứ cấp" (${renamed.length} rows)`);

  await client.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
