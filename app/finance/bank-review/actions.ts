"use server";
import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import type { CategoryKey } from "@/lib/transaction-classifier";

export async function updateCategory(id: number, category: CategoryKey) {
  await requirePermission("finance", "edit");
  await db.update(bankTransactions)
    .set({ category, categorySource: "manual", categoryConfidence: 100 })
    .where(eq(bankTransactions.id, id));
  revalidatePath("/finance/bank-review");
}

export async function bulkAssignCategory(ids: number[], category: CategoryKey) {
  await requirePermission("finance", "edit");
  if (ids.length === 0) return;
  await db.update(bankTransactions)
    .set({ category, categorySource: "manual", categoryConfidence: 100 })
    .where(inArray(bankTransactions.id, ids));
  revalidatePath("/finance/bank-review");
}

export async function rerunClassifier() {
  await requirePermission("finance", "edit");
  const { classify } = await import("@/lib/transaction-classifier");
  const rows = await db.select({
    id: bankTransactions.id,
    description: bankTransactions.description,
    debitAmount: bankTransactions.debitAmount,
    creditAmount: bankTransactions.creditAmount,
    partnerName: bankTransactions.partnerName,
  }).from(bankTransactions)
    .where(sql`category_source IS DISTINCT FROM 'manual'`);
  for (const r of rows) {
    const result = classify({
      description: r.description ?? "",
      debitAmount: r.debitAmount,
      creditAmount: r.creditAmount,
      partnerName: r.partnerName,
    });
    await db.update(bankTransactions)
      .set({ category: result.category, categorySource: "auto", categoryConfidence: result.confidence })
      .where(eq(bankTransactions.id, r.id));
  }
  revalidatePath("/finance/bank-review");
  return rows.length;
}
