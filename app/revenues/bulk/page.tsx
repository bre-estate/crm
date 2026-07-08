import { db } from "@/lib/db";
import { products, projects, partners } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import BulkForm from "./BulkForm";
import { createRevenueBulk } from "@/lib/actions/revenues";

export const dynamic = "force-dynamic";

export default async function BulkRevenuePage() {
  const productOptions = await db
    .select({
      id: products.id,
      productCode: products.productCode,
      unitCode: products.unitCode,
      projectName: projects.name,
      partnerName: partners.name,
      saleType: products.saleType,
    })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name), asc(products.unitCode));

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/revenues" className="text-blue-600 hover:underline">
          ← Doanh thu
        </Link>
        <span className="text-slate-400">/</span>
        <span>Nhập hàng loạt</span>
      </div>
      <h1 className="text-2xl font-bold">Nhập hàng loạt đợt đối chiếu doanh thu</h1>
      <BulkForm
        products={productOptions}
        onSave={async (rows) => {
          "use server";
          return await createRevenueBulk(rows);
        }}
      />
    </div>
  );
}
