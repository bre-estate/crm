"use server";

import { db } from "@/lib/db";
import { kimEntryReconciliation, accountingJournal, paymentRequests } from "@/lib/schema";
import { sql, and, gte, lte, eq, ne, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type KimEntryWithRecon = {
  id: number; // ID Kim entry chính (nếu grouped: 1 trong nhóm)
  groupIds: number[]; // Nếu grouped: list Kim entry ids trong nhóm; else = [id]
  entryDate: string;
  docType: string;
  docNumber: string;
  description: string;
  debitAccount: string; // Nếu grouped: "BHXH" (composite)
  creditAccount: string;
  amount: number; // Nếu grouped: sum
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

// TK "BHXH" là composite: gộp 3383+3384+3386 cùng ngày trả (Có 11211) thành
// 1 row tổng. 1 lần trả bank cho cơ quan BHXH quận = 3 TK Kim → 1 DNTT.
const BHXH_TKS = ["3383", "3384", "3386"] as const;

/**
 * List Kim entries theo TK + tình trạng.
 * Special: tk="BHXH" → group 3 TK cùng ngày+creditAccount thành 1 row tổng.
 */
export async function listKimEntries(opts: {
  tk: string; // debit_account hoặc "BHXH"
  year?: string;
  status?: string; // 'pending' | 'done' | 'all'
}): Promise<KimEntryWithRecon[]> {
  const debitFilter = opts.tk === "BHXH"
    ? inArray(accountingJournal.debitAccount, BHXH_TKS as unknown as string[])
    : eq(accountingJournal.debitAccount, opts.tk);

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
        debitFilter,
        ne(accountingJournal.creditAccount, "911"),
        opts.year
          ? sql`substr(${accountingJournal.entryDate}, 1, 4) = ${opts.year}`
          : undefined,
      ),
    )
    .orderBy(accountingJournal.entryDate);

  let mapped: KimEntryWithRecon[];

  if (opts.tk === "BHXH") {
    // Group by (entryDate, creditAccount): 3 TK cùng ngày+credit = 1 row tổng.
    // Status của group = min-severity: nếu bất kỳ row nào pending → pending.
    // linkedIds = union của cả 3.
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.entryDate}|${r.creditAccount}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    mapped = [...groups.values()].map((grp) => {
      const sum = grp.reduce((s, r) => s + Number(r.amount), 0);
      // Status ưu tiên "done" nếu TẤT CẢ done; else pending
      const allDone = grp.every((r) => (r.status ?? "pending") === "done");
      const anyStatus = grp.find((r) => r.status && r.status !== "pending")?.status;
      const status = allDone ? "done" : (anyStatus ?? "pending");
      // linkedIds: union
      const linkedSet = new Set<number>();
      let note: string | null = null;
      for (const r of grp) {
        for (const id of (r.linkedIds ?? []) as number[]) linkedSet.add(id);
        if (r.note && !note) note = r.note;
      }
      const first = grp[0];
      return {
        id: first.id,
        groupIds: grp.map((r) => r.id),
        entryDate: first.entryDate,
        docType: first.docType,
        docNumber: first.docNumber,
        description: `[BHXH gộp ${grp.length} TK] ` + (first.description ?? ""),
        debitAccount: "BHXH",
        creditAccount: first.creditAccount,
        amount: sum,
        status,
        linkedIds: [...linkedSet],
        note,
      };
    });
    mapped.sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  } else {
    mapped = rows.map((r) => ({
      id: r.id,
      groupIds: [r.id],
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

  const filtered = mapped.filter((r) => {
    if (!opts.status || opts.status === "all") return true;
    return r.status === opts.status;
  });

  return filtered;
}

/**
 * Get DNTT candidates match cho 1 Kim entry (hoặc group).
 * Pass kimEntryIds array — nếu group thì cả 3 ids, else 1 id.
 * Sum amount của group để tìm DNTT match.
 */
export async function getDnttCandidates(kimEntryIds: number[]): Promise<DnttCandidate[]> {
  if (kimEntryIds.length === 0) return [];
  const entries = await db
    .select()
    .from(accountingJournal)
    .where(inArray(accountingJournal.id, kimEntryIds));
  if (entries.length === 0) return [];

  const totalAmount = entries.reduce((s, e) => s + Number(e.amount), 0);
  const entryDate = new Date(entries[0].entryDate);
  const from = new Date(entryDate);
  from.setDate(from.getDate() - 30);
  const to = new Date(entryDate);
  to.setDate(to.getDate() + 30);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const dntt = await db
    .select()
    .from(paymentRequests)
    .where(
      and(
        gte(paymentRequests.requestDate, fromStr),
        lte(paymentRequests.requestDate, toStr),
        lte(paymentRequests.amount, totalAmount * 1.2),
      ),
    )
    .orderBy(paymentRequests.requestDate);

  // Check DNTT nào đã link Kim entry KHÁC (không phải cùng group này)
  const linkedMap = new Map<number, number>();
  const allRecons = await db
    .select({
      kimId: kimEntryReconciliation.kimEntryId,
      ids: kimEntryReconciliation.linkedPaymentRequestIds,
    })
    .from(kimEntryReconciliation);
  for (const r of allRecons) {
    if (kimEntryIds.includes(r.kimId)) continue; // Same group, không cảnh báo
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
 * Save reconciliation: apply cùng status + linkedIds + note cho tất cả kimEntryIds.
 * Nếu group (BHXH): 3 rows Kim đều mark done chung.
 */
export async function saveReconciliation(opts: {
  kimEntryIds: number[];
  linkedIds: number[];
  status: "pending" | "done" | "needs_kim" | "orphan";
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };

  for (const kimId of opts.kimEntryIds) {
    await db
      .insert(kimEntryReconciliation)
      .values({
        kimEntryId: kimId,
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
  }

  revalidatePath("/admin/kim-breakdown");
  return { ok: true };
}

/**
 * Progress stats per TK.
 * 3383+3384+3386 GỘP thành "BHXH" slot (mỗi ngày trả = 1 group counted as 1).
 */
export async function getProgressStats(year: string): Promise<
  Array<{ tk: string; total: number; done: number; pending: number; sumTotal: number; sumDone: number }>
> {
  const nonBhxhTks = ["6411","6417","6421","6423","6425","6427","811","635","3334","3335","33311"];
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
    WHERE aj.debit_account IN ${sql`(${sql.join(nonBhxhTks.map(t => sql`${t}`), sql`, `)})`}
      AND aj.credit_account != '911'
      AND substr(aj.entry_date, 1, 4) = ${year}
    GROUP BY aj.debit_account
    ORDER BY aj.debit_account`);

  // BHXH slot: đếm theo group (entry_date + credit_account)
  const bhxhRows = await db.execute(sql`
    SELECT
      aj.entry_date,
      aj.credit_account,
      SUM(aj.amount)::float8 as amount,
      MIN(COALESCE(kr.status, 'pending')) as min_status,
      MAX(COALESCE(kr.status, 'pending')) as max_status
    FROM accounting_journal aj
    LEFT JOIN kim_entry_reconciliation kr ON kr.kim_entry_id = aj.id
    WHERE aj.debit_account IN ('3383','3384','3386')
      AND aj.credit_account != '911'
      AND substr(aj.entry_date, 1, 4) = ${year}
    GROUP BY aj.entry_date, aj.credit_account`);

  let bhxhTotal = 0, bhxhDone = 0, bhxhPending = 0, bhxhSumTotal = 0, bhxhSumDone = 0;
  for (const r of bhxhRows as any[]) {
    bhxhTotal++;
    bhxhSumTotal += Number(r.amount);
    // Group done = all rows trong group done (min_status = max_status = 'done')
    if (r.min_status === "done" && r.max_status === "done") {
      bhxhDone++;
      bhxhSumDone += Number(r.amount);
    } else {
      bhxhPending++;
    }
  }

  const stats = (rows as any[]).map((r) => ({
    tk: r.tk,
    total: Number(r.total),
    done: Number(r.done),
    pending: Number(r.pending),
    sumTotal: Number(r.sum_total || 0),
    sumDone: Number(r.sum_done || 0),
  }));

  if (bhxhTotal > 0) {
    stats.push({
      tk: "BHXH",
      total: bhxhTotal,
      done: bhxhDone,
      pending: bhxhPending,
      sumTotal: bhxhSumTotal,
      sumDone: bhxhSumDone,
    });
  }

  return stats.sort((a, b) => a.tk.localeCompare(b.tk));
}
