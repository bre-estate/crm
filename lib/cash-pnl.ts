/**
 * Nạp chân tiền cho báo cáo dòng tiền.
 * Năm có sổ NKC (kế toán đã giao): lấy từ accounting_journal, TK 11211 (bank) và 1111 (tiền mặt).
 * Năm chưa có sổ: chưa hỗ trợ, trả về available=false (làm sau: sao kê đã duyệt + sổ chi tiền mặt).
 * Dòng lương tách khối theo sao kê từng người (bank_transactions + employees + commission_policies).
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { buildCashPnl, buildCashMonthly, type CashLeg, type CashMonth, type CashPnl, type Period } from "./cash-pnl-core";
import { summarizeEmployeePay, type EmployeeLite, type EmployeePaySummary, type PayRow } from "./employee-pay-core";
import type { CommissionPolicy } from "./commission-policy";

export * from "./cash-pnl-core";
export * from "./employee-pay-core";

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

/** Tiền trả cho nhân sự trên sao kê trong kỳ, tách theo người và loại tiền. */
export async function loadEmployeePay(period: Period): Promise<EmployeePaySummary> {
  const [emps, pols, rows] = await Promise.all([
    db.execute(sql`SELECT id, name, position, note FROM employees`) as unknown as Promise<Row[]>,
    db.execute(sql`SELECT * FROM commission_policies`) as unknown as Promise<Row[]>,
    db.execute(sql`
      SELECT (transaction_date::date)::text AS date, partner_name, -debit_amount::float8 AS amount, description
      FROM bank_transactions
      WHERE debit_amount < 0 AND partner_name IS NOT NULL
        AND transaction_date::date BETWEEN ${period.start}::date AND ${period.end}::date
    `) as unknown as Promise<Row[]>,
  ]);
  const employees: EmployeeLite[] = emps.map((e) => ({ id: Number(e.id), name: String(e.name), position: String(e.position), note: e.note == null ? null : String(e.note) }));
  const policies = pols.map((p) => ({
    id: Number(p.id), role: String(p.role), effectiveFrom: String(p.effective_from), effectiveTo: p.effective_to == null ? null : String(p.effective_to),
    cycleMonths: num(p.cycle_months), baseRate: p.base_rate as number | null, tiers: p.tiers as CommissionPolicy["tiers"],
    baseSalary: p.base_salary as number | null, probationSalary: p.probation_salary as number | null, apprenticeSalary: p.apprentice_salary as number | null,
    bonusFloor: p.bonus_floor as number | null, bonusStep: p.bonus_step as number | null, bonusStepAmount: p.bonus_step_amount as number | null,
    bonusCycleMultiplier: p.bonus_cycle_multiplier as number | null, bonusCapPerCycle: p.bonus_cap_per_cycle as number | null,
    managerBonusTiers: p.manager_bonus_tiers as CommissionPolicy["managerBonusTiers"], managerSalaryTiers: p.manager_salary_tiers as CommissionPolicy["managerSalaryTiers"],
    managerProbationSalary: p.manager_probation_salary as number | null, note: p.note == null ? null : String(p.note),
  })) as CommissionPolicy[];
  const payRows: PayRow[] = rows.map((r) => ({ date: String(r.date), partnerName: String(r.partner_name), amount: num(r.amount), description: String(r.description ?? "") }));
  return summarizeEmployeePay(payRows, employees, policies);
}

export async function loadCashPnl(period: Period): Promise<{ pnl: CashPnl; monthly: CashMonth[]; pay: EmployeePaySummary }> {
  const [legs, pay] = await Promise.all([loadCashLegsFromJournal(period), loadEmployeePay(period)]);
  const split = { kinhDoanh: pay.salaryByGroup.kinh_doanh, quanLy: pay.salaryByGroup.quan_ly };
  const pnl = buildCashPnl(legs, period, legs.length > 0, split);
  return { pnl, monthly: buildCashMonthly(legs, period, split), pay };
}
