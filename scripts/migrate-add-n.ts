/**
 * Migration: thêm cột payment_progress_pct (N) + bảng product_adjustments.
 * Backfill N từ Excel col 13 cho cost_reconciliations hiện tại.
 */
import * as XLSX from "xlsx";
import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const c = postgres(process.env.DATABASE_URL!, { prepare: false });

const excelDate = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    const dt = new Date(ms);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
};
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

async function main() {
  console.log("=== Migration ===");

  if (APPLY) {
    // 1. Add payment_progress_pct column
    await c`
      ALTER TABLE cost_reconciliations
      ADD COLUMN IF NOT EXISTS payment_progress_pct DOUBLE PRECISION DEFAULT 0
    `;
    console.log("  ✅ Added cost_reconciliations.payment_progress_pct");

    // 2. Create product_adjustments table
    await c`
      CREATE TABLE IF NOT EXISTS product_adjustments (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        effective_date TEXT NOT NULL,
        note TEXT,
        pmg_base_price DOUBLE PRECISION,
        pmg_rate DOUBLE PRECISION,
        pmg_sale_rate DOUBLE PRECISION,
        admin_fee DOUBLE PRECISION,
        admin_fee_sale DOUBLE PRECISION,
        sale_commission_rate DOUBLE PRECISION,
        kpi_ceo_rate DOUBLE PRECISION,
        kpi_tpkd_rate DOUBLE PRECISION,
        kpi_admin_rate DOUBLE PRECISION,
        cdt_bonus_sale DOUBLE PRECISION,
        cdt_bonus_manager DOUBLE PRECISION,
        bonus_sale DOUBLE PRECISION,
        bonus_manager DOUBLE PRECISION,
        customer_support DOUBLE PRECISION,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await c`CREATE INDEX IF NOT EXISTS idx_adj_product ON product_adjustments(product_id)`;
    await c`CREATE INDEX IF NOT EXISTS idx_adj_date ON product_adjustments(effective_date)`;
    console.log("  ✅ Created product_adjustments table");
  }

  // 3. Backfill N from Excel
  console.log("\n=== Backfill N (payment_progress_pct) ===");
  const wb = XLSX.readFile("/Users/trietnguyen/Documents/Company/BRE/App/CRM/BAO CAO DOANH THU.xlsx");
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["2.3_Gia von"], { header: 1, defval: null });

  // Build lookup: (unit_code + emp + date + costType approx) -> N
  // Since Excel doesn't split cost type per row, use unit_code + emp + date as key
  const excelIndex = new Map<string, number>();
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const unit = String(r[4] ?? "").trim();
    const emp = norm(String(r[2] ?? ""));
    const date = excelDate(r[1]);
    const N = Number(r[13] ?? 0);
    if (!unit || !emp || !date) continue;
    const key = `${unit}|${emp.toLowerCase()}|${date}`;
    // Take first N for a key (all rows same key should have same N)
    if (!excelIndex.has(key)) excelIndex.set(key, N);
  }
  console.log(`  Excel keys: ${excelIndex.size}`);

  // Get all cost recons
  const recons = await c`
    SELECT cr.id, cr.reconciliation_date, cr.employee_name, cr.cost_type, p.unit_code
    FROM cost_reconciliations cr
    JOIN products p ON p.id = cr.product_id
  `;

  let matched = 0;
  let unmatched = 0;
  const unmatchedList: string[] = [];
  for (const r of recons) {
    const key = `${r.unit_code}|${norm(r.employee_name).toLowerCase()}|${r.reconciliation_date}`;
    const N = excelIndex.get(key);
    if (N != null && N > 0) {
      matched++;
      if (APPLY) {
        await c`UPDATE cost_reconciliations SET payment_progress_pct = ${N} WHERE id = ${r.id}`;
      }
    } else {
      unmatched++;
      if (unmatchedList.length < 10) unmatchedList.push(`#${r.id} ${r.unit_code} · ${r.employee_name} · ${r.reconciliation_date} · ${r.cost_type}`);
    }
  }

  console.log(`  Matched (N > 0): ${matched}`);
  console.log(`  Unmatched or N=0: ${unmatched}`);
  if (unmatchedList.length > 0) {
    console.log("  Sample unmatched:");
    unmatchedList.forEach((s) => console.log(`    ${s}`));
  }

  console.log(`\n${APPLY ? "✅ APPLIED" : "(dry-run, add --apply)"}`);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
