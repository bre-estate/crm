/**
 * Cross-check contracts (source of truth) vs data hiện có:
 * - products.pmg_rate (rate CĐT trả BRE) vs contracts.pmg_lk
 * - products.pmg_rate_sale (rate BRE trả sale) vs contracts.pmg_lk_sale
 * - products.admin_fee vs contracts.admin_fee
 * - products.cdt_bonus_sale/manager vs contracts.cdt_bonus_sale
 *
 * Report các căn có rate KHÁC contract → dấu hiệu nhập sai.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number | null | undefined) => n == null ? "?" : String(Math.round((n as number) * 10000) / 10000);
const fmtM = (n: number | null | undefined) => n == null ? "?" : Math.round(n as number).toLocaleString("vi-VN");

async function main() {
  // Products join với contracts qua project_code (từ product_code prefix)
  const rows = await sql`
    SELECT
      c.project_code,
      c.partner_name AS contract_partner,
      c.pmg_lk AS c_pmg_lk,
      c.pmg_lk_sale AS c_pmg_lk_sale,
      c.admin_fee AS c_admin,
      c.cdt_bonus_sale AS c_bonus_sale,
      COUNT(p.id)::int AS n_products,
      COUNT(DISTINCT p.pmg_rate)::int AS distinct_pmg_rate,
      COUNT(DISTINCT p.pmg_sale_rate)::int AS distinct_pmg_rate_sale,
      COUNT(DISTINCT p.admin_fee)::int AS distinct_admin,
      COUNT(DISTINCT p.cdt_bonus_sale)::int AS distinct_bonus_sale,
      AVG(p.pmg_rate)::float8 AS p_pmg_rate_avg,
      AVG(p.pmg_sale_rate)::float8 AS p_pmg_rate_sale_avg,
      AVG(p.admin_fee)::float8 AS p_admin_avg,
      AVG(p.cdt_bonus_sale)::float8 AS p_bonus_sale_avg,
      MIN(p.pmg_rate)::float8 AS p_pmg_rate_min,
      MAX(p.pmg_rate)::float8 AS p_pmg_rate_max
    FROM contracts c
    LEFT JOIN products p ON p.product_code LIKE (c.project_code || '_%')
    WHERE c.project_id IS NOT NULL
    GROUP BY c.project_code, c.partner_name, c.pmg_lk, c.pmg_lk_sale, c.admin_fee, c.cdt_bonus_sale
    ORDER BY c.project_code, c.partner_name
  `;

  console.log("═══ CROSS-CHECK contracts vs products ═══\n");
  console.log("Contract".padEnd(15) + " " + "Partner".padEnd(20) + " " + "n".padStart(4) + "  %PMG_LK Contract/Products  %PMG_sale  Admin  Bonus");
  console.log("─".repeat(120));

  const issues: string[] = [];
  for (const r of rows) {
    const nProd = Number(r.n_products);
    const cPmg = Number(r.c_pmg_lk);
    const pPmgAvg = Number(r.p_pmg_rate_avg);
    const pPmgMin = Number(r.p_pmg_rate_min);
    const pPmgMax = Number(r.p_pmg_rate_max);
    const cSale = Number(r.c_pmg_lk_sale);
    const pSaleAvg = Number(r.p_pmg_rate_sale_avg);
    const cAdmin = Number(r.c_admin);
    const pAdminAvg = Number(r.p_admin_avg);
    const cBonusSale = Number(r.c_bonus_sale);
    const pBonusSaleAvg = Number(r.p_bonus_sale_avg);

    const pmgRange = pPmgMin === pPmgMax ? fmt(pPmgAvg) : `${fmt(pPmgMin)}-${fmt(pPmgMax)}`;

    const pmgMatch = nProd === 0 || Math.abs(pPmgAvg - cPmg) < 0.0001;
    const saleMatch = nProd === 0 || Math.abs(pSaleAvg - cSale) < 0.0001;
    const adminMatch = nProd === 0 || Math.abs(pAdminAvg - cAdmin) < 100;
    const bonusSaleMatch = nProd === 0 || Math.abs(pBonusSaleAvg - (cBonusSale ?? 0)) < 100;

    const pmgMark = pmgMatch ? "✅" : "❌";
    const saleMark = saleMatch ? "✅" : "❌";
    const adminMark = adminMatch ? "✅" : "❌";
    const bonusMark = bonusSaleMatch ? "✅" : "❌";

    console.log(
      `${r.project_code.padEnd(15)} ${(r.contract_partner || "?").padEnd(20)} ${String(nProd).padStart(3)}  ${fmt(cPmg).padStart(6)}/${pmgRange.padEnd(12)} ${pmgMark}  ${fmt(cSale).padStart(6)}/${fmt(pSaleAvg).padStart(6)} ${saleMark}  ${fmtM(cAdmin).padStart(9)}/${fmtM(pAdminAvg).padStart(9)} ${adminMark}  ${bonusMark}`
    );

    if (nProd > 0) {
      if (!pmgMatch) issues.push(`${r.project_code} ${r.contract_partner}: %PMG_LK contract=${fmt(cPmg)} vs products avg=${fmt(pPmgAvg)} (${nProd} căn)`);
      if (!saleMatch) issues.push(`${r.project_code} ${r.contract_partner}: %PMG_sale contract=${fmt(cSale)} vs products avg=${fmt(pSaleAvg)}`);
      if (!adminMatch) issues.push(`${r.project_code} ${r.contract_partner}: admin_fee contract=${fmtM(cAdmin)} vs products avg=${fmtM(pAdminAvg)}`);
      if (!bonusSaleMatch) issues.push(`${r.project_code} ${r.contract_partner}: cdt_bonus_sale contract=${fmtM(cBonusSale)} vs products avg=${fmtM(pBonusSaleAvg)}`);
    }
  }

  console.log("\n═══ TỔNG HỢP CHÊNH ═══");
  if (issues.length === 0) {
    console.log("✅ MỌI RATE KHỚP CONTRACT — data products chính xác");
  } else {
    console.log(`❌ ${issues.length} chênh:`);
    for (const s of issues) console.log(`  ${s}`);
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
