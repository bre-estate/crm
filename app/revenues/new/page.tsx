import { db } from "@/lib/db";
import { products, projects, partners, revenueReconciliations } from "@/lib/schema";
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
      saleType: products.saleType,
      cdtBonusSale: products.cdtBonusSale,
      cdtBonusManager: products.cdtBonusManager,
      totalRevenue: products.totalRevenue,
      pmgSaleRate: products.pmgSaleRate,
      saleCommissionRate: products.saleCommissionRate,
      kpiCeoRate: products.kpiCeoRate,
      kpiTpkdRate: products.kpiTpkdRate,
      kpiAdminRate: products.kpiAdminRate,
      bonusSale: products.bonusSale,
      bonusManager: products.bonusManager,
      customerSupport: products.customerSupport,
    })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name), asc(products.unitCode));

  // Prev recons cho từng product — để RevenueForm compute LK đã ĐC → gợi ý
  // "Số tiền" đợt mới = LK current − LK prev.
  const prevRecons = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      pmgCumulativePct: revenueReconciliations.pmgCumulativePct,
      phasePctThisTime: revenueReconciliations.phasePctThisTime,
      revenueThisTime: revenueReconciliations.revenueThisTime,
      totalReceivableThisTime: revenueReconciliations.totalReceivableThisTime,
      cdtBonusSale: revenueReconciliations.cdtBonusSale,
      cdtBonusManager: revenueReconciliations.cdtBonusManager,
    })
    .from(revenueReconciliations);

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
        prevRecons={prevRecons}
        onSave={createRevenue}
      />
    </div>
  );
}
