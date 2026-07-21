import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  departments,
  employees,
  productAdjustments,
  revenueReconciliations,
  costReconciliations,
} from "@/lib/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProductForm from "../../ProductForm";
import { updateProduct, deleteProduct } from "@/lib/actions/products";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const returnTo =
    sp.returnTo && sp.returnTo.startsWith("/") && !sp.returnTo.startsWith("//")
      ? sp.returnTo
      : null;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) notFound();

  const allProjects = await db
    .select({
      id: projects.id,
      code: projects.code,
      fullCode: projects.fullCode,
      name: projects.name,
      partnerId: projects.partnerId,
      breRole: projects.breRole,
      linkedF1PartnerId: projects.linkedF1PartnerId,
      defaultSaleType: projects.defaultSaleType,
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
      totalUnits: projects.totalUnits,
      launchPhases: projects.launchPhases,
      priceRangeMin: projects.priceRangeMin,
      priceRangeMax: projects.priceRangeMax,
      handoverExpected: projects.handoverExpected,
      developerWebsite: projects.developerWebsite,
      batdongsanUrl: projects.batdongsanUrl,
      cafelandUrl: projects.cafelandUrl,
      district: projects.district,
      city: projects.city,
      dataSourceNote: projects.dataSourceNote,
      dataUpdatedAt: projects.dataUpdatedAt,
      createdAt: projects.createdAt,
      partnerName: partners.name,
    })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name));

  const allPartners = await db.select().from(partners).orderBy(asc(partners.name));
  const allDepts = await db.select().from(departments).orderBy(asc(departments.name));
  const allEmployees = await db
    .select({
      id: employees.id,
      name: employees.name,
      position: employees.position,
      departmentId: employees.departmentId,
    })
    .from(employees)
    .where(eq(employees.active, true))
    .orderBy(asc(employees.name));

  const adjustments = await db
    .select()
    .from(productAdjustments)
    .where(eq(productAdjustments.productId, id))
    .orderBy(desc(productAdjustments.effectiveDate), desc(productAdjustments.id));

  // Nếu căn đã có recon doanh thu hoặc giá vốn → khóa 3 field (pmgBase/pmgRate/adminFee)
  // và bắt buộc dùng "Điều chỉnh thông tin căn" để giữ lịch sử. Chưa có recon → edit trực tiếp.
  const [{ revC = 0 }] = await db
    .select({ revC: sql<number>`count(*)::int` })
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.productId, id));
  const [{ costC = 0 }] = await db
    .select({ costC: sql<number>`count(*)::int` })
    .from(costReconciliations)
    .where(eq(costReconciliations.productId, id));
  const hasRecons = Number(revC) + Number(costC) > 0;

  // Sum recon cdt_bonus_sale/manager — để form pre-check trước khi submit
  // (chặn user giảm config bên dưới sum đã ĐC + toast warning trực tiếp).
  const [reconBonusSums] = await db
    .select({
      sumBonusSale: sql<string>`COALESCE(SUM(${revenueReconciliations.cdtBonusSale}), 0)`,
      sumBonusMgr: sql<string>`COALESCE(SUM(${revenueReconciliations.cdtBonusManager}), 0)`,
    })
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.productId, id));
  const reconCdtBonusSaleSum = Number(reconBonusSums?.sumBonusSale ?? 0);
  const reconCdtBonusMgrSum = Number(reconBonusSums?.sumBonusMgr ?? 0);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href={returnTo ?? "/products"} className="text-blue-600 hover:underline">
          ← Giao dịch
        </Link>
        <span className="text-slate-400">/</span>
        <Link
          href={
            returnTo
              ? `/products/${id}?returnTo=${encodeURIComponent(returnTo)}`
              : `/products/${id}`
          }
          className="text-blue-600 hover:underline font-mono"
        >
          {product.productCode}
        </Link>
        <span className="text-slate-400">/</span>
        <span>Sửa</span>
      </div>
      <ProductForm
        product={product}
        projects={allProjects}
        partners={allPartners}
        departments={allDepts}
        employees={allEmployees}
        returnTo={returnTo}
        lockCoreFields={hasRecons}
        reconCdtBonusSaleSum={reconCdtBonusSaleSum}
        reconCdtBonusMgrSum={reconCdtBonusMgrSum}
        existingAdjustments={adjustments}
        onSave={async (fd) => {
          "use server";
          await updateProduct(id, fd);
        }}
        onDelete={async () => {
          "use server";
          await deleteProduct(id);
        }}
      />
    </div>
  );
}
