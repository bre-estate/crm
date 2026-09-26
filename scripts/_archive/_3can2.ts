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
    console.log(`\n═══ ${unit} ═══`);
    const [p] = await sql`SELECT id FROM products WHERE unit_code=${unit}`;
    if (!p) continue;
    const cr = await sql`SELECT id, reconciliation_date, employee_name, amount_payable_this_time FROM cost_reconciliations WHERE product_id=${p.id} ORDER BY reconciliation_date`;
    const dbMap = new Map<string, { id: number; person: string; amt: number }[]>();
    for (const r of cr) {
      const k = r.reconciliation_date;
      if (!dbMap.has(k)) dbMap.set(k, []);
      dbMap.get(k)!.push({ id: r.id, person: String(r.employee_name), amt: Number(r.amount_payable_this_time) });
    }

    // Match Excel rows against DB rows and find 1đ diff
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      if (String(r[4]||'').trim() !== unit) continue;
      const col40 = Number(String(r[40] || '0').replace(/[,\s]/g, '')) || 0;
      const col41Raw = String(r[41] || '').replace(/[,\s]/g, '');
      const col41 = col41Raw ? Number(col41Raw) : null;
      const col42 = String(r[42] || '').trim();
      if (col40 === 0) continue;
      const person = String(r[2] || '').trim();
      const date = String(r[1] || '');
      // Excel date to YYYY-MM-DD
      const m = date.match(/^(\d+)\/(\d+)\/(\d+)/);
      let dbDate = '';
      if (m) {
        const [_, mm, dd, yyyy] = m;
        dbDate = `${yyyy.padStart(4,'0')}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
      }
      // Find matching db row
      const candidates = dbMap.get(dbDate) || [];
      const dbRow = candidates.find(c => c.person.trim().toLowerCase() === person.trim().toLowerCase() && Math.abs(c.amt - col40) < 100);
      if (dbRow && dbRow.amt !== col40) {
        console.log(`  ⚠️ CHÊNH: [Excel row ${i+1}] ${dbDate} · ${person} · col40=${fmt(col40)} · col41=${col41!==null?fmt(col41):''} · col42=${col42}`);
        console.log(`    → DB cr#${dbRow.id} = ${fmt(dbRow.amt)} (chênh ${dbRow.amt - col40})`);
      }
    }
  }
  await sql.end();
}
main();
