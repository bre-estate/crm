import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { activityLogs, expenseRequests, userPermissions } from "@/lib/schema";
import { and, asc, eq } from "drizzle-orm";
import {
  approveExpense,
  deleteExpense,
  markPaid,
  rejectExpense,
  submitExpense,
} from "@/lib/actions/expenses";
import { getCurrentUser, requirePermission } from "@/lib/auth";
import { hasPermission, type Action } from "@/lib/permissions";
import { fmtDate, fmtMoney } from "@/lib/format";
import {
  categoryLabel,
  paymentMethodLabel,
  statusColor,
  statusLabel,
} from "@/lib/expenses";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AutoDismissBanner from "@/components/AutoDismissBanner";

export const dynamic = "force-dynamic";

export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  await requirePermission("expenses", "view");
  const user = await getCurrentUser();
  const { id: idStr } = await params;
  const { created, updated } = await searchParams;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [expense] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id));
  if (!expense) notFound();

  const activities = await db
    .select()
    .from(activityLogs)
    .where(and(eq(activityLogs.entityType, "expense_request"), eq(activityLogs.entityId, id)))
    .orderBy(asc(activityLogs.createdAt));

  const canApprove =
    user != null &&
    hasPermission(user.role, user.customPermissions, "expenses.approve", "edit");
  const isRequester = user?.email === expense.requesterEmail;
  const isOwner = user?.role === "owner";

  const canSubmit = expense.status === "draft" && (isRequester || isOwner);
  const canEdit = expense.status === "draft" && (isRequester || isOwner);
  const canDelete = expense.status === "draft" || isOwner;
  const canApproveNow = expense.status === "pending" && canApprove;
  const canMarkPaid =
    expense.status === "approved" &&
    user != null &&
    hasPermission(user.role, user.customPermissions, "expenses", "edit");

  return (
    <div className="space-y-4 max-w-5xl">
      {(created || updated) && (
        <AutoDismissBanner variant="success" clearParams={["created", "updated"]}>
          {created && "Đã tạo yêu cầu chi thành công."}
          {updated && "Đã cập nhật yêu cầu chi."}
        </AutoDismissBanner>
      )}

      <div className="text-sm">
        <Link href="/expenses" className="text-blue-600 hover:underline">
          ← Chi phí
        </Link>
        <span className="text-slate-400"> / </span>
        <span className="font-mono">{expense.expenseCode}</span>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{expense.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-xs px-2 py-0.5 rounded border font-medium ${statusColor(expense.status)}`}
            >
              {statusLabel(expense.status)}
            </span>
            <span className="text-xs text-slate-500">
              · {categoryLabel(expense.category)} · {expense.expenseCode}
            </span>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {canEdit && (
            <Button
              variant="outline"
              render={<Link href={`/expenses/${id}/edit`} />}
              className="h-[36px]"
            >
              Sửa
            </Button>
          )}
          {canSubmit && (
            <form action={async () => { "use server"; await submitExpense(id); }}>
              <Button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white h-[36px]"
              >
                Gửi duyệt
              </Button>
            </form>
          )}
          {canApproveNow && (
            <form action={async () => { "use server"; await approveExpense(id); }}>
              <Button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white h-[36px]"
              >
                Duyệt
              </Button>
            </form>
          )}
          {canApproveNow && <RejectButton id={id} />}
          {canMarkPaid && <MarkPaidButton id={id} />}
          {canDelete && (
            <form
              action={async () => {
                "use server";
                await deleteExpense(id);
              }}
              onSubmit={(e) => {
                if (!confirm("Xoá yêu cầu chi này?")) e.preventDefault();
              }}
            >
              <Button
                type="submit"
                variant="outline"
                className="text-red-600 border-red-300 h-[36px]"
              >
                Xoá
              </Button>
            </form>
          )}
        </div>
      </div>

      <Card className="p-5 gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Info label="Số tiền" value={fmtMoney(expense.amount)} highlight />
          <Info label="Ngày phát sinh" value={fmtDate(expense.expenseDate)} />
          <Info label="Loại chi" value={categoryLabel(expense.category)} />
          <Info label="Phương thức chi" value={paymentMethodLabel(expense.paymentMethod)} />
          <Info label="Người tạo" value={expense.requesterEmail} />
          <Info
            label="Người duyệt"
            value={expense.approverEmail ?? "—"}
          />
          {expense.accountCode && (
            <Info label="Mã tài khoản KT" value={expense.accountCode} />
          )}
          {expense.paidAt && (
            <>
              <Info
                label="Ngày chi"
                value={new Date(expense.paidAt).toLocaleString("vi-VN")}
              />
              <Info label="Người chi" value={expense.paidBy ?? "—"} />
            </>
          )}
        </div>

        {expense.note && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="text-xs text-slate-500 mb-1">Ghi chú</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{expense.note}</div>
          </div>
        )}

        {expense.rejectionReason && (
          <div className="mt-3 pt-3 border-t border-red-200 bg-red-50 -mx-5 -mb-5 px-5 py-3">
            <div className="text-xs text-red-700 font-semibold mb-1">Lý do từ chối</div>
            <div className="text-sm text-red-900 whitespace-pre-wrap">
              {expense.rejectionReason}
            </div>
          </div>
        )}
      </Card>

      {/* Timeline */}
      <Card className="p-5 gap-3">
        <div className="text-xs text-slate-500 uppercase font-semibold">Lịch sử</div>
        {activities.length === 0 ? (
          <div className="text-sm text-slate-500 italic">Chưa có hoạt động.</div>
        ) : (
          <ul className="space-y-2">
            {activities.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span className="text-xs text-slate-400 min-w-32 tabular-nums shrink-0">
                  {new Date(a.createdAt).toLocaleString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-xs text-slate-500 min-w-20 shrink-0">
                  {a.actorEmail ?? "?"}
                </span>
                <span>{a.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Info({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number | null;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`tabular-nums ${highlight ? "text-lg font-bold text-slate-900" : "text-sm text-slate-800"}`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function RejectButton({ id }: { id: number }) {
  return (
    <form
      action={async (fd: FormData) => {
        "use server";
        await rejectExpense(id, fd);
      }}
      className="flex gap-1 items-center"
    >
      <input
        type="text"
        name="rejectionReason"
        placeholder="Lý do từ chối"
        required
        className="input h-[36px] text-sm w-56"
      />
      <Button
        type="submit"
        variant="outline"
        className="text-red-600 border-red-300 h-[36px]"
      >
        Từ chối
      </Button>
    </form>
  );
}

function MarkPaidButton({ id }: { id: number }) {
  return (
    <form
      action={async (fd: FormData) => {
        "use server";
        await markPaid(id, fd);
      }}
      className="flex gap-1 items-center"
    >
      <input
        type="text"
        name="accountCode"
        placeholder="Mã TK (VD 6428)"
        className="input h-[36px] text-sm w-40"
      />
      <Button
        type="submit"
        className="bg-purple-600 hover:bg-purple-700 text-white h-[36px]"
      >
        Đánh dấu đã chi
      </Button>
    </form>
  );
}
