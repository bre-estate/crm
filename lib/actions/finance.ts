"use server";

import { db } from "@/lib/db";
import { companySettings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { toStrOrNull, toPct } from "@/lib/parse";
import { requireOwner } from "@/lib/auth";

// Chỉ giữ updateSettings — Investment/Expense forms bị xóa (2026-07-25).
// Thay bằng financial_transactions từ Phase 1 accounting subsystem.
// Tables company_investments + company_expenses vẫn còn trong schema
// (0 rows), giữ để tránh phá backward compat drizzle types.

export async function updateSettings(fd: FormData) {
  await requireOwner();
  const taxRate = toPct(fd.get("taxRate"));
  const businessStartDate = toStrOrNull(fd.get("businessStartDate"));
  await db
    .update(companySettings)
    .set({ taxRate, businessStartDate, updatedAt: new Date() })
    .where(eq(companySettings.id, 1));
  revalidatePath("/finance");
  revalidatePath("/reports");
}
