/**
 * Nạp chân tiền cho báo cáo dòng tiền.
 * Năm có sổ NKC (kế toán đã giao): lấy từ accounting_journal, TK 11211 (bank) và 1111 (tiền mặt).
 * Năm chưa có sổ: chưa hỗ trợ, trả về available=false (làm sau: sao kê đã duyệt + sổ chi tiền mặt).
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { buildCashPnl, type CashLeg, type CashPnl, type Period } from "./cash-pnl-core";

export * from "./cash-pnl-core";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));

const BANK = ["11211", "112"];
const CASH = ["1111", "111"];

export async function loadCashLegsFromJournal(period: Period): Promise<CashLeg[]> {
  const rows = (await db.execute(sql`
    SELECT entry_date AS date, debit_account, credit_account, coalesce(amount,0)::float8 AS amount, description
    FROM accounting_journal
    WHERE entry_date BETWEEN ${period.start} AND ${period.end}
      AND (debit_account IN ('11211','112','1111','111') OR credit_account IN ('11211','112','1111','111'))
  `)) as unknown as Row[];

  const legs: CashLeg[] = [];
  for (const r of rows) {
    const dr = String(r.debit_account), cr = String(r.credit_account);
    const amount = num(r.amount);
    if (!amount) continue;
    const base = { date: String(r.date), amount, description: String(r.description ?? "") };
    // Chuyển giữa bank và tiền mặt: ghi cả hai chân để tổng từng kênh đúng, phân loại ra chuyen_noi_bo.
    if (BANK.includes(dr) || CASH.includes(dr)) {
      legs.push({ ...base, channel: BANK.includes(dr) ? "bank" : "cash", direction: "in", counterAccount: cr });
    }
    if (BANK.includes(cr) || CASH.includes(cr)) {
      legs.push({ ...base, channel: BANK.includes(cr) ? "bank" : "cash", direction: "out", counterAccount: dr });
    }
  }
  return legs;
}

export async function loadCashPnl(period: Period): Promise<CashPnl> {
  const legs = await loadCashLegsFromJournal(period);
  return buildCashPnl(legs, period, legs.length > 0);
}
