import { db } from "@/lib/db";
import { products, projects, partners, revenueReconciliations } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import BulkForm from "./BulkForm";
import { createRevenueBulk } from "@/lib/actions/revenues";

export const dynamic = "force-dynamic";

export default async function BulkRevenuePage() {
  const [projectOptions, productOptions, existingRecons] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        partnerName: partners.name,
      })
      .from(projects)
      .leftJoin(partners, eq(projects.partnerId, partners.id))
      .orderBy(asc(projects.name)),
    db
      .select({
        id: products.id,
        productCode: products.productCode,
        unitCode: products.unitCode,
        projectId: products.projectId,
        projectName: projects.name,
        partnerName: partners.name,
        saleType: products.saleType,
        pmgBasePrice: products.pmgBasePrice,
        pmgRate: products.pmgRate,
        adminFee: products.adminFee,
        cdtBonusSale: products.cdtBonusSale,
        cdtBonusManager: products.cdtBonusManager,
      })
      .from(products)
      .leftJoin(projects, eq(products.projectId, projects.id))
      .leftJoin(partners, eq(projects.partnerId, partners.id))
      .orderBy(asc(projects.name), asc(products.unitCode)),
    db
      .select({
        productId: revenueReconciliations.productId,
        revenueThisTime: revenueReconciliations.revenueThisTime,
        phasePctThisTime: revenueReconciliations.phasePctThisTime,
      })
      .from(revenueReconciliations),
  ]);

  // Group prev HH recons per product → tính cumulative revenue + max %thu
  const prevMap: Record<
    number,
    { cumulativeRevenue: number; maxPhasePct: number }
  > = {};
  for (const r of existingRecons) {
    const rev = Number(r.revenueThisTime ?? 0);
    if (rev <= 0) continue; // bỏ recon thưởng nóng (không có revenueThisTime)
    if (!prevMap[r.productId])
      prevMap[r.productId] = { cumulativeRevenue: 0, maxPhasePct: 0 };
    prevMap[r.productId].cumulativeRevenue += rev;
    prevMap[r.productId].maxPhasePct = Math.max(
      prevMap[r.productId].maxPhasePct,
      Number(r.phasePctThisTime ?? 0),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/revenues" className="text-blue-600 hover:underline">
          ← Doanh thu
        </Link>
        <span className="text-slate-400">/</span>
        <span>Nhập hàng loạt</span>
      </div>
      <h1 className="text-2xl font-bold">Nhập hàng loạt đợt đối chiếu doanh thu</h1>
      <BulkForm
        projects={projectOptions}
        products={productOptions}
        prevReconsByProduct={prevMap}
        onSave={async (rows) => {
          "use server";
          return await createRevenueBulk(rows);
        }}
      />
    </div>
  );
}
