import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  revenueReconciliations,
  costReconciliations,
  paymentsIn,
} from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { computeHrChecks, filterByField, HR_CHECK_LABELS, type HrCheckField } from "@/lib/hrChecks";
import HrChecksClient from "./HrChecksClient";

export const dynamic = "force-dynamic";

export default async function HrChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string }>;
}) {
  await requirePermission("reports.hr-checks");
  const sp = await searchParams;
  const activeField = (sp.field && sp.field in HR_CHECK_LABELS
    ? sp.field
    : "AA") as HrCheckField;

  // Load all data
  const [productRows, revRows, costRows, payRows] = await Promise.all([
    db
      .select({
        id: products.id,
        productCode: products.productCode,
        unitCode: products.unitCode,
        projectName: projects.name,
        partnerName: partners.name,
        salesPerson: products.salesPerson,
        deptLeaderName: products.deptLeaderName,
        totalRevenue: products.totalRevenue,
        otherCosts: products.otherCosts,
        pmgBasePrice: products.pmgBasePrice,
        pmgSaleRate: products.pmgSaleRate,
        pmgRate: products.pmgRate,
        adminFeeSale: products.adminFeeSale,
        customerSupport: products.customerSupport,
        saleCommissionRate: products.saleCommissionRate,
        kpiCeoRate: products.kpiCeoRate,
        kpiTpkdRate: products.kpiTpkdRate,
        kpiAdminRate: products.kpiAdminRate,
        bonusSale: products.bonusSale,
        bonusManager: products.bonusManager,
        cdtBonusSale: products.cdtBonusSale,
        cdtBonusManager: products.cdtBonusManager,
      })
      .from(products)
      .leftJoin(projects, eq(products.projectId, projects.id))
      .leftJoin(partners, eq(projects.partnerId, partners.id)),
    db
      .select({
        id: revenueReconciliations.id,
        productId: revenueReconciliations.productId,
        invoiceId: revenueReconciliations.invoiceId,
        totalReceivableThisTime: revenueReconciliations.totalReceivableThisTime,
        revenueThisTime: revenueReconciliations.revenueThisTime,
        paymentProgressPct: revenueReconciliations.paymentProgressPct,
        pmgCumulativePct: revenueReconciliations.pmgCumulativePct,
        cdtBonusSale: revenueReconciliations.cdtBonusSale,
        cdtBonusManager: revenueReconciliations.cdtBonusManager,
      })
      .from(revenueReconciliations),
    db
      .select({
        productId: costReconciliations.productId,
        costType: costReconciliations.costType,
        amountPayableThisTime: costReconciliations.amountPayableThisTime,
        paymentProgressPct: costReconciliations.paymentProgressPct,
      })
      .from(costReconciliations),
    db
      .select({
        reconciliationId: paymentsIn.reconciliationId,
        amount: paymentsIn.amount,
      })
      .from(paymentsIn),
  ]);

  const rows = computeHrChecks(
    productRows.map((p) => ({
      ...p,
      totalRevenue: p.totalRevenue == null ? null : Number(p.totalRevenue),
      otherCosts: p.otherCosts == null ? null : Number(p.otherCosts),
      pmgBasePrice: p.pmgBasePrice == null ? null : Number(p.pmgBasePrice),
      pmgSaleRate: p.pmgSaleRate == null ? null : Number(p.pmgSaleRate),
      pmgRate: p.pmgRate == null ? null : Number(p.pmgRate),
      adminFeeSale: p.adminFeeSale == null ? null : Number(p.adminFeeSale),
      customerSupport: p.customerSupport == null ? null : Number(p.customerSupport),
      saleCommissionRate: p.saleCommissionRate == null ? null : Number(p.saleCommissionRate),
      kpiCeoRate: p.kpiCeoRate == null ? null : Number(p.kpiCeoRate),
      kpiTpkdRate: p.kpiTpkdRate == null ? null : Number(p.kpiTpkdRate),
      kpiAdminRate: p.kpiAdminRate == null ? null : Number(p.kpiAdminRate),
      bonusSale: p.bonusSale == null ? null : Number(p.bonusSale),
      bonusManager: p.bonusManager == null ? null : Number(p.bonusManager),
      cdtBonusSale: p.cdtBonusSale == null ? null : Number(p.cdtBonusSale),
      cdtBonusManager: p.cdtBonusManager == null ? null : Number(p.cdtBonusManager),
    })),
    revRows.map((r) => ({
      id: r.id,
      productId: r.productId,
      invoiceId: r.invoiceId,
      totalReceivableThisTime: Number(r.totalReceivableThisTime ?? 0),
      revenueThisTime: Number(r.revenueThisTime ?? 0),
      paymentProgressPct: Number(r.paymentProgressPct ?? 0),
      pmgCumulativePct: Number(r.pmgCumulativePct ?? 0),
      cdtBonusSale: Number(r.cdtBonusSale ?? 0),
      cdtBonusManager: Number(r.cdtBonusManager ?? 0),
    })),
    costRows.map((c) => ({
      productId: c.productId,
      costType: c.costType,
      amountPayableThisTime: Number(c.amountPayableThisTime ?? 0),
      paymentProgressPct: Number(c.paymentProgressPct ?? 0),
    })),
    payRows
      .filter((p) => p.reconciliationId !== null)
      .map((p) => ({
        reconciliationId: p.reconciliationId as number,
        amount: Number(p.amount ?? 0),
      })),
  );

  // Pre-compute count per field cho tab badges
  const countByField: Record<HrCheckField, number> = {} as Record<HrCheckField, number>;
  const sumByField: Record<HrCheckField, number> = {} as Record<HrCheckField, number>;
  for (const f of Object.keys(HR_CHECK_LABELS) as HrCheckField[]) {
    const filtered = filterByField(rows, f);
    countByField[f] = filtered.length;
    sumByField[f] = filtered.reduce((s, r) => s + r.values[f], 0);
  }

  return (
    <div className="space-y-4 max-w-full">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">
            ← Báo cáo
          </Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">🧾 Kiểm tra HR hàng tháng</h1>
        <p className="text-sm text-slate-500 mt-1">
          13 loại chỉ số per căn, khớp cột W → AI trong sheet Excel &quot;3_BC DOANH THU
          - GIA VON&quot;. Chỉ hiển thị căn có |giá trị| &gt; 1.000 VND (hoặc 0,1% với cột Z).
        </p>
      </div>

      <HrChecksClient
        rows={rows}
        activeField={activeField}
        countByField={countByField}
        sumByField={sumByField}
      />
    </div>
  );
}
