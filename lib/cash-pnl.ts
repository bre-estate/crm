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
import { classifyBankRows, founderCashToLegs, type BankRowLite, type FounderCashRow } from "./bank-cash-core";
import type { CommissionPolicy } from "./commission-policy";

export * from "./cash-pnl-core";
export * from "./employee-pay-core";
export * from "./bank-cash-core";

export type CashSource = "nkc" | "bank" | "none";

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

async function loadEmployeesAndPolicies(): Promise<{ employees: EmployeeLite[]; policies: CommissionPolicy[] }> {
  const [emps, pols] = await Promise.all([
    db.execute(sql`SELECT id, name, position, note FROM employees`) as unknown as Promise<Row[]>,
    db.execute(sql`SELECT * FROM commission_policies`) as unknown as Promise<Row[]>,
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
  return { employees, policies };
}

/** Tiền trả cho nhân sự trên sao kê trong kỳ, tách theo người và loại tiền. */
export async function loadEmployeePay(period: Period): Promise<EmployeePaySummary> {
  const [{ employees, policies }, rows] = await Promise.all([
    loadEmployeesAndPolicies(),
    db.execute(sql`
      SELECT (transaction_date::date)::text AS date, partner_name, -debit_amount::float8 AS amount, description
      FROM bank_transactions
      WHERE debit_amount < 0 AND partner_name IS NOT NULL
        AND transaction_date::date BETWEEN (${period.start}::date - interval '3 months') AND ${period.end}::date
    `) as unknown as Promise<Row[]>,
  ]);
  // Lấy thêm 3 tháng trước kỳ chỉ để biết lương tháng gần nhất khi tách lệnh gộp.
  const payRows: PayRow[] = rows.map((r) => ({ date: String(r.date), partnerName: String(r.partner_name), amount: num(r.amount), description: String(r.description ?? "") }));
  return summarizeEmployeePay(payRows, employees, policies, period.start);
}

/** Năm chưa có sổ NKC: chân tiền bank từ sao kê đã phân loại (sửa tay ở bank-review được ưu tiên). */
export async function loadCashLegsFromBank(period: Period): Promise<CashLeg[]> {
  const [{ employees, policies }, rows] = await Promise.all([
    loadEmployeesAndPolicies(),
    db.execute(sql`
      SELECT id, (transaction_date::date)::text AS date, partner_name, description,
             coalesce(credit_amount,0)::float8 AS credit, -coalesce(debit_amount,0)::float8 AS debit, category, category_source
      FROM bank_transactions
      WHERE transaction_date::date BETWEEN (${period.start}::date - interval '3 months') AND ${period.end}::date
    `) as unknown as Promise<Row[]>,
  ]);
  const bankRows: BankRowLite[] = rows.map((r) => ({
    id: Number(r.id), date: String(r.date), partnerName: r.partner_name == null ? null : String(r.partner_name), description: String(r.description ?? ""),
    credit: num(r.credit), debit: num(r.debit), category: r.category == null ? null : String(r.category), categorySource: r.category_source == null ? null : String(r.category_source),
  }));
  return classifyBankRows(bankRows, { employees, policies }, period.start);
}

/** Sổ chi tiền mặt founder (financial_transactions merged-*), coi như két tiền mặt công ty giống cách kế toán ghi TK 1111. */
export async function loadCashLegsFromFounders(period: Period): Promise<CashLeg[]> {
  const rows = (await db.execute(sql`
    SELECT transaction_date::text AS date, description, coalesce(amount,0)::float8 AS amount, management_group, direction
    FROM financial_transactions
    WHERE source_file LIKE 'merged%' AND transaction_date BETWEEN ${period.start} AND ${period.end}
  `)) as unknown as Row[];
  const fr: FounderCashRow[] = rows.map((r) => ({ date: String(r.date), description: String(r.description ?? ""), amount: num(r.amount), managementGroup: r.management_group == null ? null : String(r.management_group), direction: String(r.direction) === "in" ? "in" : "out" }));
  return founderCashToLegs(fr);
}

/** Chân tiền cho kỳ: có sổ NKC thì dùng sổ, không thì sao kê + tiền mặt founder. */
export async function loadCashLegs(period: Period): Promise<{ legs: CashLeg[]; source: CashSource }> {
  const journal = await loadCashLegsFromJournal(period);
  if (journal.length > 0) return { legs: journal, source: "nkc" };
  const [bank, founders] = await Promise.all([loadCashLegsFromBank(period), loadCashLegsFromFounders(period)]);
  const legs = [...bank, ...founders];
  return { legs, source: legs.length > 0 ? "bank" : "none" };
}

/** Số căn có đối chiếu doanh thu trong kỳ, để quy hòa vốn ra số căn. */
export async function loadUnitsInPeriod(period: Period): Promise<number> {
  const r = (await db.execute(sql`SELECT count(DISTINCT product_id)::int AS n FROM revenue_reconciliations WHERE reconciliation_date BETWEEN ${period.start} AND ${period.end}`)) as unknown as Row[];
  return num(r[0]?.n);
}

export async function loadCashPnl(period: Period): Promise<{ pnl: CashPnl; monthly: CashMonth[]; pay: EmployeePaySummary; units: number; source: CashSource }> {
  const [{ legs, source }, pay, units] = await Promise.all([loadCashLegs(period), loadEmployeePay(period), loadUnitsInPeriod(period)]);
  const split = { kinhDoanh: pay.salaryByGroup.kinh_doanh, quanLy: pay.salaryByGroup.quan_ly };
  const pnl = buildCashPnl(legs, period, legs.length > 0, split);
  return { pnl, monthly: buildCashMonthly(legs, period, split), pay, units, source };
}
