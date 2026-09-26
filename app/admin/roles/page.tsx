import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { userPermissions } from "@/lib/schema";
import { sql } from "drizzle-orm";
import { layVaiTro } from "@/lib/vai-tro";
import { RESOURCES, type Action } from "@/lib/permissions";
import RolesManager from "./RolesManager";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await requirePermission("admin.roles");

  const [ds, dem] = await Promise.all([
    layVaiTro(),
    db
      .select({ role: userPermissions.role, n: sql<number>`count(*)::int` })
      .from(userPermissions)
      .groupBy(userPermissions.role),
  ]);
  const soNguoi = new Map(dem.map((r) => [r.role, Number(r.n)]));

  return (
    <RolesManager
      roles={ds.map((r) => ({
        role: r.role,
        label: r.label,
        builtin: r.builtin,
        permissions: (r.permissions as Record<string, Action[]>) ?? {},
        soNguoi: soNguoi.get(r.role) ?? 0,
      }))}
      resources={RESOURCES as Record<string, string>}
    />
  );
}
