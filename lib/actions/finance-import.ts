"use server";
import { db } from "@/lib/db";
import { financialTransactions, accountingCategories } from "@/lib/schema";
import { parseByType, type SourceType, type ParsedRow } from "@/lib/accounting/parsers";
import { inArray, sql, eq } from "drizzle-orm";
import { getOwnerEmail } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type ImportPreview = {
  total: number;
  bySource: Record<string, number>;
  byGroup: Array<{ group: string; count: number; sum: number }>;
  dupCount: number;
  sample: Array<{
    transactionDate: string;
    description: string;
    amount: number;
    managementGroup: string;
    categoryCode: string;
    payer: string | null;
    isDup: boolean;
  }>;
};

async function requireOwner() {
  const email = await getOwnerEmail();
  if (!email) throw new Error("Chỉ owner được import");
}

export async function previewImport(
  type: SourceType,
  fileBase64: string,
): Promise<ImportPreview> {
  await requireOwner();
  const buf = Buffer.from(fileBase64, "base64");
  const rows = parseByType(type, buf);
  return await buildPreview(rows);
}

async function buildPreview(rows: ParsedRow[]): Promise<ImportPreview> {
  // Query existing dedup keys
  const dupSet = new Set<string>();
  if (rows.length > 0) {
    const keys = rows.map((r) => r.dedupKey);
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += 500) chunks.push(keys.slice(i, i + 500));
    for (const chunk of chunks) {
      const existing = await db
        .select({ k: financialTransactions.dedupKey })
        .from(financialTransactions)
        .where(inArray(financialTransactions.dedupKey, chunk));
      existing.forEach((e) => dupSet.add(e.k));
    }
  }

  const byGroupMap = new Map<string, { count: number; sum: number }>();
  const bySource: Record<string, number> = {};
  let dupCount = 0;
  for (const r of rows) {
    const g = r.managementGroup ?? "?";
    const cur = byGroupMap.get(g) ?? { count: 0, sum: 0 };
    cur.count++;
    cur.sum += r.amount;
    byGroupMap.set(g, cur);
    bySource[r.sourceFile] = (bySource[r.sourceFile] ?? 0) + 1;
    if (dupSet.has(r.dedupKey)) dupCount++;
  }
  const byGroup = [...byGroupMap.entries()]
    .map(([group, v]) => ({ group, count: v.count, sum: v.sum }))
    .sort((a, b) => a.group.localeCompare(b.group));

  const sample = rows.slice(0, 20).map((r) => ({
    transactionDate: r.transactionDate,
    description: r.description,
    amount: r.amount,
    managementGroup: r.managementGroup ?? "",
    categoryCode: r.categoryCode,
    payer: r.payer ?? null,
    isDup: dupSet.has(r.dedupKey),
  }));

  return { total: rows.length, bySource, byGroup, dupCount, sample };
}

export async function applyImport(
  type: SourceType,
  fileBase64: string,
): Promise<{ inserted: number; skipped: number }> {
  await requireOwner();
  const buf = Buffer.from(fileBase64, "base64");
  const rows = parseByType(type, buf);

  // Validate category codes tồn tại (avoid FK errors)
  const cats = await db.select({ code: accountingCategories.code }).from(accountingCategories);
  const validCodes = new Set(cats.map((c) => c.code));
  const badRows = rows.filter((r) => !validCodes.has(r.categoryCode));
  if (badRows.length > 0) {
    throw new Error(
      `Có ${badRows.length} row với categoryCode không tồn tại: ${[...new Set(badRows.map((r) => r.categoryCode))].join(", ")}`,
    );
  }

  let inserted = 0;
  let skipped = 0;
  // Batch insert 200 rows/lần, ON CONFLICT (dedup_key) DO NOTHING
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const res = await db
      .insert(financialTransactions)
      .values(chunk)
      .onConflictDoNothing({ target: financialTransactions.dedupKey })
      .returning({ id: financialTransactions.id });
    inserted += res.length;
    skipped += chunk.length - res.length;
  }
  revalidatePath("/finance");
  revalidatePath("/finance/transactions");
  return { inserted, skipped };
}

export async function clearAllTransactions(): Promise<{ deleted: number }> {
  await requireOwner();
  const before = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(financialTransactions);
  await db.delete(financialTransactions);
  revalidatePath("/finance");
  revalidatePath("/finance/transactions");
  return { deleted: before[0]?.n ?? 0 };
}

export async function reclassifyTransaction(
  id: number,
  categoryCode: string,
  managementGroup: string,
): Promise<void> {
  await requireOwner();
  await db
    .update(financialTransactions)
    .set({
      categoryCode,
      managementGroup,
      updatedAt: new Date(),
    })
    .where(eq(financialTransactions.id, id));
  revalidatePath("/finance/transactions");
}
