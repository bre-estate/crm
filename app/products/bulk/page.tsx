import { db } from "@/lib/db";
import { projects, partners, departments } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import BulkProductForm from "./BulkForm";
import { createProductBulk } from "@/lib/actions/products";

export const dynamic = "force-dynamic";

export default async function BulkProductPage() {
  const [projectOptions, deptOptions] = await Promise.all([
    db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        partnerName: partners.name,
      })
      .from(projects)
      .leftJoin(partners, eq(projects.partnerId, partners.id))
      .orderBy(asc(projects.name)),
    db
      .select({ id: departments.id, code: departments.code, name: departments.name })
      .from(departments)
      .orderBy(asc(departments.name)),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/products" className="text-blue-600 hover:underline">
          ← Giao dịch
        </Link>
        <span className="text-slate-400">/</span>
        <span>Nhập hàng loạt</span>
      </div>
      <h1 className="text-2xl font-bold">Nhập hàng loạt giao dịch</h1>
      <BulkProductForm
        projects={projectOptions}
        departments={deptOptions}
        onSave={async (rows) => {
          "use server";
          return await createProductBulk(rows);
        }}
      />
    </div>
  );
}
