import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: any) => Math.round(Number(n)).toLocaleString("vi-VN");
async function main() {
  const rows = await sql`
    SELECT COUNT(*) FILTER (WHERE ABS(revenue_this_time - (total_receivable_this_time - cdt_bonus_sale - cdt_bonus_manager)) > 1000) as bugRows,
      COUNT(*) as totalRows
    FROM revenue_reconciliations`;
  console.log(`Tổng rr: ${rows[0].totalrows}`);
  console.log(`Row bị lệch (rev != total-bs-bm): ${rows[0].bugrows}`);

  // Sample vài row lệch
  console.log("\n═══ Sample 10 row bị lệch ═══");
  const s = await sql`
    SELECT rr.id, p.unit_code, rr.reconciliation_date, rr.revenue_this_time, rr.cdt_bonus_sale, rr.cdt_bonus_manager, rr.total_receivable_this_time
    FROM revenue_reconciliations rr LEFT JOIN products p ON p.id=rr.product_id
    WHERE ABS(revenue_this_time - (total_receivable_this_time - cdt_bonus_sale - cdt_bonus_manager)) > 1000
    ORDER BY rr.reconciliation_date DESC LIMIT 10`;
  for (const r of s) console.log(`  rr#${r.id} · ${r.unit_code} · ${r.reconciliation_date} · rev=${fmt(r.revenue_this_time)} vs total-bonus=${fmt(Number(r.total_receivable_this_time)-Number(r.cdt_bonus_sale)-Number(r.cdt_bonus_manager))}`);
  await sql.end();
}
main();
