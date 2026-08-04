"use server";

import { db } from "@/lib/db";
import { kimEntryReconciliation, accountingJournal, paymentRequests } from "@/lib/schema";
import { sql, and, gte, lte, eq, ne, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type KimEntryWithRecon = {
  id: number;
  entryDate: string;
  docType: string;
  docNumber: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  status: string;
  linkedIds: number[];
  note: string | null;
};

export type DnttCandidate = {
  id: number;
  stt: number | null;
  requestDate: string | null;
  detail: string | null;
  amount: number;
  recipient: string | null;
  recipientBank: string | null;
  paidAt: string | null;
  reviewedStatus: string | null;
  alreadyLinkedTo: number | null; // Kim entry id if already linked elsewhere
};

/**
 * List Kim entries theo TK + tình trạng.
 */
export async function listKimEntries(opts: {
  tk: string; // debit_account
  year?: string; // "2025"
  status?: string; // 'pending' | 'done' | 'all'
}): Promise<KimEntryWithRecon[]> {
  const rows = await db
    .select({
      id: accountingJournal.id,
      entryDate: accountingJournal.entryDate,
      docType: accountingJournal.docType,
      docNumber: accountingJournal.docNumber,
      description: accountingJournal.description,
      debitAccount: accountingJournal.debitAccount,
      creditAccount: accountingJournal.creditAccount,
      amount: accountingJournal.amount,
      status: kimEntryReconciliation.status,
      linkedIds: kimEntryReconciliation.linkedPaymentRequestIds,
      note: kimEntryReconciliation.note,
    })
    .from(accountingJournal)
    .leftJoin(
      kimEntryReconciliation,
      eq(kimEntryReconciliation.kimEntryId, accountingJournal.id),
    )
    .where(
      and(
        eq(accountingJournal.debitAccount, opts.tk),
        ne(accountingJournal.creditAccount, "911"),
        opts.year
          ? sql`substr(${accountingJournal.entryDate}, 1, 4) = ${opts.year}`
          : undefined,
      ),
    )
    .orderBy(accountingJournal.entryDate);

  const filtered = rows.filter((r) => {
    const st = r.status ?? "pending";
    if (!opts.status || opts.status === "all") return true;
    return st === opts.status;
  });

  return filtered.map((r) => ({
    id: r.id,
    entryDate: r.entryDate,
    docType: r.docType,
    docNumber: r.docNumber,
    description: r.description,
    debitAccount: r.debitAccount,
    creditAccount: r.creditAccount,
    amount: Number(r.amount),
    status: r.status ?? "pending",
    linkedIds: (r.linkedIds ?? []) as number[],
    note: r.note,
  }));
}

/**
 * Get DNTT candidates match cho 1 Kim entry.
 * Match logic:
 *   - Amount tương đương (±5% hoặc chính xác)
 *   - Ngày trong khoảng entry ± 30 ngày
 * + Show DNTT nào đã link Kim khác (để cảnh báo dup).
 */
export async function getDnttCandidates(kimEntryId: number): Promise<DnttCandidate[]> {
  const [entry] = await db
    .select()
    .from(accountingJournal)
    .where(eq(accountingJournal.id, kimEntryId));
  if (!entry) return [];

  const entryDate = new Date(entry.entryDate);
  const from = new Date(entryDate);
  from.setDate(from.getDate() - 30);
  const to = new Date(entryDate);
  to.setDate(to.getDate() + 30);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  // Lấy DNTT trong ± 30 ngày, amount ≤ entry.amount + 20% (breakdown thường
  // nhỏ hơn hoặc bằng Kim bulk).
  const dntt = await db
    .select()
    .from(paymentRequests)
    .where(
      and(
        gte(paymentRequests.requestDate, fromStr),
        lte(paymentRequests.requestDate, toStr),
        lte(paymentRequests.amount, entry.amount * 1.2),
      ),
    )
    .orderBy(paymentRequests.requestDate);

  // Check DNTT nào đã link Kim entry khác (chống dup)
  const linkedMap = new Map<number, number>();
  const allRecons = await db
    .select({
      kimId: kimEntryReconciliation.kimEntryId,
      ids: kimEntryReconciliation.linkedPaymentRequestIds,
    })
    .from(kimEntryReconciliation)
    .where(ne(kimEntryReconciliation.kimEntryId, kimEntryId));
  for (const r of allRecons) {
    for (const id of (r.ids ?? []) as number[]) linkedMap.set(id, r.kimId);
  }

  return dntt.map((d) => ({
    id: d.id,
    stt: d.stt,
    requestDate: d.requestDate,
    detail: d.detail,
    amount: Number(d.amount),
    recipient: d.recipient,
    recipientBank: d.recipientBank,
    paidAt: d.paidAt,
    reviewedStatus: d.reviewedStatus,
    alreadyLinkedTo: linkedMap.get(d.id) ?? null,
  }));
}

/**
 * Save reconciliation: mark done + link DNTT ids + note.
 */
export async function saveReconciliation(opts: {
  kimEntryId: number;
  linkedIds: number[];
  status: "pending" | "done" | "needs_kim" | "orphan";
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };

  await db
    .insert(kimEntryReconciliation)
    .values({
      kimEntryId: opts.kimEntryId,
      linkedPaymentRequestIds: opts.linkedIds,
      status: opts.status,
      note: opts.note || null,
      reconciledAt: opts.status === "done" ? new Date() : null,
      reconciledBy: user.email,
    })
    .onConflictDoUpdate({
      target: kimEntryReconciliation.kimEntryId,
      set: {
        linkedPaymentRequestIds: opts.linkedIds,
        status: opts.status,
        note: opts.note || null,
        reconciledAt: opts.status === "done" ? new Date() : null,
        reconciledBy: user.email,
      },
    });

  revalidatePath("/admin/kim-breakdown");
  return { ok: true };
}

/**
 * Progress stats per TK.
 */
export async function getProgressStats(year: string): Promise<
  Array<{ tk: string; total: number; done: number; pending: number; sumTotal: number; sumDone: number }>
> {
  const rows = await db.execute(sql`
    SELECT
      aj.debit_account as tk,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE COALESCE(kr.status, 'pending') = 'done') as done,
      COUNT(*) FILTER (WHERE COALESCE(kr.status, 'pending') = 'pending') as pending,
      SUM(aj.amount)::float8 as sum_total,
      SUM(aj.amount) FILTER (WHERE COALESCE(kr.status, 'pending') = 'done')::float8 as sum_done
    FROM accounting_journal aj
    LEFT JOIN kim_entry_reconciliation kr ON kr.kim_entry_id = aj.id
    WHERE aj.debit_account IN ('6411','6417','6421','6423','6425','6427','811','635','3383','3384','3386','3334','3335','33311')
      AND aj.credit_account != '911'
      AND substr(aj.entry_date, 1, 4) = ${year}
    GROUP BY aj.debit_account
    ORDER BY aj.debit_account`);
  return (rows as any[]).map((r) => ({
    tk: r.tk,
    total: Number(r.total),
    done: Number(r.done),
    pending: Number(r.pending),
    sumTotal: Number(r.sum_total || 0),
    sumDone: Number(r.sum_done || 0),
  }));
}
