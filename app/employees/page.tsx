import { db } from "@/lib/db";
import { employees, departments } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import {
  createEmployeeNoRedirect,
  updateEmployeeNoRedirect,
  deleteEmployeeNoRedirect,
} from "@/lib/actions/employees";
import EmployeesManager from "./EmployeesManager";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  // Owner-only — lộ lương/thông tin cá nhân, không cho staff xem
  if (!(await getOwnerEmail())) notFound();
  const [rows, depts] = await Promise.all([
    db
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
        phone: employees.phone,
        position: employees.position,
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
  ]);

  return (
    <EmployeesManager
      employees={rows}
      departments={depts}
      onCreate={async (fd) => {
        "use server";
        await createEmployeeNoRedirect(fd);
      }}
      onUpdate={async (id, fd) => {
        "use server";
        await updateEmployeeNoRedirect(id, fd);
      }}
      onDelete={async (id) => {
        "use server";
        await deleteEmployeeNoRedirect(id);
      }}
    />
  );
}
