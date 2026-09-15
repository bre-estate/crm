/**
 * Nạp chân tiền cho báo cáo dòng tiền.
 * Năm có sổ NKC (kế toán đã giao): lấy từ accounting_journal, TK 11211 (bank) và 1111 (tiền mặt).
 * Năm chưa có sổ: chưa hỗ trợ, trả về available=false (làm sau: sao kê đã duyệt + sổ chi tiền mặt).
 * Dòng lương tách khối theo sao kê từng người (bank_transactions + employees + commission_policies).
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { buildCashPnl, buildCashMonthly, type CashLeg, type CashMonth, type CashPnl, type Period } from "./cash-pnl-core";
import { summarizeEmployeePay, buildPayrollIndex, type EmployeeLite, type EmployeePaySummary, type PayRow, type PayrollIndex, type PayrollLite } from "./employee-pay-core";
import { classifyBankRows, founderCashToLegs, type BankRowLite, type FounderCashRow, type ManagerBonusLite, type TaxPaymentLite } from "./bank-cash-core";
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

async function loadPayrollIndex(period: Period): Promise<PayrollIndex> {
  try {
    const rows = (await db.execute(sql`SELECT month, name, base_salary, allowances FROM payroll_months WHERE month >= to_char((${period.start}::date - interval '3 months'), 'YYYY-MM')`)) as unknown as Row[];
    const lite: PayrollLite[] = rows.map((r) => ({ month: String(r.month), name: String(r.name), baseSalary: num(r.base_salary), allowances: num(r.allowances) }));
    return buildPayrollIndex(lite);
  } catch { return new Map(); } // bảng chưa tạo
}

async function loadTaxPayments(): Promise<TaxPaymentLite[]> {
  try {
    const rows = (await db.execute(sql`SELECT paid_date, tax_type, amount FROM tax_payments`)) as unknown as Row[];
    return rows.map((r) => ({ paidDate: String(r.paid_date), taxType: String(r.tax_type), amount: num(r.amount) }));
  } catch { return []; }
}

/**
 * Thưởng quản lý và KPI đã đối chiếu, lấy từ cost_reconciliations (nhập từ Báo Cáo Doanh Thu).
 * Dùng để bóc phần thưởng ra khỏi lệnh chuyển tiền gộp "hoa hồng, thưởng và thu nhập khác".
 */
const BONUS_CAT: Record<string, ManagerBonusLite["category"]> = {
  kpi_ceo: "cty_thuong_ceo", kpi_tpkd: "cty_thuong_tpkd", kpi_admin: "cty_thuong_admin",
  bonus_manager: "cty_thuong_ql", cdt_bonus_manager: "cdt_thuong_ql",
};
async function loadManagerBonus(): Promise<ManagerBonusLite[]> {
  try {
    const rows = (await db.execute(sql`
      SELECT employee_name, substr(reconciliation_date::text, 1, 7) AS month, cost_type,
             sum(coalesce(amount_payable_this_time, 0))::float8 AS amount
      FROM cost_reconciliations
      WHERE cost_type IN ('kpi_ceo','kpi_tpkd','kpi_admin','bonus_manager','cdt_bonus_manager')
        AND employee_name IS NOT NULL AND coalesce(amount_payable_this_time, 0) > 0
      GROUP BY 1, 2, 3
    `)) as unknown as Row[];
    return rows.map((r) => ({
      employeeName: String(r.employee_name), month: String(r.month),
      category: BONUS_CAT[String(r.cost_type)] ?? "cty_thuong_ql", amount: num(r.amount),
    }));
  } catch { return []; }
}

async function loadCustomerNames(): Promise<string[]> {
  const rows = (await db.execute(sql`SELECT DISTINCT customer_name FROM products WHERE customer_name IS NOT NULL AND customer_name <> ''`)) as unknown as Row[];
  return rows.map((r) => String(r.customer_name));
}

export interface CashContext { employees: EmployeeLite[]; policies: CommissionPolicy[]; taxPayments: TaxPaymentLite[]; customerNames: string[]; payroll: PayrollIndex; managerBonus: ManagerBonusLite[] }

/** Nạp một lần các bảng tra cứu dùng chung, tránh bắn nhiều query song song qua pooler (bị statement timeout). */
export async function loadCashContext(period: Period): Promise<CashContext> {
  const { employees, policies } = await loadEmployeesAndPolicies();
  const taxPayments = await loadTaxPayments();
  const customerNames = await loadCustomerNames();
  const payroll = await loadPayrollIndex(period);
  const managerBonus = await loadManagerBonus();
  return { employees, policies, taxPayments, customerNames, payroll, managerBonus };
}

