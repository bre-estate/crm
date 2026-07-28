import "server-only";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { userPermissions } from "@/lib/schema";
import { eq } from "drizzle-orm";
import {
  hasPermission as check,
  resolvePermissions,
  type Action,
  type Resource,
  type Role,
} from "@/lib/permissions";

export type CurrentUser = {
  email: string;
  fullName: string | null;
  role: Role;
  customPermissions: Record<string, Action[]>;
  active: boolean;
};

/**
 * Get current user từ Supabase Auth + DB whitelist.
 * Trả về null nếu:
 *   - Chưa login
 *   - Email không có trong user_permissions
 *   - active = false
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return null;

    const [row] = await db
      .select()
      .from(userPermissions)
      .where(eq(userPermissions.email, user.email));
    if (!row || !row.active) return null;

    // Update last_login (best-effort, ignore errors)
    void db
      .update(userPermissions)
      .set({ lastLogin: new Date() })
      .where(eq(userPermissions.email, user.email))
      .catch(() => {});

    return {
      email: row.email,
      fullName: row.fullName,
      role: row.role as Role,
      customPermissions: (row.permissions as Record<string, Action[]>) ?? {},
      active: row.active,
    };
  } catch {
    return null;
  }
}

/**
 * Check user hiện tại có quyền `action` trên `resource` không.
 */
export async function hasPermission(
  resource: Resource,
  action: Action = "view",
): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  return check(user.role, user.customPermissions, resource, action);
}

/**
 * Bảo vệ page/action — throw nếu không có quyền.
 */
export async function requirePermission(
  resource: Resource,
  action: Action = "view",
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Chưa đăng nhập.");
  if (!check(user.role, user.customPermissions, resource, action)) {
    throw new Error(`Bạn không có quyền ${action} ${resource}.`);
  }
  return user;
}

// ============ BACKWARD-COMPAT HELPERS ============
// Giữ signature cũ để các trang chưa migrate vẫn chạy.

/**
 * @deprecated dùng getCurrentUser() thay
 * Trả về email nếu user role='owner', null nếu không.
 */
export async function getOwnerEmail(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return user.role === "owner" ? user.email : null;
}

/**
 * @deprecated dùng requirePermission() thay
 */
export async function requireOwner(): Promise<string> {
  const email = await getOwnerEmail();
  if (!email) throw new Error("Bạn không có quyền truy cập tính năng này.");
  return email;
}

/**
 * @deprecated dùng hasPermission("reports.overview") thay
 * Check quyền vào bất kỳ trang /reports (owner + manager + user có ít nhất
 * 1 quyền reports.*).
 */
export async function hasReportsAccess(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.role === "owner" || user.role === "manager") return true;
  const perms = resolvePermissions(user.role, user.customPermissions);
  return Object.keys(perms).some((r) => r.startsWith("reports."));
}

/**
 * @deprecated dùng hasPermission("reports.segments") thay
 */
export async function hasSegmentsAccess(): Promise<boolean> {
  return hasPermission("reports.segments");
}
