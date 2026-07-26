import { db } from "@/lib/db";
import { departments, employees, products } from "@/lib/schema";
import { asc, eq, sql } from "drizzle-orm";
import {
  createDepartmentNoRedirect,
  updateDepartmentNoRedirect,
  deleteDepartmentNoRedirect,
} from "@/lib/actions/departments";
import DepartmentsManager from "./DepartmentsManager";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  // Owner-only — quản lý phòng ban là quyền của founder
  if (!(await getOwnerEmail())) notFound();
  const [depts, tpkds, prodCounts, empCounts] = await Promise.all([
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
      onCreate={async (fd) => {
        "use server";
        await createDepartmentNoRedirect(fd);
      }}
      onUpdate={async (id, fd) => {
        "use server";
        await updateDepartmentNoRedirect(id, fd);
      }}
      onDelete={async (id) => {
        "use server";
        await deleteDepartmentNoRedirect(id);
      }}
    />
  );
}
