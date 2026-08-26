import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { expenseRequests, userPermissions } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import ExpenseForm from "../../ExpenseForm";
import { updateExpense } from "@/lib/actions/expenses";
import { hasPermission } from "@/lib/permissions";
import type { Action } from "@/lib/permissions";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("expenses", "edit");
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [expense] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id));
  if (!expense) notFound();
  if (expense.status !== "draft") {
    // Chỉ sửa được nháp — redirect về detail
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="text-sm">
          <Link href={`/expenses/${id}`} className="text-blue-600 hover:underline">
            ← Quay lại
          </Link>
        </div>
        <div className="p-6 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          Yêu cầu này đã ở trạng thái <b>{expense.status}</b>, không sửa được nữa.
        </div>
      </div>
    );
  }

  const allUsers = await db
    .select({
      email: userPermissions.email,
      fullName: userPermissions.fullName,
      role: userPermissions.role,
      permissions: userPermissions.permissions,
    })
    .from(userPermissions)
    .where(eq(userPermissions.active, true));

  const approverOptions = allUsers
    .filter((u) => {
      const perms = u.permissions as Record<string, Action[]>;
      return hasPermission(u.role as never, perms, "expenses.approve", "edit");
    })
    .map((u) => ({
      value: u.email,
      label: u.fullName || u.email,
      sublabel: u.email,
    }));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="text-sm">
        <Link href="/expenses" className="text-blue-600 hover:underline">
          ← Chi phí
        </Link>
        <span className="text-slate-400"> / </span>
        <Link href={`/expenses/${id}`} className="text-blue-600 hover:underline font-mono">
          {expense.expenseCode}
        </Link>
        <span className="text-slate-400"> / </span>
        <span>Sửa</span>
      </div>
      <h1 className="text-2xl font-bold">Sửa yêu cầu chi</h1>
      <ExpenseForm
        mode="edit"
        defaults={{
          title: expense.title,
          category: expense.category,
          amount: expense.amount,
          expenseDate: expense.expenseDate,
          paymentMethod: expense.paymentMethod,
          approverEmail: expense.approverEmail,
          accountCode: expense.accountCode,
          note: expense.note,
        }}
        approverOptions={approverOptions}
        onSave={async (fd) => {
          "use server";
          await updateExpense(id, fd);
        }}
        cancelHref={`/expenses/${id}`}
      />
    </div>
  );
}
