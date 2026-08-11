/**
 * Copy admin_fee + admin_fee_sale từ contracts sang projects tương ứng.
 * Match qua full_code = contract.project_code (VD EMGV_DT25).
 * Chỉ overwrite nếu project.admin_fee đang null hoặc 0 (không đè giá trị đã sửa tay).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  const rows = await sql<Array<{
    project_id: number;
    full_code: string;
    project_name: string;
    project_admin_fee: number | null;
    project_admin_fee_sale: number | null;
    contract_admin_fee: number | null;
    contract_admin_fee_sale: number | null;
  }>>`
    SELECT
      p.id AS project_id,
      p.full_code,
      p.name AS project_name,
      p.admin_fee AS project_admin_fee,
      p.admin_fee_sale AS project_admin_fee_sale,
      c.admin_fee AS contract_admin_fee,
      c.admin_fee_sale AS contract_admin_fee_sale
    FROM projects p
    JOIN contracts c ON c.project_code = p.full_code
    ORDER BY p.name
  `;

  let updated = 0, skipped = 0;
  for (const r of rows) {
    const patch: Record<string, number> = {};

    // admin fee: chỉ copy nếu project đang 0/null VÀ contract có giá trị > 0
    if ((r.project_admin_fee == null || r.project_admin_fee === 0) &&
        r.contract_admin_fee != null && r.contract_admin_fee > 0) {
      patch.admin_fee = Math.round(r.contract_admin_fee);
    }
    if ((r.project_admin_fee_sale == null || r.project_admin_fee_sale === 0) &&
        r.contract_admin_fee_sale != null && r.contract_admin_fee_sale > 0) {
      patch.admin_fee_sale = Math.round(r.contract_admin_fee_sale);
    }

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    await sql`UPDATE projects SET ${sql(patch)} WHERE id = ${r.project_id}`;
    updated++;
    const cols = Object.entries(patch).map(([k, v]) => `${k}=${v.toLocaleString("vi-VN")}`).join(", ");
    console.log(`  ✓ #${r.project_id} ${r.full_code.padEnd(15)} ${r.project_name.padEnd(30)} ← ${cols}`);
  }

  console.log(`\n✅ Updated ${updated} projects, skip ${skipped} (đã có admin fee hoặc contract không có data)`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
