import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: any) => Math.round(Number(n)).toLocaleString("vi-VN");

async function main() {
  // Kim's 4 CTV payments
  const kimPayments = [
    { date: "2025-10-06", amount: 53143170, forMonth: "2025-09" },
    { date: "2025-11-05", amount: 52724776, forMonth: "2025-10" },
    { date: "2025-11-19", amount: 24637500, forMonth: "2025-11", note: "tạm ứng lương + KPI" },
    { date: "2025-12-05", amount: 45984915, forMonth: "2025-11" },
  ];

  // Q1: Căn chốt trong tháng đó là gì?
  for (const p of kimPayments) {
    console.log(`\n═══ Kim ${p.date} ${fmt(p.amount)} = "thu lao CTV ${p.forMonth.slice(5)}" ═══`);
    console.log(`Products (căn chốt) trong ${p.forMonth}:`);
    const prods = await sql`
      SELECT id, project_name, unit_code, deposit_date, deal_price, sales
      FROM products
      WHERE substr(deposit_date, 1, 7) = ${p.forMonth}
      ORDER BY deposit_date`;
    for (const pr of prods) console.log(`  #${pr.id} · ${pr.deposit_date} · ${(pr.project_name||'').slice(0,20).padEnd(20)} · ${pr.unit_code} · sale=${pr.sales || 'N/A'}`);

    // Cost_reconciliations (HH sale phải trả) tương ứng
    console.log(`Cost recon amountPayableThisTime T${p.forMonth.slice(5)}:`);
    const cr = await sql`
      SELECT reconciliation_date, cost_type, recipient, amount_payable_this_time
      FROM cost_reconciliations
      WHERE substr(reconciliation_date, 1, 7) = ${p.forMonth}
        AND amount_payable_this_time > 0
      ORDER BY amount_payable_this_time DESC`;
    let sumCR = 0;
    for (const c of cr) { console.log(`  ${c.reconciliation_date} · ${c.cost_type?.padEnd(15)} · ${(c.recipient||'').slice(0,30).padEnd(30)} · ${fmt(c.amount_payable_this_time)}`); sumCR += Number(c.amount_payable_this_time); }
    console.log(`  → sum cost_recon ${p.forMonth}: ${fmt(sumCR)}`);
  }

  // Q2: Nhân viên nào recipient trong 4 tháng T9-T12? Nếu tất cả trong CRM đều là NVKD cty (Bách/Thành/Nhật/Linh), thì "CTV" ngoài phải có ai khác.
  console.log(`\n═══ Recipient trong cost_reconciliations T9-T12 ═══`);
  const recips = await sql`
    SELECT recipient, cost_type, COUNT(*) as c, SUM(amount_payable_this_time)::float8 as s
    FROM cost_reconciliations
    WHERE substr(reconciliation_date, 1, 7) IN ('2025-09', '2025-10', '2025-11', '2025-12')
      AND amount_payable_this_time > 0
    GROUP BY recipient, cost_type
    ORDER BY s DESC`;
  for (const r of recips) console.log(`  ${(r.recipient||'').padEnd(35)} · ${r.cost_type?.padEnd(15)} · ${r.c} lần · ${fmt(r.s)}`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
