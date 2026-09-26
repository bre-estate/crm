/**
 * Backfill payments_out cho các cost_recons chưa có payment.
 * Nghiệp vụ: admin trước giờ bận, không nhập ngày thanh toán vào Excel.
 * Confirm: các giao dịch hiện tại đều đã thanh toán đầy đủ.
 *
 * Tạo payment_out cho mỗi cost_recon:
 *   - amount = amountPayableThisTime (số phải trả)
 *   - paymentDate = null (chưa rõ, sẽ nhập sau)
 *
 * Chỉ backfill cho recons CHƯA có payment_out nào (skip nếu đã có).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import { eq, notInArray, isNotNull } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

async function main() {
  // Lấy tất cả reconIds đã có payment_out
  const existingPayments = await db
    .selectDistinct({ id: schema.paymentsOut.costReconciliationId })
    .from(schema.paymentsOut)
    .where(isNotNull(schema.paymentsOut.costReconciliationId));
  const paidReconIds = existingPayments
    .map((r) => r.id)
    .filter((id): id is number => id !== null);
  console.log(`Đã có payment_out cho ${paidReconIds.length} recons`);

  // Lấy cost_recons chưa có payment (và amount > 0)
  const recons =
    paidReconIds.length > 0
      ? await db
          .select({
            id: schema.costReconciliations.id,
            amount: schema.costReconciliations.amountPayableThisTime,
          })
          .from(schema.costReconciliations)
          .where(notInArray(schema.costReconciliations.id, paidReconIds))
      : await db
          .select({
            id: schema.costReconciliations.id,
            amount: schema.costReconciliations.amountPayableThisTime,
          })
          .from(schema.costReconciliations);

  const toInsert = recons.filter((r) => Number(r.amount ?? 0) !== 0);
  console.log(`Sẽ backfill ${toInsert.length} payment_out mới (amount != 0)`);

  if (toInsert.length === 0) {
    console.log("Nothing to do.");
    await client.end();
    return;
  }

  // Batch insert
  for (const r of toInsert) {
    await db.insert(schema.paymentsOut).values({
      costReconciliationId: r.id,
      paymentDate: null,
      amount: Number(r.amount ?? 0),
      note: "Backfill: admin confirm đã trả đầy đủ (ngày chưa xác định)",
    });
  }
  console.log(`Inserted ${toInsert.length} payment_out records`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
