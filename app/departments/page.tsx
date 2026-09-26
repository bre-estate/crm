import { db } from "@/lib/db";
import { departments, employees, products } from "@/lib/schema";
import { asc, eq, sql } from "drizzle-orm";
import {
  createDepartmentNoRedirect,
  updateDepartmentNoRedirect,
  deleteDepartmentNoRedirect,
} from "@/lib/actions/departments";
import DepartmentsManager from "./DepartmentsManager";
import { layNhanViTri } from "@/lib/vi-tri";
import { requirePermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  // Theo đúng bảng phân quyền. Trước đây khóa cứng theo chủ tài khoản nên ai được
  // cấp quyền xem phòng ban vẫn thấy menu mà bấm vào ra trang không tồn tại.
  await requirePermission("departments");
  const [depts, tpkds, prodCounts, empCounts, viTriLabel] = await Promise.all([
    db.select().from(departments).orderBy(asc(departments.name)),
    db
      .select({ id: employees.id, name: employees.name, position: employees.position })
      .from(employees)
      .where(eq(employees.active, true))
      .orderBy(asc(employees.name)),
    // Đếm căn per department
    db
      .select({ departmentId: products.departmentId, count: sql<number>`COUNT(*)::int` })
      .from(products)
      .groupBy(products.departmentId),
    // Đếm NV per department
    db
      .select({ departmentId: employees.departmentId, count: sql<number>`COUNT(*)::int` })
      .from(employees)
      .groupBy(employees.departmentId),
    layNhanViTri(),
  ]);

  const prodCountMap = new Map(prodCounts.map((r) => [r.departmentId, Number(r.count)]));
  const empCountMap = new Map(empCounts.map((r) => [r.departmentId, Number(r.count)]));

  const rows = depts.map((d) => ({
    ...d,
    prodCount: prodCountMap.get(d.id) ?? 0,
    empCount: empCountMap.get(d.id) ?? 0,
  }));

  return (
    <DepartmentsManager
      departments={rows}
      tpkdCandidates={tpkds}
      viTriLabel={viTriLabel}
      onCreate={async (fd) => {
        "use server";
        return await createDepartmentNoRedirect(fd);
      }}
      onUpdate={async (id, fd) => {
        "use server";
        return await updateDepartmentNoRedirect(id, fd);
      }}
      onDelete={async (id) => {
        "use server";
        return await deleteDepartmentNoRedirect(id);
      }}
    />
  );
}
