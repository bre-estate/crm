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
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  // Owner-only — lộ lương/thông tin cá nhân, không cho staff xem
  if (!(await getOwnerEmail())) notFound();
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