/** Tiền trả cho nhân sự trên sao kê trong kỳ, tách theo người và loại tiền. */
export async function loadEmployeePay(period: Period, ctx?: CashContext): Promise<EmployeePaySummary> {
  const c = ctx ?? (await loadCashContext(period));
  const rows = (await db.execute(sql`
      SELECT (transaction_date::date)::text AS date, partner_name, -debit_amount::float8 AS amount, description
      FROM bank_transactions
      WHERE debit_amount < 0 AND partner_name IS NOT NULL
        AND transaction_date::date BETWEEN (${period.start}::date - interval '3 months') AND ${period.end}::date
    `)) as unknown as Row[];
  // Lấy thêm 3 tháng trước kỳ chỉ để biết lương tháng gần nhất khi tách lệnh gộp.
  const payRows: PayRow[] = rows.map((r) => ({ date: String(r.date), partnerName: String(r.partner_name), amount: num(r.amount), description: String(r.description ?? "") }));
  return summarizeEmployeePay(payRows, c.employees, c.policies, period.start, c.payroll);
}

/** Năm chưa có sổ NKC: chân tiền bank từ sao kê đã phân loại (sửa tay ở bank-review được ưu tiên). */
export async function loadCashLegsFromBank(period: Period, ctx?: CashContext): Promise<CashLeg[]> {
  const c = ctx ?? (await loadCashContext(period));
  const rows = (await db.execute(sql`
      SELECT id, (transaction_date::date)::text AS date, partner_name, description,
             coalesce(credit_amount,0)::float8 AS credit,
             -- Dòng phí ngân hàng để tiền ở cột phí và thuế, cột nợ bằng 0.
             -(coalesce(debit_amount,0) + coalesce(fee_interest,0) + coalesce(vat,0))::float8 AS debit,
             category, category_source
      FROM bank_transactions
      WHERE transaction_date::date BETWEEN (${period.start}::date - interval '3 months') AND ${period.end}::date
    `)) as unknown as Row[];
  const bankRows: BankRowLite[] = rows.map((r) => ({
    id: Number(r.id), date: String(r.date), partnerName: r.partner_name == null ? null : String(r.partner_name), description: String(r.description ?? ""),
    credit: num(r.credit), debit: num(r.debit), category: r.category == null ? null : String(r.category), categorySource: r.category_source == null ? null : String(r.category_source),
  }));
  return classifyBankRows(bankRows, c, period.start);
}

/**
 * Sổ chi cá nhân của hai founder (bảng founder_spending, nguồn Drive 0.2.6).
 * Đây là tiền công ty đã tiêu nhưng không đi qua tài khoản công ty nên sao kê không thấy.
 * Bảng đã loại sẵn: tiền nộp vào tài khoản công ty, khoản công ty tự trả, và khoản chi từ doanh thu thứ cấp.
 */
export async function loadCashLegsFromFounders(period: Period): Promise<CashLeg[]> {
  // Vài ô "Ngày chi" trong file gõ sai năm hoặc sai tháng; lệch với cột Tháng thì tin cột Tháng.
  const ngay = sql`CASE WHEN spend_date IS NOT NULL AND to_char(spend_date, 'YYYY-MM') = month
                        THEN spend_date ELSE (month || '-01')::date END`;
  const rows = (await db.execute(sql`
    SELECT (${ngay})::text AS date, title, detail, category, coalesce(amount,0)::float8 AS amount
    FROM founder_spending
    WHERE is_company_spend AND (${ngay}) BETWEEN ${period.start}::date AND ${period.end}::date
  `)) as unknown as Row[];
  return rows.map((r) => ({
    date: String(r.date), channel: "cash" as const, direction: "out" as const, amount: num(r.amount),
    counterAccount: "", category: String(r.category) as CashLeg["category"],
    description: `${String(r.title ?? "")}${r.detail ? ` — ${String(r.detail)}` : ""}`.trim(),
  }));
}

/**
 * Tiền founder bỏ ra trong kỳ mà sổ kế toán KHÔNG ghi.
 * Dùng cho bản dồn tích: bản đó bám sổ Kim để còn đối chiếu, nên phải nói rõ còn thiếu bao nhiêu.
 */
export async function loadFounderSpendOutsideBooks(period: Period): Promise<number> {
  const ngay = sql`CASE WHEN spend_date IS NOT NULL AND to_char(spend_date, 'YYYY-MM') = month
                        THEN spend_date ELSE (month || '-01')::date END`;
  const r = (await db.execute(sql`
    SELECT coalesce(sum(amount), 0)::float8 AS n FROM founder_spending
    WHERE is_company_spend AND (${ngay}) BETWEEN ${period.start}::date AND ${period.end}::date
  `)) as unknown as Row[];
  return num(r[0]?.n);
}

