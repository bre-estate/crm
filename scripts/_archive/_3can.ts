import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import XLSX from "xlsx";
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: any) => Math.round(Number(n)).toLocaleString("vi-VN");
async function main() {
  const wb = XLSX.readFile("data-excel/BAO CAO DOANH THU.xlsx");
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets["2.3_Gia von"], { header: 1, raw: false });

  for (const unit of ["B.06.07", "B.12.20", "B-31-12"]) {
    console.log(`\n═══ ${unit} — Excel rows ═══`);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      if (String(r[4]||'').trim() === unit) {
        const col40 = r[40] ?? '';
        const col41 = r[41] ?? '';
        const col42 = r[42] ?? '';
        if (col40 || col41 || col42) {
          console.log(`  [row ${i+1}] date=${r[1]} · person=${r[2]} · cost=${r[15]?String(r[15]).slice(0,10):''} · col40(TT)=${col40} · col41(công thức)=${col41} · col42(chênh)=${col42}`);
        }
      }
    }
    console.log(`\n═══ ${unit} — DB cost_recons ═══`);
    const cr = await sql`SELECT id, reconciliation_date, employee_name, cost_type, amount_payable_this_time FROM cost_reconciliations WHERE product_id=(SELECT id FROM products WHERE unit_code=${unit}) ORDER BY reconciliation_date`;
    for (const r of cr) console.log(`  cr#${r.id} · ${r.reconciliation_date} · ${(r.employee_name||'').padEnd(24)} · ${r.cost_type?.padEnd(18)} · ${fmt(r.amount_payable_this_time)}`);
  }
  await sql.end();
}
main();
