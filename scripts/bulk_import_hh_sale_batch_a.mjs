/**
 * Bulk import HH sale MISSING - Batch A: 17 rows "đợt này" (không phải nợ tháng trước).
 * Source: BC DT sheet 2.3_Gia von, cột U (PMG phải trả gross).
 *
 * Cách chạy:
 *   node scripts/bulk_import_hh_sale_batch_a.mjs           → dry-run (in ra bảng, không insert)
 *   node scripts/bulk_import_hh_sale_batch_a.mjs --commit  → insert thật
 */
import dotenv from "dotenv";
import postgres from "postgres";
import XLSX from "xlsx";

dotenv.config({ path: "/Users/trietnguyen/Documents/Company/BRE/App/CRM/.env.local" });

const COMMIT = process.argv.includes("--commit");
const ACTOR = "bulk-import-2026-08-22@bre.local";
const SNAPSHOT_DATE = "2026-08-22";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function excelDateToISO(v) {
  if (!v) return null;
  const d = new Date(v);
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 2020 || year > 2035) return null; // Filter lỗi 0099
  return d.toISOString().slice(0, 10);
}

async function main() {
  const wb = XLSX.readFile(
    "/Users/trietnguyen/Documents/Company/BRE/App/CRM/data-excel/BAO CAO DOANH THU.xlsx",
    { cellDates: true },
  );
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.3_Gia von"], {
    header: 1,
    raw: true,
    defval: null,
  });

  const dbRows = await sql`
    SELECT p.id AS product_id, p.product_code, cr.id, cr.cost_type, cr.amount_payable_this_time
    FROM cost_reconciliations cr JOIN products p ON p.id = cr.product_id
  `;
  const dbByCode = new Map();
  for (const r of dbRows) {
    const cur = dbByCode.get(r.product_code) || [];
    cur.push(r);
    dbByCode.set(r.product_code, cur);
  }
  const allProducts = await sql`SELECT id, product_code, sales_person FROM products`;
  const productByCode = new Map(allProducts.map((p) => [p.product_code, p]));

  const toImport = [];

  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const code = r[3] ? String(r[3]).trim() : null;
    const amount = Number(r[21] ?? 0);
    if (!code || !amount || Math.abs(amount) < 0.5) continue;

    const employeeCol2 = r[2] ? String(r[2]).trim() : null;
    // Batch A = KHÔNG phải "tt 30% nợ tháng trước"
    if (employeeCol2 && employeeCol2.toLowerCase().includes("nợ")) continue;

    const prod = productByCode.get(code);
    if (!prod) {
      console.log(`  SKIP row ${i + 1}: không có product ${code}`);
      continue;
    }

    // Check nếu đã có recon HH sale cùng amount → skip
    const dbList = dbByCode.get(code) || [];
    const dup = dbList.find(
      (d) =>
        d.cost_type === "sale_commission" &&
        Math.abs(Number(d.amount_payable_this_time) - amount) < 1000,
    );
    if (dup) continue;

    const nvkdCol9 = r[9] ? toTitleCase(String(r[9]).trim()) : null;
    const employee = nvkdCol9 || prod.sales_person || (employeeCol2 ? toTitleCase(employeeCol2) : null);
    if (!employee) {
      console.log(`  SKIP row ${i + 1} (${code}): không xác định được employee`);
      continue;
    }

    const noteParts = [`Bulk import từ BC DT sheet 2.3_Gia von row ${i + 1} (Claude, ${SNAPSHOT_DATE})`];
    if (employeeCol2) noteParts.push(`Col C: ${employeeCol2}`);

    toImport.push({
      excelRow: i + 1,
      code,
      productId: prod.id,
      employeeName: employee,
      reconciliationDate: excelDateToISO(r[1]),
      pmgBasePriceSale: Number(r[11] ?? 0),
      pmgLkSaleRate: Number(r[12] ?? 0),
      pmgProgressAmount: 0,
      pmgCumulativePctSale: Number(r[14] ?? 0),
      commissionRate: Number(r[15] ?? 0),
      adminFeeSale: Number(r[16] ?? 0),
      customerSupport: Number(r[17] ?? 0),
      paymentProgressPct: Number(r[13] ?? 0),
      pmgReconciledCumulative: Number(r[19] ?? 0),
      pmgThisTime: Number(r[20] ?? 0),
      pmgPayable: amount,
      pmgRemaining: Number(r[22] ?? 0),
      amountPayableThisTime: amount,
      note: noteParts.join(" | "),
    });
  }

  toImport.sort((a, b) => b.amountPayableThisTime - a.amountPayableThisTime);

  console.log(`\n=== BATCH A: ${toImport.length} rows / ${toImport.reduce((s, r) => s + r.amountPayableThisTime, 0).toLocaleString("vi-VN")} VND ===\n`);
  console.log("# | ExcelRow | Mã căn                | Ngày       | Employee              | %HH  | N    | Amount");
  toImport.forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(2)} | ${String(r.excelRow).padStart(8)} | ${r.code.padEnd(22)} | ${(r.reconciliationDate || "NULL").padEnd(10)} | ${r.employeeName.slice(0, 22).padEnd(22)} | ${(r.commissionRate * 100).toFixed(0).padStart(3)}% | ${(r.paymentProgressPct * 100).toFixed(0).padStart(3)}% | ${r.amountPayableThisTime.toLocaleString("vi-VN")}`,
    );
  });

  if (!COMMIT) {
    console.log(`\n[DRY-RUN] Không insert. Chạy lại với --commit để insert thật.`);
    await sql.end();
    return;
  }

  console.log(`\n[COMMIT] Bắt đầu insert ${toImport.length} rows (transactional)...\n`);
  let inserted = 0;
  for (const row of toImport) {
    await sql.begin(async (tx) => {
      const [rec] = await tx`
        INSERT INTO cost_reconciliations (
          product_id, reconciliation_date, employee_name, cost_type,
          pmg_base_price_sale, pmg_lk_sale_rate, pmg_progress_amount, pmg_cumulative_pct_sale,
          commission_rate, admin_fee_sale, customer_support,
          payment_progress_pct, pmg_reconciled_cumulative, pmg_this_time, pmg_payable, pmg_remaining,
          amount_payable_this_time, note, created_at
        ) VALUES (
          ${row.productId}, ${row.reconciliationDate}, ${row.employeeName}, 'sale_commission',
          ${row.pmgBasePriceSale}, ${row.pmgLkSaleRate}, ${row.pmgProgressAmount}, ${row.pmgCumulativePctSale},
          ${row.commissionRate}, ${row.adminFeeSale}, ${row.customerSupport},
          ${row.paymentProgressPct}, ${row.pmgReconciledCumulative}, ${row.pmgThisTime}, ${row.pmgPayable}, ${row.pmgRemaining},
          ${row.amountPayableThisTime}, ${row.note}, now()
        )
        RETURNING id
      `;

      await tx`
        INSERT INTO activity_logs (
          entity_type, entity_id, product_id, action, actor_email, summary, changes, created_at
        ) VALUES (
          'cost_reconciliation', ${rec.id}, ${row.productId}, 'create', ${ACTOR},
          ${`Bulk import HH sale từ BC DT row ${row.excelRow} — ${row.employeeName} — ${row.amountPayableThisTime.toLocaleString("vi-VN")}`},
          ${JSON.stringify({ after: row })}::jsonb, now()
        )
      `;
      inserted++;
      console.log(`  ✓ #${rec.id} row${row.excelRow} ${row.code} ${row.amountPayableThisTime.toLocaleString("vi-VN")}`);
    });
  }
  console.log(`\n✓ Inserted ${inserted}/${toImport.length}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
