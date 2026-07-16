/**
 * Cron script: refresh 4 field từ Batdongsan cho MỌI dự án có batdongsan_url.
 * Chạy weekly qua GitHub Action.
 *
 * Behavior:
 *   - Iterate projects có batdongsan_url
 *   - Fetch từng URL (delay 3s giữa requests để tránh burst)
 *   - Update field non-null vào DB
 *   - Log kết quả từng dự án
 *
 * Run local: npx tsx scripts/refresh-projects-batdongsan.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import { scrapeBatdongsanProject } from "../lib/scrapers/batdongsan";
dotenv.config({ path: ".env.local" });

const DELAY_MS = 3000;

async function main() {
  const c = postgres(process.env.DATABASE_URL!, { prepare: false });
  const rows = await c<{ id: number; name: string; batdongsan_url: string }[]>`
    SELECT id, name, batdongsan_url
    FROM projects
    WHERE batdongsan_url IS NOT NULL AND batdongsan_url <> ''
    ORDER BY id
  `;
  console.log(`Refresh ${rows.length} projects từ Batdongsan...`);

  let ok = 0, skip = 0, fail = 0;
  for (const p of rows) {
    try {
      const data = await scrapeBatdongsanProject(p.batdongsan_url);
      const updated: Record<string, unknown> = {};
      if (data.totalUnits !== null) updated.total_units = data.totalUnits;
      if (data.priceRangeMin !== null) updated.price_range_min = data.priceRangeMin;
      if (data.priceRangeMax !== null) updated.price_range_max = data.priceRangeMax;
      if (data.district) updated.district = data.district;
      if (data.city) updated.city = data.city;
      if (data.handoverExpected) updated.handover_expected = data.handoverExpected;

      if (Object.keys(updated).length === 0) {
        console.log(`  ⏩ [${p.id}] ${p.name} — parser không lấy được field nào, skip`);
        skip++;
      } else {
        // Update từng field riêng (đơn giản hơn dynamic SET với postgres.js)
        if (updated.total_units !== undefined)
          await c`UPDATE projects SET total_units = ${updated.total_units as number} WHERE id = ${p.id}`;
        if (updated.price_range_min !== undefined)
          await c`UPDATE projects SET price_range_min = ${updated.price_range_min as number} WHERE id = ${p.id}`;
        if (updated.price_range_max !== undefined)
          await c`UPDATE projects SET price_range_max = ${updated.price_range_max as number} WHERE id = ${p.id}`;
        if (updated.district !== undefined)
          await c`UPDATE projects SET district = ${updated.district as string} WHERE id = ${p.id}`;
        if (updated.city !== undefined)
          await c`UPDATE projects SET city = ${updated.city as string} WHERE id = ${p.id}`;
        if (updated.handover_expected !== undefined)
          await c`UPDATE projects SET handover_expected = ${updated.handover_expected as string} WHERE id = ${p.id}`;
        await c`UPDATE projects SET
          data_updated_at = NOW(),
          data_source_note = ${`Auto-fill cron ${new Date().toISOString().slice(0, 10)}`}
          WHERE id = ${p.id}`;
        console.log(`  ✅ [${p.id}] ${p.name} — updated ${Object.keys(updated).length} field`);
        ok++;
      }
    } catch (e) {
      console.log(`  ❌ [${p.id}] ${p.name} — ${e instanceof Error ? e.message : "Lỗi"}`);
      fail++;
    }
    // Delay giữa requests
    if (rows.indexOf(p) < rows.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\nSummary: ${ok} updated / ${skip} skipped / ${fail} failed / ${rows.length} total`);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
