/**
 * OPEX rows từ accounting_journal (Kim NKC — SOURCE OF TRUTH cho OPEX).
 * Thay thế logic query cũ trong /reports/management (financial_transactions).
 *
 * Kim NKC là accrual-based (TT200): mỗi tháng ghi Nợ [TK OPEX] / Có [TK nguồn].
 * → Query debit_account IN (opex codes), loại bút toán closing (Có = 911).
 */

import { db } from "@/lib/db";
import { accountingJournal } from "@/lib/schema";
import { sql, inArray, and, ne, notLike } from "drizzle-orm";

export type OpexRow = {
  month: string; // "YYYY-MM"
  code: string; // TK code (6411, 6421...)
  group: string; // TK label
  sum: number;
  n: number;
};

// TK code → label hiển thị (nhóm quản trị)
export const TK_LABELS: Record<string, string> = {
  "6411": "Lương NVKD",
  "6417": "HH sale + marketing",
  "6421": "Lương admin + kế toán",
  "6423": "Đồ dùng VP",
  "6425": "Thuế phí lệ phí",
  "6427": "Thuê VP + dịch vụ",
  "811": "Chi phí khác",
  "635": "Chi phí tài chính",
  "BHXH": "BHXH gộp (3383+3384+3386)", // Composite: 3 TK cùng ngày trả bank = 1 row
  "3383": "BHXH cty đóng",
  "3384": "BHYT cty đóng",
  "3386": "BHTN cty đóng",
  "3334": "Thuế TNDN",
  "3335": "Thuế TNCN nộp thay",
  "33311": "Thuế GTGT",
};

export function tkLabel(code: string): string {
  return TK_LABELS[code] ?? `TK ${code}`;
}

/**
 * Query OPEX rows từ Kim NKC.
 * @param codes TK codes cần lấy (VD OPEX_MGMT_CATEGORIES)
 * @param yearFilter Optional: chỉ lấy năm nhất định (VD "2025")
 */
export async function fetchOpexFromJournal(
  codes: string[],
  yearFilter?: string,
): Promise<OpexRow[]> {
  const conds = [
    inArray(accountingJournal.debitAccount, codes),
    // Bỏ bút toán đóng sổ cuối năm (Nợ TK / Có 911)
    ne(accountingJournal.creditAccount, "911"),
  ];
  if (yearFilter) {
    conds.push(sql`substr(${accountingJournal.entryDate}, 1, 4) = ${yearFilter}`);
  }

  const rows = await db
    .select({
      month: sql<string>`substr(${accountingJournal.entryDate}, 1, 7)`,
      code: accountingJournal.debitAccount,
      sum: sql<number>`sum(${accountingJournal.amount})::float8`,
      n: sql<number>`count(*)::int`,
    })
    .from(accountingJournal)
    .where(and(...conds))
    .groupBy(
      sql`substr(${accountingJournal.entryDate}, 1, 7)`,
      accountingJournal.debitAccount,
    );

  return rows.map((r) => ({
    month: r.month,
    code: r.code,
    group: tkLabel(r.code),
    sum: Number(r.sum),
    n: r.n,
  }));
}
