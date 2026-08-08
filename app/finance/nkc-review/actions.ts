"use server";
import { db } from "@/lib/db";
import { accountingJournal } from "@/lib/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import type { CategoryKey } from "@/lib/transaction-classifier";

export async function updateNkcCategory(id: number, category: CategoryKey) {
  await requirePermission("finance", "edit");
  await db.update(accountingJournal)
    .set({ category, categorySource: "manual", categoryConfidence: 100 })
    .where(eq(accountingJournal.id, id));
  revalidatePath("/finance/nkc-review");
  revalidatePath("/reports/profit-detail");
}

export async function bulkAssignNkcCategory(ids: number[], category: CategoryKey) {
  await requirePermission("finance", "edit");
  if (ids.length === 0) return;
  await db.update(accountingJournal)
    .set({ category, categorySource: "manual", categoryConfidence: 100 })
    .where(inArray(accountingJournal.id, ids));
  revalidatePath("/finance/nkc-review");
  revalidatePath("/reports/profit-detail");
}

export async function rerunNkcClassifier() {
  await requirePermission("finance", "edit");
  const { classifyNkc } = await import("@/lib/transaction-classifier");
  const rows = await db.select({
    id: accountingJournal.id,
    debitAccount: accountingJournal.debitAccount,
    creditAccount: accountingJournal.creditAccount,
    description: accountingJournal.description,
    amount: accountingJournal.amount,
  }).from(accountingJournal)
    .where(sql`category_source IS DISTINCT FROM 'manual'`);
  for (const r of rows) {
    const result = classifyNkc({
      debitAccount: r.debitAccount,
      creditAccount: r.creditAccount,
      description: r.description ?? "",
      amount: Number(r.amount),
    });
    await db.update(accountingJournal)
      .set({ category: result.category, categorySource: "auto", categoryConfidence: result.confidence })
      .where(eq(accountingJournal.id, r.id));
  }
  revalidatePath("/finance/nkc-review");
  revalidatePath("/reports/profit-detail");
  return rows.length;
}

/**
 * Split 1 row NKC thành 2 phần (VD row 347M "hoa hồng + KPI QL" tách 272M+75M).
 * Insert 1 row mới với category khác, giảm amount row gốc.
 */
export async function splitNkcRow(id: number, splitAmount: number, newCategory: CategoryKey) {
  await requirePermission("finance", "edit");
  const [row] = await db.select().from(accountingJournal).where(eq(accountingJournal.id, id));
  if (!row) throw new Error("Row not found");
  const origAmount = Number(row.amount);
  if (splitAmount <= 0 || splitAmount >= origAmount) throw new Error("Invalid split amount");

  // Insert row mới với phần tách
  const { id: _drop, dedupKey, createdAt, ...rest } = row;
  await db.insert(accountingJournal).values({
    ...rest,
    amount: splitAmount,
    category: newCategory,
    categorySource: "manual",
    categoryConfidence: 100,
    description: `[SPLIT ${splitAmount.toLocaleString("vi-VN")}] ${row.description ?? ""}`,
    dedupKey: `${dedupKey}_split_${Date.now()}`,
  });
  // Giảm amount row gốc + đánh dấu manual
  await db.update(accountingJournal)
    .set({
      amount: origAmount - splitAmount,
      categorySource: "manual",
      categoryConfidence: 100,
      description: `[SPLIT origin ${(origAmount - splitAmount).toLocaleString("vi-VN")}/${origAmount.toLocaleString("vi-VN")}] ${row.description ?? ""}`,
    })
    .where(eq(accountingJournal.id, id));

  revalidatePath("/finance/nkc-review");
  revalidatePath("/reports/profit-detail");
}
