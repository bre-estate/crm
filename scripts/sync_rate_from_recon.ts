/**
 * Sync rate từ recon → product config khi product rate = 0.
 *
 * Product config lưu 4 rate: sale_commission_rate, kpi_ceo_rate, kpi_tpkd_rate,
 * kpi_admin_rate. Recon lưu snapshot rate (commission_rate + kpi_rate). Nếu ai
 * tạo recon với rate > 0 nhưng quên set rate ở product → form edit hiển thị 0%,
 * misleading. Script này bù đắp: lấy rate của recon MỚI NHẤT của mỗi (product,
 * cost_type) → set vào product rate nếu product rate = 0.
 *
 * Chỉ cover 4 cost_type dùng rate: sale_commission, kpi_ceo, kpi_tpkd, kpi_admin.
 * Không đụng cdt_bonus_* (flat amount, không có rate).
 *
 * Chạy: npx tsx scripts/sync_rate_from_recon.ts --dry (xem trước)
 *       npx tsx scripts/sync_rate_from_recon.ts (apply)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

type CostType = "sale_commission" | "kpi_ceo" | "kpi_tpkd" | "kpi_admin";
const RATE_FIELD: Record<CostType, "sale_commission_rate" | "kpi_ceo_rate" | "kpi_tpkd_rate" | "kpi_admin_rate"> = {
  sale_commission: "sale_commission_rate",
  kpi_ceo: "kpi_ceo_rate",
  kpi_tpkd: "kpi_tpkd_rate",
  kpi_admin: "kpi_admin_rate",
};

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const dryRun = process.argv.includes("--dry");

  // Recon rate: sale_commission → commission_rate; kpi_* → kpi_rate.
  // Chọn rate MỚI NHẤT (theo reconciliation_date DESC, id DESC) cho mỗi (product, cost_type).
  const rows = await sql<
    {
      product_id: number;
      unit_code: string;
      cost_type: string;
      recon_id: number;
      recon_rate: number | null;
      product_rate: number | null;
    }[]
  >`
    WITH latest_rate AS (
      SELECT DISTINCT ON (cr.product_id, cr.cost_type)
        cr.product_id, cr.cost_type, cr.id AS recon_id,
        CASE WHEN cr.cost_type = 'sale_commission'
             THEN cr.commission_rate
             ELSE cr.kpi_rate
        END AS recon_rate
      FROM cost_reconciliations cr
      WHERE cr.cost_type IN ('sale_commission', 'kpi_ceo', 'kpi_tpkd', 'kpi_admin')
      ORDER BY cr.product_id, cr.cost_type, cr.reconciliation_date DESC NULLS LAST, cr.id DESC
    )
    SELECT lr.product_id, p.unit_code, lr.cost_type, lr.recon_id, lr.recon_rate,
      CASE lr.cost_type
        WHEN 'sale_commission' THEN p.sale_commission_rate
        WHEN 'kpi_ceo' THEN p.kpi_ceo_rate
        WHEN 'kpi_tpkd' THEN p.kpi_tpkd_rate
        WHEN 'kpi_admin' THEN p.kpi_admin_rate
      END AS product_rate
    FROM latest_rate lr
    JOIN products p ON p.id = lr.product_id
    WHERE lr.recon_rate IS NOT NULL AND lr.recon_rate > 0
    ORDER BY lr.product_id, lr.cost_type
  `;

  // Chỉ update khi product rate = 0 (hoặc null) và recon rate > 0
  const toUpdate = rows.filter(
    (r) => (r.product_rate ?? 0) === 0 && Number(r.recon_rate) > 0,
  );

  console.log(`Tìm thấy ${rows.length} (product, cost_type) pair có recon với rate > 0`);
  console.log(`  → ${toUpdate.length} pair cần sync (product rate = 0)`);
  if (toUpdate.length === 0) {
    console.log("Không có gì để sync.");
    await sql.end();
    return;
  }
  console.log("\n--- Chi tiết cần sync ---");
  console.table(
    toUpdate.map((r) => ({
      product_id: r.product_id,
      unit_code: r.unit_code,
      cost_type: r.cost_type,
      recon_rate_pct: `${(Number(r.recon_rate) * 100).toFixed(2)}%`,
      product_rate_pct: `${((r.product_rate ?? 0) * 100).toFixed(2)}%`,
      from_recon: r.recon_id,
    })),
  );

  if (dryRun) {
    console.log("\n(dry-run, không apply)");
    await sql.end();
    return;
  }

  let n = 0;
  for (const r of toUpdate) {
    const field = RATE_FIELD[r.cost_type as CostType];
    const newRate = Number(r.recon_rate);
    // Dynamic SQL cần đảm bảo field name whitelist (đã check ở RATE_FIELD map)
    if (field === "sale_commission_rate") {
      await sql`UPDATE products SET sale_commission_rate = ${newRate} WHERE id = ${r.product_id}`;
    } else if (field === "kpi_ceo_rate") {
      await sql`UPDATE products SET kpi_ceo_rate = ${newRate} WHERE id = ${r.product_id}`;
    } else if (field === "kpi_tpkd_rate") {
      await sql`UPDATE products SET kpi_tpkd_rate = ${newRate} WHERE id = ${r.product_id}`;
    } else if (field === "kpi_admin_rate") {
      await sql`UPDATE products SET kpi_admin_rate = ${newRate} WHERE id = ${r.product_id}`;
    }
    n++;
  }
  console.log(`\n✅ Đã sync ${n} rate cho ${new Set(toUpdate.map((r) => r.product_id)).size} căn`);
  await sql.end();
}
main();
