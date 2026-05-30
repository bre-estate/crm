import { db } from "@/lib/db";
import {
  revenueReconciliations,
  invoices,
  paymentsIn,
  products,
  projects,
  partners,
} from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import RevenueForm from "../../RevenueForm";
import { updateRevenue, deleteRevenue } from "@/lib/actions/revenues";

export default async function EditRevenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [recon] = await db
    .select()
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.id, id));
  if (!recon) notFound();

  let invoiceInit: { number: string; date: string | null; totalAmountVat: number } | undefined;
  if (recon.invoiceId) {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, recon.invoiceId));
    if (inv)
      invoiceInit = {
        number: inv.invoiceNumber,
        date: inv.invoiceDate,
        totalAmountVat: Number(inv.totalAmountVat ?? 0),
      };
  }

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

  const payments = await db
    .select()
    .from(paymentsIn)
    .where(eq(paymentsIn.reconciliationId, id))
    .orderBy(asc(paymentsIn.paymentDate));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/revenues" className="text-blue-600 hover:underline">
          ← Doanh thu
        </Link>
        <span className="text-slate-400">/</span>
        <span>Sửa đợt #{id}</span>
      </div>
      <h1 className="text-2xl font-bold">Sửa đợt đối chiếu doanh thu</h1>

      {payments.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
          <div className="font-semibold mb-1">Đã có {payments.length} lần thanh toán cho đợt này:</div>
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

      <RevenueForm
        recon={recon}
        invoiceInit={invoiceInit}
        products={productOptions}
        onSave={async (fd) => {
          "use server";
          await updateRevenue(id, fd);
        }}
        onDelete={async () => {
          "use server";
          await deleteRevenue(id);
        }}
      />
    </div>
  );
}
