import { db } from "@/lib/db";
import { projects, partners } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import ProductForm from "../ProductForm";
import { createProduct } from "@/lib/actions/products";

export default async function NewProductPage() {
  const allProjects = await db
    .select({
      id: projects.id,
      code: projects.code,
      fullCode: projects.fullCode,
      name: projects.name,
      partnerId: projects.partnerId,
      breRole: projects.breRole,
      linkedF1PartnerId: projects.linkedF1PartnerId,
      contractInfo: projects.contractInfo,
      contractStatus: projects.contractStatus,
      contractDocs: projects.contractDocs,
      brokerageRate: projects.brokerageRate,
      brokerageRateSale: projects.brokerageRateSale,
      adminFee: projects.adminFee,
      adminFeeSale: projects.adminFeeSale,
      paymentPhases: projects.paymentPhases,
      phaseRate1: projects.phaseRate1,
      phaseRate2: projects.phaseRate2,
      phaseRate3: projects.phaseRate3,
      phaseRate4: projects.phaseRate4,
      phaseRate5: projects.phaseRate5,
      cdtBonusSale: projects.cdtBonusSale,
      cdtBonusManager: projects.cdtBonusManager,
      otherFeePct: projects.otherFeePct,
      otherRevenue: projects.otherRevenue,
      revenueReduction: projects.revenueReduction,
      ctyBonusSale: projects.ctyBonusSale,
      ctyBonusManager: projects.ctyBonusManager,
      paymentDocs: projects.paymentDocs,
      note: projects.note,
      createdAt: projects.createdAt,
      partnerName: partners.name,
    })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name));

  const allPartners = await db.select().from(partners).orderBy(asc(partners.name));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/products" className="text-blue-600 hover:underline">
          ← Giao dịch
        </Link>
        <span className="text-slate-400">/</span>
        <span>Thêm mới</span>
      </div>
      <h1 className="text-2xl font-bold">Thêm giao dịch mới</h1>
      <ProductForm projects={allProjects} partners={allPartners} onSave={createProduct} />
    </div>
  );
}
