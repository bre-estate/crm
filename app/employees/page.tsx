import { db } from "@/lib/db";
import { employees, departments } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import {
  createEmployeeNoRedirect,
  updateEmployeeNoRedirect,
  deleteEmployeeNoRedirect,
} from "@/lib/actions/employees";
import EmployeesManager from "./EmployeesManager";
import { layViTriGon } from "@/lib/vi-tri";
import { requirePermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  // Theo đúng bảng phân quyền, không khóa cứng theo chủ tài khoản nữa.
  await requirePermission("employees");
  const [rows, depts, viTri] = await Promise.all([
    db
      .select({
        id: employees.id,
        name: employees.name,
        code: employees.code,
        email: employees.email,
        phone: employees.phone,
        position: employees.position,
        contractType: employees.contractType,
        departmentId: employees.departmentId,
        active: employees.active,
        note: employees.note,
        departmentName: departments.name,
        aliasOfId: employees.aliasOfId,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .orderBy(asc(employees.position), asc(employees.name)),
    db.select().from(departments).orderBy(asc(departments.name)),
    layViTriGon(),
  ]);

  return (
    <EmployeesManager
      employees={rows}
      departments={depts}
      viTri={viTri}
      onCreate={async (fd) => {
        "use server";
        return await createEmployeeNoRedirect(fd);
      }}
      onUpdate={async (id, fd) => {
        "use server";
        return await updateEmployeeNoRedirect(id, fd);
      }}
      onDelete={async (id) => {
        "use server";
        return await deleteEmployeeNoRedirect(id);
      }}
    />
  );
}
