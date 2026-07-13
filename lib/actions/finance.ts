"use server";

import { db } from "@/lib/db";
import { companyInvestments, companyExpenses, companySettings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { toNum, toStr, toStrOrNull, toPct } from "@/lib/parse";
import { requireOwner } from "@/lib/auth";

// ============ INVESTMENTS ============

export async function createInvestment(fd: FormData) {
  await requireOwner();
  const data = {
    investedAt: toStr(fd.get("investedAt")),
    category: toStr(fd.get("category")) as
      | "office"
      | "equipment"
      | "software"
      | "vehicle"
      | "other",
    description: toStr(fd.get("description")),
    amount: toNum(fd.get("amount")),
    amortizationMonths: toNum(fd.get("amortizationMonths")) || null,
    note: toStrOrNull(fd.get("note")),
  };
  if (!data.investedAt) throw new Error("Nhập ngày đầu tư");
  if (!data.description) throw new Error("Nhập mô tả");
  if (data.amount <= 0) throw new Error("Số tiền phải > 0");
  await db.insert(companyInvestments).values(data);
  revalidatePath("/finance");
  revalidatePath("/reports");
}

export async function updateInvestment(id: number, fd: FormData) {
  await requireOwner();
  const data = {
    investedAt: toStr(fd.get("investedAt")),
    category: toStr(fd.get("category")) as
      | "office"
      | "equipment"
      | "software"
      | "vehicle"
      | "other",
    description: toStr(fd.get("description")),
    amount: toNum(fd.get("amount")),
    amortizationMonths: toNum(fd.get("amortizationMonths")) || null,
    note: toStrOrNull(fd.get("note")),
  };
  if (data.amount <= 0) throw new Error("Số tiền phải > 0");
  await db.update(companyInvestments).set(data).where(eq(companyInvestments.id, id));
  revalidatePath("/finance");
  revalidatePath("/reports");
}

export async function deleteInvestment(id: number) {
  await requireOwner();
  await db.delete(companyInvestments).where(eq(companyInvestments.id, id));
  revalidatePath("/finance");
  revalidatePath("/reports");
}

// ============ EXPENSES ============

export async function createExpense(fd: FormData) {
  await requireOwner();
  const data = {
    expenseMonth: toStr(fd.get("expenseMonth")),
    category: toStr(fd.get("category")) as
      | "salary"
      | "rent"
      | "marketing"
      | "utilities"
      | "outsource"
      | "other",
    amount: toNum(fd.get("amount")),
    description: toStrOrNull(fd.get("description")),
    note: toStrOrNull(fd.get("note")),
  };
  if (!data.expenseMonth) throw new Error("Chọn tháng");
  if (data.amount <= 0) throw new Error("Số tiền phải > 0");
  await db.insert(companyExpenses).values(data);
  revalidatePath("/finance");
  revalidatePath("/reports");
}

export async function updateExpense(id: number, fd: FormData) {
  await requireOwner();
  const data = {
    expenseMonth: toStr(fd.get("expenseMonth")),
    category: toStr(fd.get("category")) as
      | "salary"
      | "rent"
      | "marketing"
      | "utilities"
      | "outsource"
      | "other",
    amount: toNum(fd.get("amount")),
    description: toStrOrNull(fd.get("description")),
    note: toStrOrNull(fd.get("note")),
  };
  if (data.amount <= 0) throw new Error("Số tiền phải > 0");
  await db.update(companyExpenses).set(data).where(eq(companyExpenses.id, id));
  revalidatePath("/finance");
  revalidatePath("/reports");
}

export async function deleteExpense(id: number) {
  await requireOwner();
  await db.delete(companyExpenses).where(eq(companyExpenses.id, id));
  revalidatePath("/finance");
  revalidatePath("/reports");
}

// ============ SETTINGS ============

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
