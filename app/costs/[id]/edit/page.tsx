import { db } from "@/lib/db";
import { costReconciliations, paymentsOut, products, projects, partners } from "@/lib/schema";
import { and, asc, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import CostForm from "../../CostForm";
import { updateCost, deleteCost } from "@/lib/actions/costs";

export default async function EditCostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [recon] = await db
    .select()
    .from(costReconciliations)
    .where(eq(costReconciliations.id, id));
  if (!recon) notFound();

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

  const payments = await db
    .select()
    .from(paymentsOut)
    .where(eq(paymentsOut.costReconciliationId, id))
    .orderBy(asc(paymentsOut.paymentDate));

  // Previous recons cùng (product × cost_type × employee) để hiển thị progress
  const previousRecons = await db
    .select({
      id: costReconciliations.id,
      date: costReconciliations.reconciliationDate,
      amount: costReconciliations.amountPayableThisTime,
      note: costReconciliations.note,
    })
    .from(costReconciliations)
    .where(
      and(
        eq(costReconciliations.productId, recon.productId),
        eq(costReconciliations.costType, recon.costType),
        recon.employeeName
          ? eq(costReconciliations.employeeName, recon.employeeName)
          : eq(costReconciliations.employeeName, ""),
        ne(costReconciliations.id, id),
      ),
    )
    .orderBy(asc(costReconciliations.reconciliationDate));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/costs" className="text-blue-600 hover:underline">
          ← Giá vốn
        </Link>
        <span className="text-slate-400">/</span>
        <span>Sửa dòng #{id}</span>
      </div>
      <h1 className="text-2xl font-bold">Sửa đối chiếu giá vốn</h1>

      {payments.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
          <div className="font-semibold mb-1">Đã có {payments.length} lần thanh toán:</div>
          <ul className="list-disc list-inside text-xs text-slate-700">
            {payments.map((p) => (
              <li key={p.id}>
                {p.paymentDate ?? "(chưa có ngày)"} —{" "}
                {new Intl.NumberFormat("vi-VN").format(Number(p.amount ?? 0))} VND
              </li>
            ))}
          </ul>
        </div>
      )}

      <CostForm
        recon={recon}
        products={productOptions}
        previousRecons={previousRecons}
        onSave={async (fd) => {
          "use server";
          await updateCost(id, fd);
        }}
        onDelete={async () => {
          "use server";
          await deleteCost(id);
        }}
      />
    </div>
  );
}
