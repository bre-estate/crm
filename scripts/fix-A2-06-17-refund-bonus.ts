/**
 * Fix recon #4255 căn A2-06-17: hoàn thưởng nóng bị lưu nhầm.
 * revenue_this_time = -11tr → cdt_bonus_sale = -11tr, revenue_this_time = 0.
 * Bản chất là hoàn thưởng nóng CĐT (bù trừ đợt trước 23/04 = +11tr).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  const [before] = await sql`
    SELECT id, revenue_this_time, cdt_bonus_sale
    FROM revenue_reconciliations WHERE id = 4255
  `;
  if (!before) {
    console.log("Recon #4255 không tồn tại.");
    await sql.end();
    return;
  }
  console.log("Before:", JSON.stringify(before));

  await sql`
    UPDATE revenue_reconciliations
    SET revenue_this_time = 0, cdt_bonus_sale = -11000000
    WHERE id = 4255
  `;

  const [after] = await sql`
    SELECT id, revenue_this_time, cdt_bonus_sale
    FROM revenue_reconciliations WHERE id = 4255
  `;
  console.log("After: ", JSON.stringify(after));

  await sql.end();
  console.log("\n✅ Done.");
}
main().catch(e => { console.error(e); process.exit(1); });
