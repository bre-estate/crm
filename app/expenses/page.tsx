import { db } from "@/lib/db";
import { expenseRequests } from "@/lib/schema";
import { desc, eq, and, gte, lte, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { fmtMoney, fmtDate } from "@/lib/format";
import { requirePermission, getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  categoryLabel,
  statusColor,
  statusLabel,
} from "@/lib/expenses";
import ExpensesFilterForm from "./ExpensesFilterForm";
import AutoDismissBanner from "@/components/AutoDismissBanner";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  status?: string;
  category?: string;
  requester?: string;
  from?: string;
  to?: string;
  created?: string;
  updated?: string;
  deleted?: string;
}>;

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("expenses", "view");
  const user = await getCurrentUser();
  const canApprove =
    user != null &&
    hasPermission(user.role, user.customPermissions, "expenses.approve", "edit");

  const { status, category, requester, from, to, created, updated, deleted } =
    await searchParams;

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(expenseRequests.status, status));
  if (category) conditions.push(eq(expenseRequests.category, category));
  if (requester) conditions.push(eq(expenseRequests.requesterEmail, requester));
  if (from) conditions.push(gte(expenseRequests.expenseDate, from));
  if (to) conditions.push(lte(expenseRequests.expenseDate, to));

  const rows = await db
    .select()
    .from(expenseRequests)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(expenseRequests.createdAt));

  // Stats: count per status trên toàn bộ (không phụ thuộc filter status)
  const statusCounts = await db
    .select({
      status: expenseRequests.status,
      c: sql<number>`COUNT(*)::int`,
      total: sql<string>`COALESCE(SUM(${expenseRequests.amount}), 0)`,
    })
    .from(expenseRequests)
    .groupBy(expenseRequests.status);
  const countMap = new Map(statusCounts.map((s) => [s.status, Number(s.c)]));
  const totalMap = new Map(statusCounts.map((s) => [s.status, Number(s.total)]));

  const filteredTotal = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      {(created || updated || deleted) && (
        <AutoDismissBanner
          variant={deleted ? "error" : "success"}
          clearParams={["created", "updated", "deleted"]}
        >
          {created && "Đã tạo yêu cầu chi mới."}
          {updated && "Đã cập nhật yêu cầu chi."}
          {deleted && "Đã xóa yêu cầu chi."}
        </AutoDismissBanner>
      )}

      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Chi phí</h1>
          <p className="text-sm text-slate-500 mt-1">
            Yêu cầu chi tiền công ty. Workflow: Nháp → Chờ duyệt → Đã duyệt → Đã chi.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button
            render={<Link href="/expenses/new" />}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            + Thêm yêu cầu chi
          </Button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="text-xs text-slate-500 mr-1">Trạng thái:</span>
        <FilterPill
          label={`Tất cả (${rows.length})`}
          active={!status}
          href={buildUrl({ status: undefined, category, requester, from, to })}
        />
        {EXPENSE_STATUSES.map((s) => {
          const cnt = countMap.get(s.key) ?? 0;
          if (cnt === 0 && status !== s.key) return null;
          return (
            <FilterPill
              key={s.key}
              label={`${s.label} (${cnt})`}
              active={status === s.key}
              href={buildUrl({ status: s.key, category, requester, from, to })}
            />
          );
        })}
      </div>

      <Card className="[--card-spacing:1rem] px-4 py-3 gap-4">
        <ExpensesFilterForm
          statusParam={status}
          categoryParam={category}
          requesterParam={requester}
          fromParam={from}
          toParam={to}
          hasFilter={!!(status || category || requester || from || to)}
        />
      </Card>

      {/* Stats — nhỏ gọn, dưới filter */}
      <div className="flex gap-6 text-sm flex-wrap px-1">
        <div>
          <div className="text-xs text-slate-500">Số yêu cầu (đang lọc)</div>
          <div className="font-bold tabular-nums">{rows.length}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Tổng tiền (đang lọc)</div>
          <div className="font-bold tabular-nums">{fmtMoney(filteredTotal)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Đang chờ duyệt</div>
          <div className="font-bold tabular-nums text-amber-700">
            {fmtMoney(totalMap.get("pending") ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Đã duyệt (chưa chi)</div>
          <div className="font-bold tabular-nums text-blue-700">
            {fmtMoney(totalMap.get("approved") ?? 0)}
          </div>
        </div>
      </div>

      <Card className="p-0 gap-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Mã</th>
              <th className="text-left p-3">Tiêu đề</th>
              <th className="text-left p-3">Loại</th>
              <th className="text-right p-3">Số tiền</th>
              <th className="text-left p-3">Ngày phát sinh</th>
              <th className="text-left p-3">Người tạo</th>
              <th className="text-left p-3">Người duyệt</th>
              <th className="text-center p-3">Trạng thái</th>
              <th className="text-right p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={cn(
                  "border-t border-slate-100 hover:bg-slate-50",
                  canApprove && r.status === "pending" && "bg-amber-50/40",
                )}
              >
                <td className="p-3 font-mono text-xs">{r.expenseCode}</td>
                <td className="p-3">
                  <Link
                    href={`/expenses/${r.id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {r.title}
                  </Link>
                  {r.note && (
                    <div className="text-xs text-slate-500 truncate max-w-md">{r.note}</div>
                  )}
                </td>
                <td className="p-3 text-xs">{categoryLabel(r.category)}</td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  {fmtMoney(r.amount)}
                </td>
                <td className="p-3 text-xs">{fmtDate(r.expenseDate)}</td>
                <td className="p-3 text-xs">{r.requesterEmail}</td>
                <td className="p-3 text-xs text-slate-500">{r.approverEmail ?? "—"}</td>
                <td className="p-3 text-center">
                  <span
                    className={`text-xs px-2 py-0.5 rounded border font-medium ${statusColor(r.status)}`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Link
                    href={`/expenses/${r.id}`}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Chi tiết
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500 text-sm">
                  Chưa có yêu cầu chi nào khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function buildUrl(params: {
  status?: string;
  category?: string;
  requester?: string;
  from?: string;
  to?: string;
}): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.category) qs.set("category", params.category);
  if (params.requester) qs.set("requester", params.requester);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return `/expenses${qs.toString() ? "?" + qs.toString() : ""}`;
}

function FilterPill({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs border transition-colors",
        active
          ? "bg-orange-500 text-white border-orange-500"
          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100",
      )}
    >
      {label}
    </Link>
  );
}
