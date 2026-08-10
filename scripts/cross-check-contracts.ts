/**
 * Cross-check tier-aware v2:
 *   - Group products theo contract qua product_code prefix = contract.project_code
 *   - X = số căn BRE-only ĐÃ CỌC (deposit_date IS NOT NULL) trong contract này
 *   - retroactive: expected_rate = rate của tier chứa X_final (áp cho tất cả căn)
 *   - non-retroactive: expected_rate = rate của tier tại vị trí i (theo thứ tự cọc)
 *   - saleCap: nếu tier có saleCap, check pmg_sale_rate ≤ saleCap
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { tierAt } from "../lib/pmg-tier-parser";

const sql = postgres(process.env.DATABASE_URL!);
const fmtPct = (n: number | null | undefined) => n == null ? "?" : ((n as number) * 100).toFixed(2) + "%";

async function main() {
  const contracts = await sql`
    SELECT id, project_code, partner_name, pmg_lk, pmg_lk_sale,
      pmg_tiers, pmg_metric, pmg_retroactive
    FROM contracts
    WHERE project_id IS NOT NULL
    ORDER BY project_code
  `;

  const issues: string[] = [];
  let totalChecked = 0, totalMatched = 0;

  for (const c of contracts) {
    // Match products theo prefix product_code
    const products = await sql`
      SELECT id, product_code, pmg_rate, pmg_sale_rate, deposit_date
      FROM products
      WHERE product_code LIKE ${c.project_code + "_%"}
        AND deposit_date IS NOT NULL
      ORDER BY deposit_date, id
    `;
    if (products.length === 0) continue;

    const tiers = c.pmg_tiers as any[] | null;
    const useTier = Array.isArray(tiers) && tiers.length > 0 && c.pmg_metric === "count";
    const retroactive = c.pmg_retroactive === true;
    const X_final = products.length;

    // Tier chứa X_final (mốc cao nhất reached)
    const finalTier = useTier ? tierAt(tiers, X_final) : null;

    // Set các rate hợp lệ (thuộc bất kỳ tier nào)
    const validRates = new Set<number>();
    if (useTier) for (const t of tiers!) validRates.add(Math.round(t.rate * 10000));
    else if (c.pmg_lk != null) validRates.add(Math.round(Number(c.pmg_lk) * 10000));

    // Rate max đạt được sau khi bán X_final căn
    const maxReachedRate = retroactive
      ? finalTier?.rate ?? null
      : useTier
        ? Math.max(...tiers!.filter(t => t.min <= X_final).map(t => t.rate))
        : c.pmg_lk != null ? Number(c.pmg_lk) : null;

    const badRate: string[] = [];   // rate không thuộc biểu
    const overRate: string[] = [];  // rate vượt bậc max reached
    const capViol: string[] = [];   // sale > saleCap
    const finalTierCap = finalTier?.saleCap ?? null;

    for (const p of products) {
      totalChecked++;
      if (p.pmg_rate == null) continue;
      const actual = Number(p.pmg_rate);
      const actualKey = Math.round(actual * 10000);

      if (validRates.size > 0 && !validRates.has(actualKey)) {
        badRate.push(`  ${p.product_code}: PMG=${fmtPct(actual)} — không thuộc biểu ${Array.from(validRates).map(k => fmtPct(k/10000)).join(", ")}`);
      } else if (maxReachedRate != null && actual > maxReachedRate + 0.0001) {
        overRate.push(`  ${p.product_code}: PMG=${fmtPct(actual)} — vượt bậc max đạt được ${fmtPct(maxReachedRate)} (X_final=${X_final}${retroactive ? ", đã hồi tố" : ""})`);
      } else {
        totalMatched++;
      }

      if (finalTierCap != null && p.pmg_sale_rate != null && Number(p.pmg_sale_rate) > finalTierCap + 0.0001) {
        capViol.push(`  ${p.product_code}: sale=${fmtPct(Number(p.pmg_sale_rate))} VƯỢT trần NVKD ${fmtPct(finalTierCap)}`);
      }
    }

    if (badRate.length + overRate.length + capViol.length > 0) {
      const meta = retroactive ? "↺ hồi tố" : useTier ? "theo bậc" : "phẳng";
      issues.push(`\n${c.project_code} · ${c.partner_name} [${meta}] X_final=${X_final}:`);
      if (badRate.length > 0) {
        issues.push(`  🔴 Rate không thuộc biểu (${badRate.length}):`);
        for (const d of badRate.slice(0, 3)) issues.push(d);
        if (badRate.length > 3) issues.push(`    ... còn ${badRate.length - 3}`);
      }
      if (overRate.length > 0) {
        issues.push(`  🟡 Rate vượt bậc max đạt được — sale dự đoán (${overRate.length}):`);
        for (const d of overRate.slice(0, 3)) issues.push(d);
        if (overRate.length > 3) issues.push(`    ... còn ${overRate.length - 3}`);
      }
      if (capViol.length > 0) {
        issues.push(`  🔴 Vi phạm trần sale NVKD (${capViol.length}):`);
        for (const d of capViol.slice(0, 3)) issues.push(d);
        if (capViol.length > 3) issues.push(`    ... còn ${capViol.length - 3}`);
      }
    }
  }

  console.log("═══ CROSS-CHECK TIER-AWARE (retroactive + saleCap) ═══");
  console.log(`Checked ${totalChecked} products, khớp ${totalMatched}, chênh ${totalChecked - totalMatched}`);
  if (issues.length === 0) {
    console.log("✅ Không có căn nào chênh sau khi apply bậc/hồi tố");
  } else {
    for (const s of issues) console.log(s);
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
