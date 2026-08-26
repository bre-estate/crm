"use server";

import { db } from "@/lib/db";
import { expenseRequests } from "@/lib/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requirePermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { toNum, toStr, toStrOrNull } from "@/lib/parse";

const VALID_CATEGORIES = [
  "office",
  "marketing",
  "entertainment",
  "travel",
  "salary",
  "commission",
  "tax",
  "other",
] as const;

const VALID_PAYMENT_METHODS = ["cash", "bank", "card"] as const;

function toCategory(v: unknown): (typeof VALID_CATEGORIES)[number] {
  const s = String(v ?? "other");
  return (VALID_CATEGORIES as readonly string[]).includes(s)
    ? (s as (typeof VALID_CATEGORIES)[number])
    : "other";
}

function toPaymentMethod(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return (VALID_PAYMENT_METHODS as readonly string[]).includes(s) ? s : null;
}

/** Auto-gen expense_code: EXP-YYYY-#### theo năm hiện tại. */
async function nextExpenseCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `EXP-${year}-`;
  const [row] = await db
    .select({ maxCode: sql<string>`MAX(${expenseRequests.expenseCode})` })
    .from(expenseRequests)
    .where(sql`${expenseRequests.expenseCode} LIKE ${prefix + "%"}`);
  const max = row?.maxCode ?? null;
  let seq = 1;
  if (max) {
    const tail = max.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

function buildBaseData(fd: FormData) {
  return {
    title: toStr(fd.get("title")).trim() || "(Không tiêu đề)",
    category: toCategory(fd.get("category")),
    amount: toNum(fd.get("amount")),
    expenseDate: toStr(fd.get("expenseDate")) || new Date().toISOString().slice(0, 10),
    paymentMethod: toPaymentMethod(fd.get("paymentMethod")),
    approverEmail: toStrOrNull(fd.get("approverEmail")),
    note: toStrOrNull(fd.get("note")),
    accountCode: toStrOrNull(fd.get("accountCode")),
  };
}

export async function createExpense(fd: FormData) {
  const user = await requirePermission("expenses", "edit");
  const data = buildBaseData(fd);
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error("Số tiền phải > 0");
  }

  const expenseCode = await nextExpenseCode();
  const [rec] = await db
    .insert(expenseRequests)
    .values({
      expenseCode,
      title: data.title,
      category: data.category,
      amount: data.amount,
      expenseDate: data.expenseDate,
      paymentMethod: data.paymentMethod,
      requesterEmail: user.email,
      approverEmail: data.approverEmail,
      status: "draft",
      accountCode: data.accountCode,
      note: data.note,
    })
    .returning({ id: expenseRequests.id, expenseCode: expenseRequests.expenseCode });

  await logActivity({
    entityType: "expense_request",
    entityId: rec.id,
    action: "create",
    after: { ...data, expenseCode: rec.expenseCode, status: "draft" } as Record<string, unknown>,
    summary: `Tạo yêu cầu chi ${rec.expenseCode} — ${data.title} — ${data.amount.toLocaleString("vi-VN")} VND`,
  });

  revalidatePath("/expenses");
  redirect(`/expenses/${rec.id}?created=1`);
}

export async function updateExpense(id: number, fd: FormData) {
  const user = await requirePermission("expenses", "edit");
  const [before] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id));
  if (!before) throw new Error("Không tìm thấy yêu cầu");
  if (before.status !== "draft") {
    throw new Error("Chỉ sửa được yêu cầu ở trạng thái Nháp (draft)");
  }
  if (before.requesterEmail !== user.email) {
    // Owner được sửa của người khác, non-owner không được
    if (user.role !== "owner") throw new Error("Bạn không phải người tạo yêu cầu này");
  }

  const data = buildBaseData(fd);
  await db
    .update(expenseRequests)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(expenseRequests.id, id));

  await logActivity({
    entityType: "expense_request",
    entityId: id,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: { ...before, ...data } as unknown as Record<string, unknown>,
    summary: `Sửa yêu cầu chi ${before.expenseCode}`,
  });

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${id}`);
  redirect(`/expenses/${id}?updated=1`);
}

/** draft → pending — người tạo submit lên approver. */
export async function submitExpense(id: number) {
  const user = await requirePermission("expenses", "edit");
  const [before] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id));
  if (!before) throw new Error("Không tìm thấy yêu cầu");
  if (before.status !== "draft") throw new Error("Chỉ submit được yêu cầu ở trạng thái Nháp");
  if (before.requesterEmail !== user.email && user.role !== "owner") {
    throw new Error("Chỉ người tạo mới submit được");
  }

  await db
    .update(expenseRequests)
    .set({ status: "pending", submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(expenseRequests.id, id));

  await logActivity({
    entityType: "expense_request",
    entityId: id,
    action: "submit",
    summary: `Gửi duyệt yêu cầu chi ${before.expenseCode}`,
  });

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${id}`);
}

