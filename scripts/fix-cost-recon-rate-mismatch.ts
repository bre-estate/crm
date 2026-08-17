/**
 * Fix 4 cost_reconciliations có commission_rate lệch với product.sale_commission_rate.
 * Nguyên nhân: admin gõ nhầm 55 thay vì 65 (4 lần cách nhau vài phút — không phải batch).
 * Cách sửa: rate 0.55 → 0.65; amount_payable_this_time × (65/55).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const FIXES = [
  { id: 5730, oldRate: 0.55, newRate: 0.65, projectName: "EMGB_DT26 căn B-15-10" },
  { id: 5731, oldRate: 0.55, newRate: 0.65, projectName: "EMGB_DT26 căn A-07-09" },
  { id: 5732, oldRate: 0.55, newRate: 0.65, projectName: "EMGB_DT26 căn B-31-02" },
  { id: 5733, oldRate: 0.55, newRate: 0.65, projectName: "EMGB_PITA căn B-30-10" },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  for (const f of FIXES) {
    const [r] = await sql`
      SELECT id, commission_rate, amount_payable_this_time
      FROM cost_reconciliations WHERE id = ${f.id}
    `;
    if (!r) {
      console.log(`  ⚠️  #${f.id} không tồn tại, skip`);
      continue;
    }
    const currentRate = Number(r.commission_rate);
    if (Math.abs(currentRate - f.oldRate) > 0.0001) {
      console.log(`  ⚠️  #${f.id} rate hiện tại ${currentRate} khác ${f.oldRate} — skip (đã có ai sửa?)`);
      continue;
    }
    const oldAmt = Number(r.amount_payable_this_time);
    const newAmt = Math.round(oldAmt * f.newRate / f.oldRate);
    await sql`
      UPDATE cost_reconciliations
      SET commission_rate = ${f.newRate},
          amount_payable_this_time = ${newAmt}
      WHERE id = ${f.id}
    `;
    console.log(`  ✓ #${f.id} ${f.projectName}: rate ${f.oldRate} → ${f.newRate}, amount ${oldAmt.toLocaleString('vi-VN')} → ${newAmt.toLocaleString('vi-VN')}`);
  }
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
