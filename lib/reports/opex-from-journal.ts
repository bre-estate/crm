/**
 * OPEX rows từ accounting_journal (Kim NKC — SOURCE OF TRUTH cho OPEX).
 * Thay thế logic query cũ trong /reports/management (financial_transactions).
 *
 * Kim NKC là accrual-based (TT200): mỗi tháng ghi Nợ [TK OPEX] / Có [TK nguồn].
 * → Query debit_account IN (opex codes), loại bút toán closing (Có = 911).
 */

import { db } from "@/lib/db";
import { accountingJournal } from "@/lib/schema";
import { sql, inArray, and, ne, eq } from "drizzle-orm";

export type OpexRow = {
  month: string; // "YYYY-MM"
  code: string; // TK code (6411, 6421...)
  group: string; // TK label
  sum: number;
  n: number;
};

// TK code → label hiển thị. GỘP 6411 + 6421 → "Lương nhân sự" vì Kim ghi
// không nhất quán (T1-T8 gộp NVKD vào 6421, T9-T12 mới tách 6411 riêng).
// Tổng OPEX không đổi, chỉ display gộp cho breakdown đọc được.
export const TK_LABELS: Record<string, string> = {
  "6411": "Lương nhân sự",
  "6421": "Lương nhân sự", // Gộp cùng 6411
  "6417": "HH sale + marketing",
  "6423": "Đồ dùng VP",
  "6425": "Thuế phí lệ phí",
  "6427": "Thuê VP + dịch vụ",
  "811": "Chi phí khác",
  "635": "Chi phí tài chính",
  "BHXH": "BHXH gộp (3383+3384+3386)",
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
 *
 * SPECIAL: Marketing được tách khỏi 6417 (6417 chứa cả HH sale). Query riêng
 * các 6417 rows có description "quảng cáo/marketing/batdongsan/sự kiện/PR"
 * → gán code=MKT, label="Marketing", tránh double count HH sale.
 */
export async function fetchOpexFromJournal(
  codes: string[],
  yearFilter?: string,
): Promise<OpexRow[]> {
  const conds = [
    inArray(accountingJournal.debitAccount, codes),
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

// Query doanh thu Kim NKC (Có 5113) per month.
export async function fetchRevenueFromJournal(yearFilter?: string): Promise<Map<string, number>> {
  const conds = [
    eq(accountingJournal.creditAccount, "5113"),
    ne(accountingJournal.debitAccount, "911"),
  ];
  if (yearFilter) {
    conds.push(sql`substr(${accountingJournal.entryDate}, 1, 4) = ${yearFilter}`);
  }
  const rows = await db
    .select({
      month: sql<string>`substr(${accountingJournal.entryDate}, 1, 7)`,
      sum: sql<number>`sum(${accountingJournal.amount})::float8`,
    })
    .from(accountingJournal)
    .where(and(...conds))
    .groupBy(sql`substr(${accountingJournal.entryDate}, 1, 7)`);
  return new Map(rows.map((r) => [r.month, Number(r.sum)]));
}

// Query giá vốn Kim NKC (Nợ 6417 — HH sale + Marketing) per month.
export async function fetchCogsFromJournal(yearFilter?: string): Promise<Map<string, number>> {
  const conds = [
    eq(accountingJournal.debitAccount, "6417"),
    ne(accountingJournal.creditAccount, "911"),
  ];
  if (yearFilter) {
    conds.push(sql`substr(${accountingJournal.entryDate}, 1, 4) = ${yearFilter}`);
  }
  const rows = await db
    .select({
      month: sql<string>`substr(${accountingJournal.entryDate}, 1, 7)`,
      sum: sql<number>`sum(${accountingJournal.amount})::float8`,
    })
    .from(accountingJournal)
    .where(and(...conds))
    .groupBy(sql`substr(${accountingJournal.entryDate}, 1, 7)`);
  return new Map(rows.map((r) => [r.month, Number(r.sum)]));
}

// Query Thuế TNDN (Nợ 8211) per month.
export async function fetchIncomeTaxFromJournal(yearFilter?: string): Promise<Map<string, number>> {
  const conds = [
    eq(accountingJournal.debitAccount, "8211"),
    ne(accountingJournal.creditAccount, "911"),
  ];
  if (yearFilter) {
    conds.push(sql`substr(${accountingJournal.entryDate}, 1, 4) = ${yearFilter}`);
  }
  const rows = await db
    .select({
      month: sql<string>`substr(${accountingJournal.entryDate}, 1, 7)`,
      sum: sql<number>`sum(${accountingJournal.amount})::float8`,
    })
    .from(accountingJournal)
    .where(and(...conds))
    .groupBy(sql`substr(${accountingJournal.entryDate}, 1, 7)`);
  return new Map(rows.map((r) => [r.month, Number(r.sum)]));
}