/** pending → approved */
export async function approveExpense(id: number) {
  const user = await requirePermission("expenses.approve", "edit");
  const [before] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id));
  if (!before) throw new Error("Không tìm thấy yêu cầu");
  if (before.status !== "pending") throw new Error("Chỉ duyệt được yêu cầu ở trạng thái Chờ duyệt");

  await db
    .update(expenseRequests)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approverEmail: user.email,
      updatedAt: new Date(),
    })
    .where(eq(expenseRequests.id, id));

  await logActivity({
    entityType: "expense_request",
    entityId: id,
    action: "approve",
    summary: `Duyệt yêu cầu chi ${before.expenseCode}`,
  });

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${id}`);
}

/** pending → rejected */
export async function rejectExpense(id: number, fd: FormData) {
  const user = await requirePermission("expenses.approve", "edit");
  const [before] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id));
  if (!before) throw new Error("Không tìm thấy yêu cầu");
  if (before.status !== "pending") throw new Error("Chỉ từ chối được yêu cầu ở trạng thái Chờ duyệt");

  const reason = toStr(fd.get("rejectionReason")).trim();
  if (!reason) throw new Error("Nhập lý do từ chối");

  await db
    .update(expenseRequests)
    .set({
      status: "rejected",
      rejectionReason: reason,
      approverEmail: user.email,
      updatedAt: new Date(),
    })
    .where(eq(expenseRequests.id, id));

  await logActivity({
    entityType: "expense_request",
    entityId: id,
    action: "reject",
    summary: `Từ chối yêu cầu chi ${before.expenseCode} — ${reason}`,
  });

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${id}`);
}

/** approved → paid — người chi tiền đánh dấu đã chi. */
export async function markPaid(id: number, fd: FormData) {
  const user = await requirePermission("expenses", "edit");
  const [before] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id));
  if (!before) throw new Error("Không tìm thấy yêu cầu");
  if (before.status !== "approved") throw new Error("Chỉ đánh dấu đã chi cho yêu cầu đã duyệt");

  const accountCode = toStrOrNull(fd.get("accountCode"));
  await db
    .update(expenseRequests)
    .set({
      status: "paid",
      paidAt: new Date(),
      paidBy: user.email,
      accountCode: accountCode ?? before.accountCode,
      updatedAt: new Date(),
    })
    .where(eq(expenseRequests.id, id));

  await logActivity({
    entityType: "expense_request",
    entityId: id,
    action: "pay",
    summary: `Đánh dấu đã chi ${before.expenseCode}`,
  });

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${id}`);
}

/** Draft only — người tạo xoá yêu cầu chưa gửi. */
export async function deleteExpense(id: number) {
  const user = await requirePermission("expenses", "delete");
  const [before] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id));
  if (!before) throw new Error("Không tìm thấy yêu cầu");
  if (before.status !== "draft" && user.role !== "owner") {
    throw new Error("Chỉ xoá được yêu cầu ở trạng thái Nháp (owner có thể xoá bất kỳ)");
  }

  await db.delete(expenseRequests).where(eq(expenseRequests.id, id));
  await logActivity({
    entityType: "expense_request",
    entityId: id,
    action: "delete",
    before: before as unknown as Record<string, unknown>,
    summary: `Xoá yêu cầu chi ${before.expenseCode}`,
  });

  revalidatePath("/expenses");
  redirect("/expenses");
}

/** Đếm số expense đang pending mà user hiện tại có quyền duyệt — cho badge. */
export async function countPendingApprovals(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const { hasPermission } = await import("@/lib/permissions");
  if (!hasPermission(user.role, user.customPermissions, "expenses.approve", "edit")) return 0;
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(expenseRequests)
    .where(eq(expenseRequests.status, "pending"));
  return Number(row?.c ?? 0);
}
