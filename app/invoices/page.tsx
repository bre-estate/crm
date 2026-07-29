import { db } from "@/lib/db";
import { invoices, revenueReconciliations, paymentsIn, partners, products, projects } from "@/lib/schema";
import { eq, desc, sql } from "drizzle-orm";
import InvoicesTable from "./InvoicesTable";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  // Aggregate: mỗi HĐ có N recon, mỗi recon có M payment.
  // Query 2 vòng: recon count + total per invoice; payments sum per invoice.
  const invRows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      invoiceDate: invoices.invoiceDate,
      totalAmountVat: invoices.totalAmountVat,
      partnerId: invoices.partnerId,
      partnerName: partners.name,
    })
    .from(invoices)
    .leftJoin(partners, eq(partners.id, invoices.partnerId))
    .orderBy(desc(invoices.invoiceDate));

  const reconAgg = await db
    .select({
      invoiceId: revenueReconciliations.invoiceId,
      cnt: sql<number>`COUNT(*)::int`.as("cnt"),
      totalRecon: sql<string>`COALESCE(SUM(${revenueReconciliations.totalReceivableThisTime}), 0)`.as(
        "total_recon",
      ),
    })
    .from(revenueReconciliations)
    .groupBy(revenueReconciliations.invoiceId);

  const paymentAgg = await db
    .select({
      invoiceId: revenueReconciliations.invoiceId,
      totalPaid: sql<string>`COALESCE(SUM(${paymentsIn.amount}), 0)`.as("total_paid"),
    })
    .from(paymentsIn)
    .innerJoin(
      revenueReconciliations,
      eq(paymentsIn.reconciliationId, revenueReconciliations.id),
    )
    .groupBy(revenueReconciliations.invoiceId);

  const reconByInv = new Map<number, { cnt: number; totalRecon: number }>();
  for (const r of reconAgg)
    if (r.invoiceId)
      reconByInv.set(r.invoiceId, {
        cnt: Number(r.cnt ?? 0),
        totalRecon: Number(r.totalRecon ?? 0),
      });

  const paidByInv = new Map<number, number>();
  for (const p of paymentAgg)
    if (p.invoiceId) paidByInv.set(p.invoiceId, Number(p.totalPaid ?? 0));

  // Với invoice không có partner_id (thường là recons từ nhiều CĐT), suy partners
  // qua recon → product → project → partner. Nếu có nhiều partner → hiển thị list.
  const invsMissingPartner = invRows.filter((i) => !i.partnerName).map((i) => i.id);
  const partnersFromRecon = new Map<number, Set<string>>(); // invoiceId → partnerName set
  if (invsMissingPartner.length > 0) {
    const rows = await db
      .select({
        invoiceId: revenueReconciliations.invoiceId,
        partnerName: partners.name,
      })
      .from(revenueReconciliations)
      .leftJoin(products, eq(products.id, revenueReconciliations.productId))
      .leftJoin(projects, eq(projects.id, products.projectId))
      .leftJoin(partners, eq(partners.id, projects.partnerId));
    for (const r of rows) {
      if (r.invoiceId == null || !r.partnerName) continue;
      const set = partnersFromRecon.get(r.invoiceId) ?? new Set<string>();
      set.add(r.partnerName);
      partnersFromRecon.set(r.invoiceId, set);
    }
  }

  const rows = invRows.map((inv) => {
    const total = Number(inv.totalAmountVat ?? 0);
    const paid = paidByInv.get(inv.id) ?? 0;
    const recon = reconByInv.get(inv.id) ?? { cnt: 0, totalRecon: 0 };
    let partnerLabel: string | null = inv.partnerName ?? null;
    if (!partnerLabel) {
      const set = partnersFromRecon.get(inv.id);
      if (set && set.size > 0) {
        const names = [...set].sort();
        partnerLabel = names.length === 1 ? names[0] : names.join(" + ");
      }
    }
    return {
      id: inv.id,
      number: inv.invoiceNumber,
      date: inv.invoiceDate,
      partnerName: partnerLabel,
      total,
      paid,
      remaining: total - paid,
      reconCount: recon.cnt,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Hóa đơn</h1>
        <p className="text-sm text-slate-500 mt-1">
          Danh sách hóa đơn đã lập. Giá trị HĐ auto tính từ tổng các đợt đối chiếu link vào.
        </p>
      </div>

      <InvoicesTable rows={rows} />
    </div>
  );
}

