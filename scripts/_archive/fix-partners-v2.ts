/**
 * Fix partner types round 2:
 * - Chỉ Bcons Homes là CĐT thực (giữ type=cdt)
 * - Các "cdt" khác (TA, BAMLAND, Oplus Realy, Vạn Xuân, ZLand) → type=f1 (đều là sàn)
 * - Projects gắn với các partner vừa đổi thành f1 → breRole=f2 (BRE bán qua họ)
 * - Xoá partner "Chợ thứ cấp": null hoá partnerId của 5 dự án gắn với nó, rồi xoá partner
 *
 * Cần chạy sau khi drizzle push để partnerId nullable.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

async function main() {
  // 1. Đổi các "cdt" khác (trừ Bcons Homes và Chợ thứ cấp) → f1
  const cdtPartners = await db
    .select({ id: schema.partners.id, name: schema.partners.name })
    .from(schema.partners)
    .where(
      and(
        eq(schema.partners.type, "cdt"),
        ne(schema.partners.name, "Bcons Homes"),
        ne(schema.partners.name, "Chợ thứ cấp"),
      ),
    );
  console.log(`Đổi ${cdtPartners.length} partner từ cdt → f1:`);
  for (const p of cdtPartners) console.log(`  - ${p.name}`);
  if (cdtPartners.length > 0) {
    await db
      .update(schema.partners)
      .set({ type: "f1" })
      .where(inArray(schema.partners.id, cdtPartners.map((p) => p.id)));
  }

  // 2. Update breRole=f2 cho projects gắn với các partner vừa đổi
  const affectedPartnerIds = cdtPartners.map((p) => p.id);
  if (affectedPartnerIds.length > 0) {
    const updated = await db
      .update(schema.projects)
      .set({ breRole: "f2" })
      .where(inArray(schema.projects.partnerId, affectedPartnerIds))
      .returning({ id: schema.projects.id, name: schema.projects.name });
    console.log(`\nUpdate ${updated.length} projects → breRole=f2:`);
    for (const p of updated) console.log(`  - ${p.name}`);
  }

  // 3. Xoá "Chợ thứ cấp": null hoá partnerId + xoá partner
  const [choThucCap] = await db
    .select({ id: schema.partners.id })
    .from(schema.partners)
    .where(eq(schema.partners.name, "Chợ thứ cấp"));
  if (choThucCap) {
    const nulled = await db
      .update(schema.projects)
      .set({ partnerId: null })
      .where(eq(schema.projects.partnerId, choThucCap.id))
      .returning({ id: schema.projects.id, name: schema.projects.name });
    console.log(`\nNull hoá partnerId cho ${nulled.length} projects:`);
    for (const p of nulled) console.log(`  - ${p.name}`);

    await db.delete(schema.partners).where(eq(schema.partners.id, choThucCap.id));
    console.log(`Đã xoá partner "Chợ thứ cấp"`);
  } else {
    console.log("Không tìm thấy partner 'Chợ thứ cấp' (đã xoá trước đó?)");
  }

  await client.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
