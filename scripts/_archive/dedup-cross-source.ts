/**
 * Xóa cross-source duplicates: rows từ `tam-ung-*` trùng với `merged-Bách`.
 *
 * Logic:
 * - Bách chi tiền cho Admin (Nga/Tường Vi), Admin chi ra thực tế
 * - Bách note trong MERGED-Bách (sổ cá nhân)
 * - Admin note trong sổ tạm ứng (Nga_HR / Tường Vi_admin)
 * - → Cùng 1 giao dịch được ghi 2 nơi → nhân đôi.
 *
 * Ground truth: MERGED-Bách (Bách là người bỏ tiền thực).
 * Xóa: tam-ung rows match với MERGED-Bách.
 *
 * Match key: amount + norm(description) + cùng tháng ±1 (tolerance
 * cho Bách ghi ngày khác Admin chi 1-2 tuần).
 *
 * Run: npx tsx scripts/dedup-cross-source.ts          # dry-run
 *      npx tsx scripts/dedup-cross-source.ts --apply  # xóa thật
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

const normDesc = (s: string) =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, "")
    .replace(/[.,;:'"()\-_/]/g, "");

function monthDiff(a: string, b: string): number {
  const [y1, m1] = a.split("-").map(Number);
  const [y2, m2] = b.split("-").map(Number);
  if (!y1 || !y2) return 999;
  return Math.abs((y2 - y1) * 12 + (m2 - m1));
}

async function main() {
  // Load all rows
  const all = await c<any[]>`
    SELECT id, transaction_date, transaction_month, description, amount::bigint AS amount,
      category_code, management_group, payer, source_file
    FROM financial_transactions
  `;
  console.log(`Total rows: ${all.length}`);

  // Index MERGED-Bách rows theo (amount + normDesc)
  const mergedIndex = new Map<string, any[]>();
  for (const r of all) {
    if (r.source_file === "merged-Bách" || r.source_file === "merged-Triết") {
      const key = `${r.amount}|${normDesc(r.description)}`;
      if (!mergedIndex.has(key)) mergedIndex.set(key, []);
      mergedIndex.get(key)!.push(r);
    }
  }

  // Find tam-ung rows that match MERGED
  const dups: Array<{ tamUng: any; merged: any }> = [];
  for (const r of all) {
    if (!r.source_file.startsWith("tam-ung-")) continue;
    const key = `${r.amount}|${normDesc(r.description)}`;
    const candidates = mergedIndex.get(key) ?? [];
    // Match if any candidate cùng tháng ± 1
    const match = candidates.find((m) => monthDiff(m.transaction_month, r.transaction_month) <= 1);
    if (match) {
      dups.push({ tamUng: r, merged: match });
    }
  }

  console.log(`\n=== Found ${dups.length} duplicate tam-ung rows ===\n`);

  // Group by amount range for readable output
  const grouped = new Map<string, typeof dups>();
  for (const d of dups) {
    const bucket = d.tamUng.amount >= 1_000_000 ? "≥ 1M" : d.tamUng.amount >= 100_000 ? "100k-1M" : "< 100k";
    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket)!.push(d);
  }

  let totalAmount = 0;
  for (const [bucket, list] of grouped) {
    const bucketSum = list.reduce((s, d) => s + Number(d.tamUng.amount), 0);
    totalAmount += bucketSum;
    console.log(`\n--- ${bucket} (${list.length} rows, ${bucketSum.toLocaleString("vi-VN")} VND) ---`);
    for (const d of list.slice(0, 10)) {
      console.log(
        `  DEL ID ${d.tamUng.id} [${d.tamUng.source_file}] ${d.tamUng.transaction_date} · ` +
          `${Number(d.tamUng.amount).toLocaleString("vi-VN").padStart(12)} · ${d.tamUng.description.slice(0, 55)}`,
      );
      console.log(
        `    ↳ trùng ID ${d.merged.id} [${d.merged.source_file}] ${d.merged.transaction_date}`,
      );
    }
    if (list.length > 10) console.log(`  ... (${list.length - 10} rows còn lại)`);
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`TỔNG: ${dups.length} rows trùng, ${totalAmount.toLocaleString("vi-VN")} VND`);

  if (!APPLY) {
    console.log(`\n(dry-run — chưa xóa. Chạy với --apply để xóa thật.)`);
    await c.end();
    return;
  }

  const ids = dups.map((d) => Number(d.tamUng.id));
  const res = await c`DELETE FROM financial_transactions WHERE id IN ${c(ids)} RETURNING id`;
  console.log(`\n✅ Deleted ${res.length} rows.`);

  const [remain] = await c<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM financial_transactions`;
  console.log(`Còn lại: ${remain.n} rows.`);

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
