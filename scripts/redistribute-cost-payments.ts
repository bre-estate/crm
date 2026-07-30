/**
 * Fix data: redistribute payment_out từ recon "trả dư" sang recon "chưa trả"
 * cùng batch (product + employee + date).
 *
 * Điều kiện an toàn: chỉ redistribute khi:
 *   sum(paid) trong batch = sum(payable) trong batch (chênh < 1000)
 * Nghĩa là tổng đã đúng, chỉ phân bổ sai chỗ. Không sờ vào batch chênh lệch thật.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import { sql, eq } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN — không ghi DB ===" : "=== LIVE MODE ===");

  // Load recon + tổng paid per recon
  const reconRows = await db.execute(sql`
    SELECT
      cr.id,
      cr.product_id,
      cr.employee_name,
      cr.reconciliation_date,
      cr.cost_type,
      cr.amount_payable_this_time::float8 AS payable,
      COALESCE((SELECT SUM(amount) FROM payments_out WHERE cost_reconciliation_id = cr.id), 0)::float8 AS paid
    FROM cost_reconciliations cr
    WHERE cr.reconciliation_date IS NOT NULL
  `);
  const recons = reconRows as unknown as Array<{
    id: number;
    product_id: number;
    employee_name: string;
    reconciliation_date: string;
    cost_type: string;
    payable: number;
    paid: number;
  }>;

  // Group by batch (product + employee + date)
  const batches = new Map<string, typeof recons>();
  for (const r of recons) {
    const key = `${r.product_id}|${r.employee_name}|${r.reconciliation_date}`;
    const list = batches.get(key) ?? [];
    list.push(r);
    batches.set(key, list);
  }

  let batchesFixed = 0;
  let paymentsRewritten = 0;
  const notFixed: string[] = [];

  for (const [key, batch] of batches) {
    if (batch.length < 2) continue; // batch 1 recon → không thể split sai
    const sumPayable = batch.reduce((s, r) => s + r.payable, 0);
    const sumPaid = batch.reduce((s, r) => s + r.paid, 0);
    if (Math.abs(sumPaid - sumPayable) > 1000) {
      notFixed.push(
        `${key}: tổng ko cân (payable ${sumPayable}, paid ${sumPaid}) — skip`,
      );
      continue;
    }
    // Có ít nhất 1 recon "trả dư" (paid > payable) và 1 recon "chưa trả"?
    const hasOverpaid = batch.some((r) => r.paid - r.payable > 1000);
    const hasUnderpaid = batch.some((r) => r.payable - r.paid > 1000);
    if (!hasOverpaid || !hasUnderpaid) continue;

    // Load existing payments_out cho toàn batch để lấy paymentDate + note
    const reconIds = batch.map((r) => r.id);
    const existingPayments = await db.execute(sql`
      SELECT id, cost_reconciliation_id, payment_date, note
      FROM payments_out
      WHERE cost_reconciliation_id = ANY(ARRAY[${sql.raw(reconIds.join(","))}]::int[])
      ORDER BY payment_date, id
    `);
    const existing = existingPayments as unknown as Array<{
      id: number;
      cost_reconciliation_id: number;
      payment_date: string | null;
      note: string | null;
    }>;
    // Lấy payment_date "gốc" — dòng đầu tiên trong batch
    const paymentDate = existing[0]?.payment_date ?? null;
    const paymentNote = existing[0]?.note ?? null;

    console.log(
      `\nBatch ${key} · ${batch.length} recons · sumPayable ${Math.round(sumPayable).toLocaleString("vi-VN")}`,
    );
    for (const r of batch) {
      console.log(
        `  #${r.id} ${r.cost_type}: payable ${Math.round(r.payable).toLocaleString("vi-VN")} · paid ${Math.round(r.paid).toLocaleString("vi-VN")}`,
      );
    }

    if (DRY_RUN) {
      batchesFixed++;
      continue;
    }

    // LIVE: delete all payments_out cho batch, rebuild 1 payment per recon = payable
    for (const p of existing) {
      await db.delete(schema.paymentsOut).where(eq(schema.paymentsOut.id, p.id));
    }
    for (const r of batch) {
      if (Math.abs(r.payable) < 1) continue; // skip recon 0đ
      await db.insert(schema.paymentsOut).values({
        costReconciliationId: r.id,
        paymentDate,
        amount: r.payable,
        note: paymentNote,
      });
      paymentsRewritten++;
    }
    batchesFixed++;
    console.log(`  → Đã redistribute`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Batches fixed: ${batchesFixed}`);
  console.log(`Payments rewritten: ${paymentsRewritten}`);
  if (notFixed.length > 0) {
    console.log(`\n${notFixed.length} batches skipped (tổng không cân):`);
    notFixed.slice(0, 10).forEach((s) => console.log(`  ${s}`));
    if (notFixed.length > 10) console.log(`  ... và ${notFixed.length - 10} batches nữa`);
  }
  if (DRY_RUN) console.log("\n(DRY RUN — chưa ghi. Chạy lại không có --dry-run để apply)");
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error("Lỗi:", err);
    await client.end();
    process.exit(1);
  });
