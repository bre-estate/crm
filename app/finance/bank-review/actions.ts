"use server";
import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
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
