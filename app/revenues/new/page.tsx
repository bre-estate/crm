import { db } from "@/lib/db";
import { products, projects, partners } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import RevenueForm from "../RevenueForm";
import { createRevenue } from "@/lib/actions/revenues";

type SearchParams = Promise<{ productId?: string }>;

export default async function NewRevenuePage({ searchParams }: { searchParams: SearchParams }) {
  const { productId } = await searchParams;
  const defaultProductId = productId ? Number(productId) : undefined;

  const productOptions = await db
    .select({
      id: products.id,
      productCode: products.productCode,
      unitCode: products.unitCode,
      pmgBasePrice: products.pmgBasePrice,
      pmgRate: products.pmgRate,
      adminFee: products.adminFee,
      projectName: projects.name,
      partnerName: partners.name,
    })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name), asc(products.unitCode));

  const backHref = defaultProductId ? `/products/${defaultProductId}` : "/revenues";
  const backLabel = defaultProductId ? "← Về căn" : "← Doanh thu";

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href={backHref} className="text-blue-600 hover:underline">
          {backLabel}
        </Link>
        <span className="text-slate-400">/</span>
        <span>Thêm đợt đối chiếu</span>
      </div>
      <h1 className="text-2xl font-bold">Thêm đợt đối chiếu doanh thu</h1>
      <RevenueForm
        products={productOptions}
        defaultProductId={defaultProductId}
        onSave={createRevenue}
      />
    </div>
  );
}
