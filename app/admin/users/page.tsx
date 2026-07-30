import { db } from "@/lib/db";
import { userPermissions } from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { RESOURCES, ROLE_LABELS, type Action, type Role } from "@/lib/permissions";
import { desc } from "drizzle-orm";
import Link from "next/link";
import UsersTable from "./UsersTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requirePermission("admin.users");

  const rows = await db
    .select()
    .from(userPermissions)
    .orderBy(desc(userPermissions.invitedAt));

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Trang chủ
          </Link>
        </div>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 className="text-2xl font-bold">Quản lý user</h1>
            <p className="text-sm text-slate-500 mt-1">
              Thêm email vào whitelist → user login Google bằng email đó là vào được.
              Không cần verify hay gửi email — chỉ nói cho user URL.
            </p>
          </div>
        </div>
      </div>

      <UsersTable
        users={rows.map((r) => ({
          email: r.email,
          fullName: r.fullName,
          role: r.role as Role,
          permissions: (r.permissions as Record<string, Action[]>) ?? {},
          active: r.active,
          invitedAt: r.invitedAt.toISOString(),
          lastLogin: r.lastLogin?.toISOString() ?? null,
        }))}
        resources={RESOURCES}
        roleLabels={ROLE_LABELS}
      />
    </div>
  );
}
