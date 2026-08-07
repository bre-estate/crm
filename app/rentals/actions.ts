"use server";

import { db } from "@/lib/db";
import { rentals } from "@/lib/schema";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createRental(formData: FormData): Promise<void> {
  const monthlyRent = Number(formData.get("monthly_rent") ?? 0);
  const leaseTermMonths = Number(formData.get("lease_term_months") ?? 12);
  const leaseStart = String(formData.get("lease_start") ?? "");
  // Compute lease_end
  const start = new Date(leaseStart);
  const end = new Date(start);
  end.setMonth(end.getMonth() + leaseTermMonths);
  const leaseEnd = end.toISOString().slice(0, 10);

  // Default total_fee = 1 tháng rent × term/12 (practice VN)
  const totalFeeInput = Number(formData.get("total_fee") ?? 0);
  const totalFee = totalFeeInput > 0 ? totalFeeInput : Math.round(monthlyRent * leaseTermMonths / 12);

  const commissionRate = Number(formData.get("commission_rate") ?? 0.5);
  const commissionAmount = Math.round(totalFee * commissionRate);
  const companyAmount = totalFee - commissionAmount;

  await db.insert(rentals).values({
    unitCode: String(formData.get("unit_code") ?? "").trim(),
    projectName: String(formData.get("project_name") ?? "").trim() || null,
    landlordName: String(formData.get("landlord_name") ?? "").trim() || null,
    landlordPhone: String(formData.get("landlord_phone") ?? "").trim() || null,
    tenantName: String(formData.get("tenant_name") ?? "").trim(),
    tenantPhone: String(formData.get("tenant_phone") ?? "").trim() || null,
    monthlyRent,
    leaseTermMonths,
    leaseStart,
    leaseEnd,
    deposit: Number(formData.get("deposit") ?? 0),
    totalFee,
    commissionRate,
    commissionAmount,
    companyAmount,
    contractDate: String(formData.get("contract_date") ?? leaseStart),
    salesPerson: String(formData.get("sales_person") ?? "").trim(),
    status: "active",
    settlementStatus: "pending",
    note: String(formData.get("note") ?? "").trim() || null,
  });

  revalidatePath("/rentals");
  redirect("/rentals");
}
