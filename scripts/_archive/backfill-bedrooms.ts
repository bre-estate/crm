/**
 * Parse products.unit_description → products.bedrooms.
 * Diện tích m² KHÔNG có trong description → phải nhập tay.
 *
 * Rule:
 *   "studio" (any case) → 0, confidence auto
 *   "N PN" hoặc "NPN" (N=1..9), có thể có +/số phòng phụ → N, auto
 *   không match → null, parse_note = "cần check tay: <text>"
 *   unit_description NULL/empty → null, parse_note = "chưa có mô tả — cần nhập tay"
 *
 * Run: npx tsx scripts/backfill-bedrooms.ts             # dry-run
 *      npx tsx scripts/backfill-bedrooms.ts --apply     # execute
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

type Result = {
  id: number;
  bedrooms: number | null;
  note: string | null;
};

function parse(desc: string | null): Result {
  const raw = desc ?? "";
  const s = raw.trim();
  if (!s) return { id: 0, bedrooms: null, note: "chưa có mô tả — cần nhập tay" };

  const low = s.toLowerCase();
  if (/^studio$/i.test(low)) return { id: 0, bedrooms: 0, note: null };

  // "1 PN", "1PN", "1 PN+", "1PN+", "1 PN +"
  const m = low.match(/^\s*(\d+)\s*pn\s*\+?\s*$/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 0 && n <= 9) return { id: 0, bedrooms: n, note: null };
  }

  return { id: 0, bedrooms: null, note: `không parse được: "${raw}" — cần nhập tay` };
}

async function main() {
  const rows = await c<{ id: number; unit_description: string | null; unit_code: string }[]>`
    SELECT id, unit_code, unit_description FROM products ORDER BY id
  `;
  let ok = 0, needCheck = 0, empty = 0;
  const toUpdate: Result[] = [];
  const needReview: { id: number; unit_code: string; text: string | null; note: string }[] = [];

  for (const r of rows) {
    const p = parse(r.unit_description);
    p.id = r.id;
    toUpdate.push(p);
    if (p.bedrooms !== null) ok++;
    else if (r.unit_description) {
      needCheck++;
      needReview.push({ id: r.id, unit_code: r.unit_code, text: r.unit_description, note: p.note ?? "" });
    } else {
      empty++;
      needReview.push({ id: r.id, unit_code: r.unit_code, text: null, note: p.note ?? "" });
    }
  }

  console.log(`Total: ${rows.length}`);
  console.log(`  ✅ Parsed OK: ${ok}`);
  console.log(`  ⚠️  Cần check tay (có text nhưng không parse được): ${needCheck}`);
  console.log(`  📝 Cần nhập tay (chưa có mô tả): ${empty}`);
  console.log();
  if (needReview.length > 0) {
    console.log("Danh sách căn cần review (top 30):");
    for (const r of needReview.slice(0, 30)) {
      console.log(`  #${r.id} ${r.unit_code} | ${r.text ?? "(null)"} | ${r.note}`);
    }
    if (needReview.length > 30) console.log(`  ...và ${needReview.length - 30} căn nữa.`);
  }

  if (APPLY) {
    for (const p of toUpdate) {
      await c`UPDATE products SET bedrooms = ${p.bedrooms}, parse_note = ${p.note} WHERE id = ${p.id}`;
    }
    console.log(`\n✅ APPLIED ${toUpdate.length} updates.`);
    console.log(`   ${needReview.length} căn cần user check tay ở /reports/segments hoặc /products.`);
  } else {
    console.log(`\n(dry-run — add --apply to execute)`);
  }
  await c.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