/** Chân tiền cho kỳ: sổ NKC nếu kế toán đã giao, không thì sao kê; sổ chi cá nhân founder luôn được cộng thêm. */
export async function loadCashLegs(period: Period, ctx?: CashContext): Promise<{ legs: CashLeg[]; source: CashSource }> {
  const founders = await loadCashLegsFromFounders(period);
  const journal = await loadCashLegsFromJournal(period);
  if (journal.length > 0) return { legs: [...journal, ...founders], source: "nkc" };
  const bank = await loadCashLegsFromBank(period, ctx);
  const legs = [...bank, ...founders];
  return { legs, source: legs.length > 0 ? "bank" : "none" };
}

/** Số dư sao kê đầu và cuối kỳ (theo thứ tự dòng trên sao kê), và tiền đang gửi tiết kiệm có kỳ hạn trong kỳ. */
export interface BankBalance { openDate: string; open: number; closeDate: string; close: number; tietKiemRong: number; tietKiemDate: string | null }

export async function loadBankBalance(period: Period): Promise<BankBalance | null> {
  const rows = (await db.execute(sql`
    WITH k AS (
      SELECT (transaction_date::date)::text AS date, statement_seq, coalesce(running_balance,0)::float8 AS bal,
             coalesce(credit_amount,0)::float8 AS cr,
             (coalesce(debit_amount,0) + coalesce(fee_interest,0) + coalesce(vat,0))::float8 AS dr, description
      FROM bank_transactions
      WHERE transaction_date::date BETWEEN ${period.start}::date AND ${period.end}::date AND statement_seq IS NOT NULL
    )
    SELECT
      (SELECT date FROM k ORDER BY statement_seq ASC LIMIT 1) AS open_date,
      (SELECT bal - cr - dr FROM k ORDER BY statement_seq ASC LIMIT 1) AS open_bal,
      (SELECT date FROM k ORDER BY statement_seq DESC LIMIT 1) AS close_date,
      (SELECT bal FROM k ORDER BY statement_seq DESC LIMIT 1) AS close_bal,
      (SELECT coalesce(sum(-dr - cr), 0) FROM k WHERE upper(description) ~ 'TERM DEPOSIT|TIET KIEM') AS tiet_kiem,
      (SELECT max(date) FROM k WHERE upper(description) ~ 'TERM DEPOSIT|TIET KIEM') AS tiet_kiem_date
  `)) as unknown as Row[];
  const r = rows[0];
  if (!r || r.open_date == null) return null;
  return {
    openDate: String(r.open_date), open: num(r.open_bal), closeDate: String(r.close_date), close: num(r.close_bal),
    tietKiemRong: num(r.tiet_kiem), tietKiemDate: r.tiet_kiem_date == null ? null : String(r.tiet_kiem_date),
  };
}

/** Số căn có đối chiếu doanh thu trong kỳ, để quy hòa vốn ra số căn. */
export async function loadUnitsInPeriod(period: Period): Promise<number> {
  const r = (await db.execute(sql`SELECT count(DISTINCT product_id)::int AS n FROM revenue_reconciliations WHERE reconciliation_date BETWEEN ${period.start} AND ${period.end}`)) as unknown as Row[];
  return num(r[0]?.n);
}

export async function loadCashPnl(period: Period): Promise<{ pnl: CashPnl; monthly: CashMonth[]; pay: EmployeePaySummary; units: number; source: CashSource; dataThrough: string | null; bankBalance: BankBalance | null }> {
  // Chạy tuần tự: pooler Supabase hủy câu lệnh khi quá nhiều query song song.
  const ctx = await loadCashContext(period);
  const { legs, source } = await loadCashLegs(period, ctx);
  const pay = await loadEmployeePay(period, ctx);
  const units = await loadUnitsInPeriod(period);
  const bankBalance = source === "bank" ? await loadBankBalance(period) : null;
  const split = { kinhDoanh: pay.salaryByGroup.kinh_doanh, quanLy: pay.salaryByGroup.quan_ly };
  const pnl = buildCashPnl(legs, period, legs.length > 0, split);
  const dataThrough = legs.reduce<string | null>((m, l) => (l.date >= period.start && l.date <= period.end && (!m || l.date > m) ? l.date : m), null);
  return { pnl, monthly: buildCashMonthly(legs, period, split), pay, units, source, dataThrough, bankBalance };
}
