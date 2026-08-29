/**
 * Bước 2: so sánh GIÁ TRỊ DT giữa Excel và App cho các căn có số lượng bằng nhau.
 * Match từng dòng theo (số BB / ngày ĐC), fallback amount.
 * Flag khi lệch > 1000 VND.
 */
import dotenv from "dotenv";
import postgres from "postgres";
import XLSX from "xlsx";

dotenv.config({ path: "/Users/trietnguyen/Documents/Company/BRE/App/CRM/.env.local" });
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const EXCEL_PATH = "/Users/trietnguyen/Documents/Company/BRE/App/CRM/data-excel/BAO CAO DOANH THU.xlsx";

function toDateStr(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 2020 || y > 2035) return null;
  return d.toISOString().slice(0, 10);
}

function normBB(v) {
  if (!v) return null;
  return String(v).trim().toLowerCase().replace(/\s+/g, "");
}

async function main() {
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.2_Doanh thu"], { header: 1, raw: true, defval: null });
  const excelPer = new Map();
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const code = r[6] ? String(r[6]).trim() : null;
    const amount = Number(r[26] ?? 0);
    if (!code || !amount || Math.abs(amount) < 0.5) continue;
    const cur = excelPer.get(code) || [];
    cur.push({
      excelRow: i + 1,
      date: toDateStr(r[1]),
      soBB: r[2] ? String(r[2]).trim() : null,
      dot: r[17] ? String(r[17]).trim() : null,
      amount,
    });
    excelPer.set(code, cur);
  }

  const dbRev = await sql`
    SELECT p.product_code, rr.id, rr.reconciliation_date, rr.minutes_number,
           rr.total_receivable_this_time AS amount
    FROM revenue_reconciliations rr JOIN products p ON p.id = rr.product_id
  `;
  const dbPer = new Map();
  for (const r of dbRev) {
    const cur = dbPer.get(r.product_code) || [];
    cur.push(r);
    dbPer.set(r.product_code, cur);
  }

  const discrepancies = [];
  const matched = { total: 0, exact: 0 };

  for (const [code, exList] of excelPer.entries()) {
    const dbList = dbPer.get(code) || [];
    // Bỏ qua căn có SL LỆCH — chỉ xử lý căn SL bằng nhau
    if (exList.length !== dbList.length) continue;

    const dbUsed = new Set();
    const pairs = [];

    // Round 1: match theo soBB
    for (const ex of exList) {
      if (!ex.soBB) continue;
      const nx = normBB(ex.soBB);
      const match = dbList.find(
        (d) => !dbUsed.has(d.id) && d.minutes_number && normBB(d.minutes_number) === nx,
      );
      if (match) {
        dbUsed.add(match.id);
        pairs.push({ ex, db: match, matchedBy: "soBB" });
      }
    }
    // Round 2: match theo date (cho các row chưa match)
    for (const ex of exList) {
      if (pairs.find((p) => p.ex === ex)) continue;
      if (!ex.date) continue;
      const match = dbList.find(
        (d) => !dbUsed.has(d.id) && d.reconciliation_date && String(d.reconciliation_date) === ex.date,
      );
      if (match) {
        dbUsed.add(match.id);
        pairs.push({ ex, db: match, matchedBy: "date" });
      }
    }
    // Round 3: match theo amount (fallback)
    for (const ex of exList) {
      if (pairs.find((p) => p.ex === ex)) continue;
      const match = dbList.find(
        (d) => !dbUsed.has(d.id) && Math.abs(Number(d.amount) - ex.amount) < 1000,
      );
      if (match) {
        dbUsed.add(match.id);
        pairs.push({ ex, db: match, matchedBy: "amount" });
      }
    }
    // Round 4: remaining unpaired — pair theo order
    const exUnpaired = exList.filter((ex) => !pairs.find((p) => p.ex === ex));
    const dbUnpaired = dbList.filter((d) => !dbUsed.has(d.id));
    for (let i = 0; i < Math.min(exUnpaired.length, dbUnpaired.length); i++) {
      pairs.push({ ex: exUnpaired[i], db: dbUnpaired[i], matchedBy: "order" });
    }

    // So sánh amount cho từng pair
    for (const p of pairs) {
      matched.total++;
      const diff = p.ex.amount - Number(p.db.amount);
      if (Math.abs(diff) < 1000) {
        matched.exact++;
        continue;
      }
      discrepancies.push({
        code,
        excelRow: p.ex.excelRow,
        appId: p.db.id,
        excelDate: p.ex.date,
        appDate: p.db.reconciliation_date,
        excelBB: p.ex.soBB,
        appBB: p.db.minutes_number,
        excelAmount: p.ex.amount,
        appAmount: Number(p.db.amount),
        diff,
        matchedBy: p.matchedBy,
      });
    }
  }

  discrepancies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log(`\n=== BƯỚC 2: SO GIÁ TRỊ DT (${matched.total} dòng đã match) ===`);
  console.log(`  Khớp: ${matched.exact}/${matched.total}`);
  console.log(`  Lệch >1.000 VND: ${discrepancies.length}\n`);

  if (discrepancies.length > 0) {
    console.log("# | Căn                        | ExRow | AppID | Ngày Excel | Ngày App   | BB (Excel≟App)                    | Amount Excel   | Amount App    | Chênh          | Match by");
    console.log("-".repeat(180));
    discrepancies.forEach((d, i) => {
      const bbMatch = normBB(d.excelBB) === normBB(d.appBB) ? "✓" : "✗";
      console.log(
        `${String(i + 1).padStart(2)} | ${d.code.padEnd(26)} | ${String(d.excelRow).padStart(5)} | ${String(d.appId).padStart(5)} | ${(d.excelDate || "--").padEnd(10)} | ${(d.appDate || "--").padEnd(10)} | ${bbMatch} ${(d.excelBB || "").slice(0, 30).padEnd(30)} | ${d.excelAmount.toLocaleString("vi-VN").padStart(14)} | ${d.appAmount.toLocaleString("vi-VN").padStart(13)} | ${d.diff.toLocaleString("vi-VN").padStart(14)} | ${d.matchedBy}`,
      );
    });
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
