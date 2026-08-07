"use server";

import { db } from "@/lib/db";
import { secondarySales } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createSecondarySale(formData: FormData): Promise<void> {
  const totalFee = Number(formData.get("total_fee") ?? 0);
  const commissionRate = Number(formData.get("commission_rate") ?? 0.5);
  const commissionAmount = Math.round(totalFee * commissionRate);
  const companyAmount = totalFee - commissionAmount;

  await db.insert(secondarySales).values({
    unitCode: String(formData.get("unit_code") ?? "").trim(),
    projectName: String(formData.get("project_name") ?? "").trim() || null,
    sellPrice: Number(formData.get("sell_price") ?? 0),
    salesPerson: String(formData.get("sales_person") ?? "").trim(),
    depositDate: String(formData.get("deposit_date") ?? "") || null,
    completionDate: String(formData.get("completion_date") ?? "") || null,
    recognitionMonth: String(formData.get("recognition_month") ?? "") || null,
    totalFee,
    commissionRate,
    commissionAmount,
    companyAmount,
    status: "processing",
    settlementStatus: "pending",
    note: String(formData.get("note") ?? "").trim() || null,
    sourceFile: null,
  });

  revalidatePath("/secondary-sales");
  redirect("/secondary-sales");
}

export async function markSettled(id: number, settledDate: string): Promise<void> {
  await db.update(secondarySales)
    .set({ settlementStatus: "settled", settledDate, status: "done", updatedAt: new Date() })
    .where(eq(secondarySales.id, id));
  revalidatePath("/secondary-sales");
}

export async function updateSecondarySale(id: number, formData: FormData): Promise<void> {
  const totalFee = Number(formData.get("total_fee") ?? 0);
  const commissionRate = Number(formData.get("commission_rate") ?? 0.5);
  const commissionAmount = Math.round(totalFee * commissionRate);
  const companyAmount = totalFee - commissionAmount;
  const settlementStatus = String(formData.get("settlement_status") ?? "pending");

  await db.update(secondarySales).set({
    unitCode: String(formData.get("unit_code") ?? "").trim(),
    projectName: String(formData.get("project_name") ?? "").trim() || null,
    sellPrice: Number(formData.get("sell_price") ?? 0),
    salesPerson: String(formData.get("sales_person") ?? "").trim(),
    depositDate: String(formData.get("deposit_date") ?? "") || null,
    completionDate: String(formData.get("completion_date") ?? "") || null,
    recognitionMonth: String(formData.get("recognition_month") ?? "") || null,
    totalFee,
    commissionRate,
    commissionAmount,
    companyAmount,
    settlementStatus,
    settledDate: settlementStatus === "settled" ? (String(formData.get("settled_date") ?? "") || null) : null,
    status: settlementStatus === "settled" ? "done" : "processing",
    note: String(formData.get("note") ?? "").trim() || null,
    updatedAt: new Date(),
  }).where(eq(secondarySales.id, id));

  revalidatePath("/secondary-sales");
  redirect("/secondary-sales");
}
