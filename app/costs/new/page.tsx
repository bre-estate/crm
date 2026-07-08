import { db } from "@/lib/db";
import { products, projects, partners } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import CostForm from "../CostForm";
import { createCost } from "@/lib/actions/costs";

type SearchParams = Promise<{ productId?: string }>;

export default async function NewCostPage({ searchParams }: { searchParams: SearchParams }) {
  const { productId } = await searchParams;
  const defaultProductId = productId ? Number(productId) : undefined;

  const productOptions = await db
    .select({
      id: products.id,
      productCode: products.productCode,
      unitCode: products.unitCode,
      pmgBasePrice: products.pmgBasePrice,
      pmgSaleRate: products.pmgSaleRate,
      pmgRate: products.pmgRate,
      saleCommissionRate: products.saleCommissionRate,
      adminFeeSale: products.adminFeeSale,
      salesPerson: products.salesPerson,
      projectName: projects.name,
      partnerName: partners.name,
      kpiCeoRate: products.kpiCeoRate,
      kpiTpkdRate: products.kpiTpkdRate,
      kpiAdminRate: products.kpiAdminRate,
      bonusSale: products.bonusSale,
      bonusManager: products.bonusManager,
      customerSupport: products.customerSupport,
      cdtBonusSale: products.cdtBonusSale,
      cdtBonusManager: products.cdtBonusManager,
    })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name), asc(products.unitCode));

  const backHref = defaultProductId ? `/products/${defaultProductId}` : "/costs";
  const backLabel = defaultProductId ? "← Về căn" : "← Giá vốn";

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href={backHref} className="text-blue-600 hover:underline">
          {backLabel}
        </Link>
        <span className="text-slate-400">/</span>
        <span>Thêm dòng đối chiếu</span>
      </div>
      <h1 className="text-2xl font-bold">Thêm dòng đối chiếu giá vốn</h1>
      <CostForm
        products={productOptions}
        defaultProductId={defaultProductId}
        onSave={createCost}
      />
    </div>
  );
}
