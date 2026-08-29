import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  console.log("═══ Activity logs recon #4301 ═══");
  const logs = await sql`
    SELECT id, action, actor_email, created_at, summary
    FROM activity_logs
    WHERE entity_type='revenue_reconciliation' AND entity_id=4301
    ORDER BY created_at
  `;
  logs.forEach((l: any) => console.log(`  [${l.created_at?.toISOString?.()}] ${l.actor_email} ${l.action}: ${l.summary?.slice(0, 100)}`));

  console.log("\n═══ Activity logs cho căn ATSR_DXMD_A-05-07 (product #887) ═══");
  const plogs = await sql`
    SELECT id, entity_type, entity_id, action, actor_email, created_at, summary
    FROM activity_logs
    WHERE product_id=887
    ORDER BY created_at DESC LIMIT 15
  `;
  plogs.forEach((l: any) => console.log(`  [${l.created_at?.toISOString?.()}] ${l.actor_email} ${l.action} ${l.entity_type}#${l.entity_id}: ${l.summary?.slice(0, 100)}`));

  console.log("\n═══ Cùng lúc nào đó recon #4302 (Fenica A.08-10) ═══");
  const flogs = await sql`
    SELECT id, action, actor_email, created_at, summary
    FROM activity_logs
    WHERE entity_type='revenue_reconciliation' AND entity_id=4302
    ORDER BY created_at
  `;
  flogs.forEach((l: any) => console.log(`  [${l.created_at?.toISOString?.()}] ${l.actor_email} ${l.action}: ${l.summary?.slice(0, 100)}`));

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
