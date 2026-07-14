import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  costReconciliations,
  revenueReconciliations,
} from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import BulkCostForm from "./BulkForm";
import { createCostBulk } from "@/lib/actions/costs";

export const dynamic = "force-dynamic";

export default async function BulkCostPage() {
  const [productOptions, prevCostRecons, prevRevRecons] = await Promise.all([
    db
      .select({
        id: products.id,
        productCode: products.productCode,
        unitCode: products.unitCode,
        pmgBasePrice: products.pmgBasePrice,
        pmgSaleRate: products.pmgSaleRate,
        saleCommissionRate: products.saleCommissionRate,
        kpiCeoRate: products.kpiCeoRate,
        kpiTpkdRate: products.kpiTpkdRate,
        kpiAdminRate: products.kpiAdminRate,
        bonusSale: products.bonusSale,
        bonusManager: products.bonusManager,
        customerSupport: products.customerSupport,
        cdtBonusSale: products.cdtBonusSale,
        cdtBonusManager: products.cdtBonusManager,
        adminFeeSale: products.adminFeeSale,
        salesPerson: products.salesPerson,
        projectName: projects.name,
        partnerName: partners.name,
      })
      .from(products)
      .leftJoin(projects, eq(products.projectId, projects.id))
      .leftJoin(partners, eq(projects.partnerId, partners.id))
      .orderBy(asc(projects.name), asc(products.unitCode)),
    db
      .select({
        productId: costReconciliations.productId,
        costType: costReconciliations.costType,
        amount: costReconciliations.amountPayableThisTime,
      })
      .from(costReconciliations),
    db
      .select({
        productId: revenueReconciliations.productId,
        pmgCumulativePct: revenueReconciliations.pmgCumulativePct,
      })
      .from(revenueReconciliations),
  ]);

  // Aggregate: paid by (productId × costType)
  const paidByKey: Record<string, number> = {};
  for (const r of prevCostRecons) {
    const key = `${r.productId}:${r.costType}`;
    paidByKey[key] = (paidByKey[key] ?? 0) + Number(r.amount ?? 0);
  }

  // Aggregate: max %thu PMG per productId (từ revenue recons)
  const maxPmgPctByProduct: Record<number, number> = {};
  for (const r of prevRevRecons) {
    const pct = Number(r.pmgCumulativePct ?? 0);
    if (pct > (maxPmgPctByProduct[r.productId] ?? 0)) {
      maxPmgPctByProduct[r.productId] = pct;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/costs" className="text-blue-600 hover:underline">
          ← Giá vốn
        </Link>
        <span className="text-slate-400">/</span>
        <span>Nhập hàng loạt</span>
      </div>
      <h1 className="text-2xl font-bold">Nhập hàng loạt đối chiếu giá vốn</h1>
      <BulkCostForm
        products={productOptions}
        paidByKey={paidByKey}
        maxPmgPctByProduct={maxPmgPctByProduct}
        onSave={async (rows) => {
          "use server";
          return await createCostBulk(rows);
        }}
      />
    </div>
  );
}
