import { db } from "@/lib/db";
import {
  costReconciliations,
  paymentsOut,
  products,
  projects,
  partners,
  employees,
  activityLogs,
} from "@/lib/schema";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import CostForm from "../../CostForm";
import CostPaymentsEditor from "./CostPaymentsEditor";
import {
  updateCost,
  deleteCost,
  addPaymentOut,
  updatePaymentOut,
  deletePaymentOut,
} from "@/lib/actions/costs";
import AutoDismissBanner from "@/components/AutoDismissBanner";
import ActivityHistoryButton from "@/app/products/[id]/ActivityHistoryButton";

export default async function EditCostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; returnTo?: string }>;
}) {
  const { id: idStr } = await params;
  const { created, returnTo: rawReturnTo } = await searchParams;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();
  const justCreated = created === "1";
  // Chỉ nhận relative path, chống open-redirect
  const returnTo =
    rawReturnTo && rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : null;

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
  // Previous recons cùng (căn × cost_type) — bỏ filter theo employee vì
  // 1 căn thường chỉ 1 sale, và "Đã ĐC trước" logic là theo căn.
  const previousRecons = await db
    .select({
      id: costReconciliations.id,
      date: costReconciliations.reconciliationDate,
      amount: costReconciliations.amountPayableThisTime,
      note: costReconciliations.note,
      progressN: costReconciliations.paymentProgressPct,
    })
    .from(costReconciliations)
    .where(
      and(
        eq(costReconciliations.productId, recon.productId),
        eq(costReconciliations.costType, recon.costType),
        ne(costReconciliations.id, id),
      ),
    )
    .orderBy(asc(costReconciliations.reconciliationDate));

  const allEmployees = await db
    .select({
      id: employees.id,
      name: employees.name,
      position: employees.position,
    })
    .from(employees)
    .where(eq(employees.active, true))
    .orderBy(asc(employees.name));

  // allRecons: cho phép CostForm re-filter previous theo cost_type khi user
  // đổi dropdown ("HH sale" → "thưởng nóng" chẳng hạn). Nếu không có, form
  // dùng previousRecons đã filter server-side theo cost_type CŨ → hiển thị sai.
  const allRecons = await db
    .select({
      id: costReconciliations.id,
      productId: costReconciliations.productId,
      costType: costReconciliations.costType,
      date: costReconciliations.reconciliationDate,
      amount: costReconciliations.amountPayableThisTime,
      progressN: costReconciliations.paymentProgressPct,
      employeeName: costReconciliations.employeeName,
      note: costReconciliations.note,
    })
    .from(costReconciliations)
    .orderBy(asc(costReconciliations.reconciliationDate));

  const activities = await db
    .select()
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.entityType, "cost_reconciliation"),
        eq(activityLogs.entityId, id),
      ),
    )
    .orderBy(desc(activityLogs.createdAt))
    .limit(50);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href={returnTo ?? "/costs"} className="text-blue-600 hover:underline">
          ← Giá vốn
        </Link>
        <span className="text-slate-400">/</span>
        <span>Sửa dòng #{id}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Sửa đối chiếu giá vốn</h1>
        <ActivityHistoryButton activities={activities} />
      </div>

      {justCreated && (
        <AutoDismissBanner variant="success" clearParams={["created"]}>
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="font-semibold">Đã tạo đối chiếu #{id}.</span>{" "}
              Có thể chỉnh sửa tiếp bên dưới hoặc thêm thanh toán.
            </span>
            <Link
              href="/costs"
              className="text-green-700 hover:underline text-xs whitespace-nowrap"
            >
              Về danh sách →
            </Link>
          </div>
        </AutoDismissBanner>
      )}

      <CostForm
        recon={recon}
        products={productOptions}
        previousRecons={previousRecons}
        allRecons={allRecons}
        employees={allEmployees}
        onSave={async (fd) => {
          "use server";
          await updateCost(id, fd, returnTo);
        }}
        onDelete={async () => {
          "use server";
          await deleteCost(id, returnTo);
        }}
      />

      <CostPaymentsEditor
        payments={payments.map((p) => ({
          id: p.id,
          paymentDate: p.paymentDate,
          amount: Number(p.amount ?? 0),
          note: p.note,
        }))}
        payableAmount={Number(recon.amountPayableThisTime ?? 0)}
        onUpdate={async (paymentId, fd) => {
          "use server";
          await updatePaymentOut(paymentId, fd);
        }}
        onDelete={async (paymentId) => {
          "use server";
          await deletePaymentOut(paymentId);
        }}
        onAdd={async (fd) => {
          "use server";
          await addPaymentOut(id, fd);
        }}
      />
    </div>
  );
}
