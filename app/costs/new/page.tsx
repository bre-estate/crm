import { db } from "@/lib/db";
import { products, projects, partners } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import CostForm from "../CostForm";
import { createCost } from "@/lib/actions/costs";

export default async function NewCostPage() {
  const productOptions = await db
    .select({
      id: products.id,
      productCode: products.productCode,
      unitCode: products.unitCode,
      pmgBasePrice: products.pmgBasePrice,
      pmgSaleRate: products.pmgSaleRate,
      saleCommissionRate: products.saleCommissionRate,
      adminFeeSale: products.adminFeeSale,
      salesPerson: products.salesPerson,
      projectName: projects.name,
      partnerName: partners.name,
    })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name), asc(products.unitCode));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/costs" className="text-blue-600 hover:underline">
          ← Giá vốn
        </Link>
        <span className="text-slate-400">/</span>
        <span>Thêm dòng đối chiếu</span>
      </div>
      <h1 className="text-2xl font-bold">Thêm dòng đối chiếu giá vốn</h1>
      <CostForm products={productOptions} onSave={createCost} />
    </div>
  );
}
