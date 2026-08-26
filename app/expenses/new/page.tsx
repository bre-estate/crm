import Link from "next/link";
import { db } from "@/lib/db";
import { userPermissions } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import ExpenseForm from "../ExpenseForm";
import { createExpense } from "@/lib/actions/expenses";
import { hasPermission } from "@/lib/permissions";
import type { Action } from "@/lib/permissions";

export default async function NewExpensePage() {
  await requirePermission("expenses", "edit");

  // Load user có quyền approve — cho dropdown "Người duyệt"
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
        <span>Yêu cầu mới</span>
      </div>
      <h1 className="text-2xl font-bold">Tạo yêu cầu chi</h1>
      <ExpenseForm
        mode="create"
        approverOptions={approverOptions}
        onSave={createExpense}
        cancelHref="/expenses"
      />
    </div>
  );
}
