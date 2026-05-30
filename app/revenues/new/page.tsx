import { db } from "@/lib/db";
import { products, projects, partners } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import RevenueForm from "../RevenueForm";
import { createRevenue } from "@/lib/actions/revenues";

export default async function NewRevenuePage() {
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

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/revenues" className="text-blue-600 hover:underline">
          ← Doanh thu
        </Link>
        <span className="text-slate-400">/</span>
        <span>Thêm đợt đối chiếu</span>
      </div>
      <h1 className="text-2xl font-bold">Thêm đợt đối chiếu doanh thu</h1>
      <RevenueForm products={productOptions} onSave={createRevenue} />
    </div>
  );
}
