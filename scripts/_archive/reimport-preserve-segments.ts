/**
 * Re-import Excel mới với LOGIC PRESERVE:
 *   1. Snapshot current products' bedrooms/unit_type/area/parseNote/hasBonusRoom
 *      (data user nhập tay, Excel không có).
 *   2. Wipe products/revenue_recons/cost_recons/payments/invoices.
 *   3. Import fresh từ Excel (dùng import-fresh logic).
 *   4. Restore snapshot vào products mới match theo product_code.
 *   5. Recompute invoice totals.
 *
 * GIỮ NGUYÊN (không wipe): partners, projects, departments, employees,
 * profiles, activity_logs, company_expenses.
 *
 * Run: npx tsx scripts/reimport-preserve-segments.ts            # dry-run
 *      npx tsx scripts/reimport-preserve-segments.ts --apply    # execute
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

const SNAPSHOT_FILE = "/tmp/bre-segments-snapshot.json";

type SegSnap = {
  productCode: string;
  bedrooms: number | null;
  hasBonusRoom: boolean | null;
  areaM2Net: number | null;
  areaM2Gross: number | null;
  unitType: string | null;
  parseNote: string | null;
};

async function main() {
  // === Phase 1: Snapshot ===
  const rows = await c<any[]>`
    SELECT product_code, bedrooms, has_bonus_room, area_m2_net, area_m2_gross, unit_type, parse_note
    FROM products
    WHERE bedrooms IS NOT NULL
       OR has_bonus_room = true
       OR area_m2_net IS NOT NULL
       OR area_m2_gross IS NOT NULL
       OR (unit_type IS NOT NULL AND unit_type <> 'apartment')
       OR parse_note IS NOT NULL
  `;
  const snap: SegSnap[] = rows.map((r) => ({
    productCode: r.product_code,
    bedrooms: r.bedrooms,
    hasBonusRoom: r.has_bonus_room,
    areaM2Net: r.area_m2_net,
    areaM2Gross: r.area_m2_gross,
    unitType: r.unit_type,
    parseNote: r.parse_note,
  }));
  console.log(`\n== Phase 1: Snapshot ==`);
  console.log(`Snapshot ${snap.length} products có data phân khúc.`);
  if (APPLY) {
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap, null, 2));
    console.log(`Saved: ${SNAPSHOT_FILE}`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — không wipe, không import. Chạy với --apply)`);
    await c.end();
    return;
  }

  // === Phase 2: Chạy import-fresh (partial wipe — giữ partners/projects/depts/employees) ===
  console.log(`\n== Phase 2: Wipe + Import từ Excel ==`);
  await c.end(); // Đóng connection cũ vì import-fresh sẽ mở connection riêng.
  execSync("npx tsx scripts/import-fresh.ts --apply", { stdio: "inherit", cwd: process.cwd() });

  // === Phase 3: Restore snapshot ===
  const c2 = postgres(process.env.DATABASE_URL!, { prepare: false });
  console.log(`\n== Phase 3: Restore snapshot ==`);
  if (!existsSync(SNAPSHOT_FILE)) {
    console.log(`❌ Snapshot file not found: ${SNAPSHOT_FILE}`);
    await c2.end();
    return;
  }
  const snapLoaded: SegSnap[] = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8"));
  let matched = 0;
  let notFound = 0;
  for (const s of snapLoaded) {
    const [p] = await c2<{ id: number }[]>`
      SELECT id FROM products WHERE product_code = ${s.productCode}
    `;
    if (!p) {
      notFound++;
      continue;
    }
    await c2`
      UPDATE products SET
        bedrooms = ${s.bedrooms},
        has_bonus_room = ${s.hasBonusRoom ?? false},
        area_m2_net = ${s.areaM2Net},
        area_m2_gross = ${s.areaM2Gross},
        unit_type = ${s.unitType ?? "apartment"},
        parse_note = ${s.parseNote}
      WHERE id = ${p.id}
    `;
    matched++;
  }
  console.log(`✅ Restored ${matched}/${snapLoaded.length} products.`);
  if (notFound > 0) {
    console.log(`⚠️  ${notFound} products không tìm thấy trong DB mới (Excel bỏ căn đó?).`);
  }

  // === Phase 4: Recompute invoice totals ===
  console.log(`\n== Phase 4: Recompute invoice totals ==`);
  const invs = await c2<{ id: number }[]>`SELECT id FROM invoices`;
  for (const inv of invs) {
    const [row] = await c2<{ total: string }[]>`
      SELECT COALESCE(SUM(total_receivable_this_time), 0) AS total
      FROM revenue_reconciliations WHERE invoice_id = ${inv.id}
    `;
    await c2`UPDATE invoices SET total_amount_vat = ${Number(row.total)} WHERE id = ${inv.id}`;
  }
  console.log(`✅ Recomputed ${invs.length} invoices.`);

  await c2.end();
  console.log(`\n✅ DONE.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
