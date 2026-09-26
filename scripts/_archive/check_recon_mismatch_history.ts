/**
 * Check activity_logs cho 6 recon lệch mức: xem căn có bị sửa rate sau khi tạo recon không?
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const CASES = [
  { reconId: 5505, code: "EMGV_DT25_A1-12-17", field: "sale_commission_rate", reconRate: 0.50, productRate: 0.55, type: "%HH sale" },
  { reconId: 5431, code: "AVIO_BAML_B.30.20", field: "kpi_tpkd_rate", reconRate: 0.03, productRate: 0.04, type: "%KPI TPKD" },
  { reconId: 5430, code: "AVIO_BAML_B.16.11", field: "kpi_tpkd_rate", reconRate: 0.03, productRate: 0.04, type: "%KPI TPKD" },
  { reconId: 5647, code: "EMGV_VX26_B1-22-20", field: "pmg_sale_rate", reconRate: 0.07, productRate: 0.065, type: "%PMG_LK_sale (vượt trần)" },
  { reconId: 5633, code: "EMGV_VX26_B1-22-20", field: "pmg_sale_rate", reconRate: 0.07, productRate: 0.065, type: "%PMG_LK_sale (vượt trần)" },
  { reconId: 5492, code: "ATSR_OPLR_B-09-11A", field: "pmg_sale_rate", reconRate: 0.05, productRate: 0.04, type: "%PMG_LK_sale (vượt trần)" },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  for (const c of CASES) {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`▸ Recon #${c.reconId} — ${c.code} — ${c.type}`);
    console.log(`  Recon ${(c.reconRate * 100).toFixed(2)}%  vs  Căn ${(c.productRate * 100).toFixed(2)}%`);

    // Recon info
    const [recon] = await sql`
      SELECT cr.id, cr.product_id, cr.created_at, cr.employee_name
      FROM cost_reconciliations cr
      WHERE cr.id = ${c.reconId}
    `;
    if (!recon) {
      console.log(`  ⚠️  Recon không tồn tại`);
      continue;
    }
    console.log(`  Recon tạo: ${recon.created_at?.toISOString?.() ?? recon.created_at}`);

    // Có log update chính recon này không?
    const reconLogs = await sql`
      SELECT action, actor_email, created_at, changes
      FROM activity_logs
      WHERE entity_type = 'cost_reconciliation' AND entity_id = ${c.reconId}
      ORDER BY created_at DESC LIMIT 10
    `;
    if (reconLogs.length > 0) {
      console.log(`  Recon activity logs (${reconLogs.length}):`);
      reconLogs.forEach((l: any) => {
        const time = l.created_at?.toISOString?.() ?? l.created_at;
        console.log(`     [${time}] ${l.actor_email ?? "?"} ${l.action}`);
      });
    }

    // Activity logs cho product này
    const logs = await sql`
      SELECT id, action, actor_email, created_at, changes, summary
      FROM activity_logs
      WHERE entity_type = 'product' AND entity_id = ${recon.product_id}
      ORDER BY created_at DESC
      LIMIT 30
    `;
    console.log(`  Product #${recon.product_id} có ${logs.length} activity logs`);

    // Filter logs sửa rate field liên quan
    const rateChanges = logs.filter((l: any) => {
      const changes = l.changes;
      if (!changes || typeof changes !== "object") return false;
      return c.field in changes || `product.${c.field}` in changes;
    });

    if (rateChanges.length === 0) {
      console.log(`  → KHÔNG có log sửa \`${c.field}\` cho căn này`);
      console.log(`     ⇒ Nhiều khả năng: recon nhập SAI từ đầu (căn chưa từng bị sửa)`);
    } else {
      console.log(`  → ${rateChanges.length} lần sửa \`${c.field}\`:`);
      for (const l of rateChanges) {
        const change = l.changes[c.field] ?? l.changes[`product.${c.field}`];
        const time = l.created_at?.toISOString?.() ?? l.created_at;
        console.log(`     [${time}] ${l.actor_email ?? "?"}: ${JSON.stringify(change)}`);
      }
    }

    // Timeline: check ALL rate-related fields
    const allRateLogs = logs.filter((l: any) => {
      const changes = l.changes;
      if (!changes || typeof changes !== "object") return false;
      return Object.keys(changes).some(k =>
        k.includes("rate") || k.includes("Rate") || k.includes("commission") || k.includes("kpi") || k.includes("pmg")
      );
    });
    if (allRateLogs.length > 0 && allRateLogs.length !== rateChanges.length) {
      console.log(`  → Ngoài ra ${allRateLogs.length - rateChanges.length} log sửa rate khác (field khác):`);
      for (const l of allRateLogs.slice(0, 5)) {
        if (rateChanges.includes(l)) continue;
        const time = l.created_at?.toISOString?.() ?? l.created_at;
        const keys = Object.keys(l.changes).filter(k =>
          k.includes("rate") || k.includes("Rate") || k.includes("commission") || k.includes("kpi") || k.includes("pmg")
        );
        console.log(`     [${time}] ${l.actor_email ?? "?"}: ${keys.join(", ")}`);
      }
    }
  }

  await sql.end();
  console.log(`\n${"═".repeat(70)}\n`);
}
main().catch(e => { console.error(e); process.exit(1); });
