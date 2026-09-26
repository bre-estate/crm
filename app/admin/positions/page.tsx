import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, userPermissions } from "@/lib/schema";
import { sql } from "drizzle-orm";
import { layViTri } from "@/lib/vi-tri";
import { RESOURCES, type Action } from "@/lib/permissions";
import { KHOI } from "@/lib/to-chuc";
import PositionsManager from "./PositionsManager";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  await requirePermission("admin.positions");

  const [ds, demNhanSu, demTaiKhoan] = await Promise.all([
    layViTri(),
    db
      .select({ code: employees.position, n: sql<number>`count(*)::int` })
      .from(employees)
      .groupBy(employees.position),
    db
      .select({ code: userPermissions.role, n: sql<number>`count(*)::int` })
      .from(userPermissions)
      .groupBy(userPermissions.role),
  ]);

  const nhanSu = new Map(demNhanSu.map((r) => [r.code, Number(r.n)]));
  const taiKhoan = new Map(demTaiKhoan.map((r) => [r.code, Number(r.n)]));

  return (
    <PositionsManager
      viTri={ds.map((r) => ({
        code: r.code,
        label: r.label,
        khoi: r.khoi,
        builtin: r.builtin,
        permissions: (r.permissions as Record<string, Action[]>) ?? {},
        soNhanSu: nhanSu.get(r.code) ?? 0,
        soTaiKhoan: taiKhoan.get(r.code) ?? 0,
      }))}
      resources={RESOURCES as Record<string, string>}
      khoi={KHOI as Record<string, string>}
    />
  );
}
