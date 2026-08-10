/**
 * Cross-check tier-aware: với mỗi contract có tiers, xác định căn thứ N thuộc bậc nào,
 * rồi so pmg_rate căn với tier.rate.
 *
 * Với contract metric='count', mỗi căn tại vị trí thứ i (theo thứ tự deposit_date/created_at)
 *   thuộc tier mà tierAt(i) khớp.
 * Với metric='percent', khó cross-check tự động (cần biết Y%).
 *
 * Nếu contract không có tiers (metric='other'), fallback so pmg_lk mức duy nhất.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { tierAt } from "../lib/pmg-tier-parser";

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number | null | undefined) => n == null ? "?" : ((n as number) * 100).toFixed(2) + "%";
const fmtM = (n: number | null | undefined) => n == null ? "?" : Math.round(n as number).toLocaleString("vi-VN");

async function main() {
  const contracts = await sql`
    SELECT id, project_code, project_id, partner_name, pmg_lk, pmg_lk_sale,
      admin_fee, cdt_bonus_sale, pmg_tiers, pmg_metric
    FROM contracts
    WHERE project_id IS NOT NULL
    ORDER BY project_code
  `;

  const issues: string[] = [];

  for (const c of contracts) {
    // Kéo mọi căn của dự án theo thứ tự bán (deposit_date asc, tiebreaker created_at)
    const products = await sql`
      SELECT id, product_code, pmg_rate, pmg_sale_rate, admin_fee, cdt_bonus_sale, deposit_date
      FROM products
      WHERE project_id = ${c.project_id as number}
      ORDER BY COALESCE(deposit_date, '9999-12-31'), created_at
    `;
    if (products.length === 0) continue;

    const tiers = c.pmg_tiers as any[] | null;
    const useTier = Array.isArray(tiers) && tiers.length > 0 && c.pmg_metric === "count";

    let mismatches = 0;
    const detail: string[] = [];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const soldIdx = i + 1; // căn thứ 1, 2, 3...
      let expectedRate: number | null = null;

      if (useTier) {
        const tier = tierAt(tiers, soldIdx);
        expectedRate = tier?.rate ?? null;
      } else if (c.pmg_lk != null) {
        expectedRate = Number(c.pmg_lk);
      }

      if (expectedRate == null || p.pmg_rate == null) continue;
      const actual = Number(p.pmg_rate);
      if (Math.abs(actual - expectedRate) > 0.0001) {
        mismatches++;
        detail.push(`  #${soldIdx} ${p.product_code}: PMG=${fmt(actual)} nhưng bậc ${useTier ? "X=" + soldIdx : "phẳng"} = ${fmt(expectedRate)}`);
      }
    }

    if (mismatches > 0) {
      issues.push(`\n${c.project_code} · ${c.partner_name} [${c.pmg_metric ?? "flat"}] — ${mismatches}/${products.length} căn chênh:`);
      for (const d of detail.slice(0, 5)) issues.push(d);
      if (detail.length > 5) issues.push(`  ... và ${detail.length - 5} căn khác`);
    }
  }

  console.log("═══ CROSS-CHECK TIER-AWARE ═══");
  if (issues.length === 0) {
    console.log("✅ Mọi căn khớp bậc PMG theo contract");
  } else {
    for (const s of issues) console.log(s);
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
