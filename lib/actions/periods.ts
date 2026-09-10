"use server";

import { db } from "@/lib/db";
import { costReconciliations } from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { costTypeLabel } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { loadAllContext, summarizePeriod, buildRetroInserts } from "@/lib/period-commission";
import { buildHhSaleWorkbook, buildKpiTpkdWorkbook, workbookToBase64 } from "@/lib/period-excel";

async function loadSummaryOrThrow(periodKey: string) {
  const ctx = await loadAllContext();
  const s = summarizePeriod(ctx, periodKey);
  if (!s) throw new Error("Kỳ không hợp lệ");
  return { ctx, s };
}

/**
 * Tạo đối chiếu hồi tố (hoặc hoàn chi dư) cho các ĐC có chênh trong kỳ.
 * Không sửa ĐC cũ. Logic dựng dòng ở buildRetroInserts (pure, có test).
 */
export async function createRetroRecons(
  periodKey: string,
  reconIds: number[] | "all",
): Promise<{ created: number; skipped: number }> {
  await requirePermission("periods", "edit");
  const { ctx, s } = await loadSummaryOrThrow(periodKey);
  const today = new Date().toISOString().slice(0, 10);
  const inserts = buildRetroInserts(ctx, s, reconIds, today);

  let created = 0;
  for (const ins of inserts) {
    const { sourceReconId, kind, ...row } = ins;
    const data: typeof costReconciliations.$inferInsert = {
      ...row,
      costType: row.costType as typeof costReconciliations.$inferInsert.costType,
    };
    const [rec] = await db
      .insert(costReconciliations)
      .values(data)
      .returning({ id: costReconciliations.id });
    await logActivity({
      entityType: "cost_reconciliation",
      entityId: rec.id,
      productId: row.productId,
      action: "create",
      after: { ...data, sourceReconId } as Record<string, unknown>,
      summary: `${kind} ${costTypeLabel(row.costType)} cho ${row.employeeName} — ${row.amountPayableThisTime.toLocaleString("vi-VN")} (kỳ ${periodKey}, từ ĐC #${sourceReconId})`,
    });
    created++;
  }

  revalidatePath("/periods");
  revalidatePath(`/periods/${periodKey}`);
  revalidatePath("/costs");
  const requested =
    reconIds === "all" ? s.retro.filter((r) => !r.alreadyRetro).length : reconIds.length;
  return { created, skipped: Math.max(0, requested - created) };
}

/** "Bảng HH Sale" — mẫu sample/HH & KPI/Bảng HH Sale T6.2026.xlsx */
export async function exportPeriodHhSale(periodKey: string): Promise<{ filename: string; base64: string }> {
  await requirePermission("periods", "edit");
  const { s } = await loadSummaryOrThrow(periodKey);
  return { filename: `Bang_HH_Sale_${periodKey}.xlsx`, base64: workbookToBase64(buildHhSaleWorkbook(s)) };
}

/** "Quyết định KPI TPKD" — mẫu sample/HH & KPI/Quyết định KPI TPKD T5-6.xlsx, 1 sheet / phòng */
export async function exportPeriodKpiTpkd(periodKey: string): Promise<{ filename: string; base64: string }> {
  await requirePermission("periods", "edit");
  const { s } = await loadSummaryOrThrow(periodKey);
  return { filename: `QD_KPI_TPKD_${periodKey}.xlsx`, base64: workbookToBase64(buildKpiTpkdWorkbook(s)) };
}
