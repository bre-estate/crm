import { db } from "@/lib/db";
import { projects, partners } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import BulkProductForm from "./BulkForm";
import { createProductBulk } from "@/lib/actions/products";

export const dynamic = "force-dynamic";

export default async function BulkProductPage() {
  const projectOptions = await db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      partnerName: partners.name,
    })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/products" className="text-blue-600 hover:underline">
          ← Căn
        </Link>
        <span className="text-slate-400">/</span>
        <span>Nhập hàng loạt</span>
      </div>
      <h1 className="text-2xl font-bold">Nhập hàng loạt căn</h1>
      <BulkProductForm
        projects={projectOptions}
        onSave={async (rows) => {
          "use server";
          return await createProductBulk(rows);
        }}
      />
    </div>
  );
}
