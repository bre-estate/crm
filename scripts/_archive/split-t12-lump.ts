/**
 * Split 3 row gộp cục T1/2026 (Lương + Phụ Cấp + Thưởng T12 cho Bách/Thành/Nhật):
 *   - UPDATE row gốc → chỉ giữ lương cứng, category 6411
 *   - INSERT row mới → HH + thưởng (phần còn lại), category 6417
 *
 * accrualMonth = 2025-12 cho cả 2 (đây là chi phí phát sinh T12/2025, chi T1/2026).
 * Lương cứng lấy median từ pattern quá khứ + tương lai đã tách rõ.
 */

import { db } from "../lib/db";
import { financialTransactions } from "../lib/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const SPLIT_PLAN = [
  { rowId: 1082, name: "Bách", salary: 13_425_000 },
  { rowId: 1083, name: "Thành", salary: 7_160_000 },
  { rowId: 1086, name: "Nhật", salary: 5_817_500 },
];

const ACCRUAL = "2025-12"; // Chi phí phát sinh T12/2025

async function main() {
  for (const p of SPLIT_PLAN) {
    const [orig] = await db
      .select()
      .from(financialTransactions)
      .where(eq(financialTransactions.id, p.rowId));
    if (!orig) {
      console.log(`❌ Row ${p.rowId} không tồn tại — skip`);
      continue;
    }
    const total = Number(orig.amount);
    const hhAmount = total - p.salary;
    if (hhAmount < 0) {
      console.log(`❌ ${p.name}: lương ${fmt(p.salary)} > tổng ${fmt(total)} — sai, skip`);
      continue;
    }

    console.log(`\n▸ ${p.name} (row ${p.rowId})`);
    console.log(`    Tổng gốc  : ${fmt(total)}`);
    console.log(`    → Lương cứng (6411): ${fmt(p.salary)}`);
    console.log(`    → HH + Thưởng (6417): ${fmt(hhAmount)}`);

    // 1. UPDATE original row → lương cứng
    await db
      .update(financialTransactions)
      .set({
        amount: p.salary,
        categoryCode: "6411",
        managementGroup: "1a. Lương NVKD",
        accrualMonth: ACCRUAL,
        description: `Lương T12 2025 (tách từ gộp cục ${fmt(total)})`,
        note: `Split: lương cứng ${fmt(p.salary)} (median từ pattern quá khứ+tương lai). Row HH+thưởng #ID mới. Split 2026-07-28.`,
      })
      .where(eq(financialTransactions.id, p.rowId));

    // 2. INSERT new row → HH + thưởng
    const newDedupKey = createHash("sha1")
      .update(`split-hh-${p.rowId}-2026-07-28`)
      .digest("hex");
    const [inserted] = await db
      .insert(financialTransactions)
      .values({
        transactionDate: orig.transactionDate,
        transactionMonth: orig.transactionMonth,
        accrualMonth: ACCRUAL,
        description: `HH + Thưởng T12 2025 (tách từ gộp cục ${fmt(total)})`,
        amount: hhAmount,
        direction: orig.direction,
        categoryCode: "6417",
        managementGroup: "1b. HH sale + Marketing + Thưởng doanh số",
        payer: orig.payer,
        recipient: orig.recipient,
        hasInvoice: orig.hasInvoice ?? false,
        invoiceValid: orig.invoiceValid,
        sourceFile: orig.sourceFile,
        sourceRow: orig.sourceRow,
        dedupKey: newDedupKey,
        note: `Split từ row #${p.rowId} (gộp cục ${fmt(total)}, lương ${fmt(p.salary)}). Split 2026-07-28.`,
      })
      .returning({ id: financialTransactions.id });
    console.log(`    ✅ INSERT row #${inserted.id} (HH+thưởng ${fmt(hhAmount)})`);
  }

  // Verify
  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`  VERIFY: tổng amount cho 3 người T1/2026 phải giữ nguyên`);
  console.log(`═════════════════════════════════════════════════`);
  for (const p of SPLIT_PLAN) {
    const rows = await db
      .select({
        id: financialTransactions.id,
        amount: financialTransactions.amount,
        category: financialTransactions.categoryCode,
        desc: financialTransactions.description,
      })
      .from(financialTransactions)
      .where(eq(financialTransactions.recipient, p.name === "Bách" ? "Đoàn Lê Bách" : p.name === "Thành" ? "Hồ Nguyễn Công Thành" : "Trần Minh Nhật"));
    const t12rows = rows.filter((r) =>
      r.desc.includes("T12 2025 (tách") || (r.id === p.rowId),
    );
    let sum = 0;
    console.log(`  ${p.name}:`);
    for (const r of t12rows) {
      console.log(`    [${r.id}] ${r.category} · ${fmt(Number(r.amount)).padStart(14)} · ${r.desc.substring(0, 60)}`);
      sum += Number(r.amount);
    }
    console.log(`    → Tổng: ${fmt(sum)}\n`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
