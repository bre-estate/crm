"use server";
import { db } from "@/lib/db";
import { invoices, revenueReconciliations } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function deleteOrphanInvoice(id: number) {
  await requirePermission("invoices", "delete");
  // Bảo vệ: chỉ được xóa nếu 0 recon (tránh mất data)
  const [check] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(revenueReconciliations)
    .where(eq(revenueReconciliations.invoiceId, id));
  if (Number(check?.cnt ?? 0) > 0) {
    throw new Error("Không xóa được — hóa đơn còn đợt đối chiếu link vào.");
  }
  await db.delete(invoices).where(eq(invoices.id, id));
  revalidatePath("/invoices");
  redirect("/invoices");
}
