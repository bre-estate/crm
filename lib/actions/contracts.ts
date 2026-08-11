"use server";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { contracts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { PmgTier } from "@/lib/pmg-tier-parser";

export type ContractTiersInput = {
  tiers: PmgTier[];
  metric: "count" | "percent" | "combined" | "other";
  retroactive: boolean;
  notes: string | null;
};

export async function updateContractTiers(contractId: number, input: ContractTiersInput) {
  await requirePermission("finance");

  // Validate tiers
  if (!Array.isArray(input.tiers)) throw new Error("Tiers phải là array");
  const cleaned: PmgTier[] = [];
  for (const t of input.tiers) {
    const min = Number(t.min);
    const max = t.max == null ? null : Number(t.max);
    const rate = Number(t.rate);
    if (!Number.isFinite(min) || min < 0) throw new Error(`Bậc thiếu ngưỡng min hợp lệ`);
    if (max != null && (!Number.isFinite(max) || max < min)) throw new Error(`Bậc có ngưỡng max không hợp lệ (min ${min}, max ${max})`);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error(`Rate phải trong khoảng 0-100%`);
    const saleCap = t.saleCap == null ? null : Number(t.saleCap);
    if (saleCap != null && (!Number.isFinite(saleCap) || saleCap < 0 || saleCap > 1)) {
      throw new Error(`Trần sale phải trong khoảng 0-100%`);
    }
    cleaned.push({ min, max, rate, saleCap: saleCap ?? undefined });
  }
  cleaned.sort((a, b) => a.min - b.min);

  await db.update(contracts)
    .set({
      pmgTiers: cleaned.length > 0 ? cleaned : null,
      pmgMetric: input.metric,
      pmgRetroactive: input.retroactive,
      pmgNotes: input.notes?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, contractId));

  revalidatePath("/projects");
  revalidatePath(`/projects`);
  revalidatePath("/admin/rate-audit");
}
