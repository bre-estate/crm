"use server";

import { requirePermission } from "@/lib/auth";
import { loadCommissionRows, type PayrollLayout } from "@/lib/payroll";

export async function loadPayrollPreview(input: {
  employeeName: string;
  layout: PayrollLayout;
  fromDate: string;
  toDate: string;
}) {
  await requirePermission("payroll.commissions", "view");
  const rows = await loadCommissionRows(input);
  return rows.map((r) => ({
    reconId: r.reconId,
    unitCode: r.unitCode,
    projectName: r.projectName,
    costType: r.costType,
    pmgBasePrice: r.pmgBasePrice,
    pmgLkSaleRate: r.pmgLkSaleRate,
    commissionRate: r.commissionRate,
    paymentProgressPct: r.paymentProgressPct,
    amountLK: r.amountPayableThisTime,
    paidLK: r.paidLK,
  }));
}
