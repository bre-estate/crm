/**
 * Verify formula suggest amount cho revenue reconciliations.
 *
 * Pick 5 căn đa dạng, so DB → Excel col 20 (DT phải thu đợt này).
 * Formula em đang dùng:
 *   grossLK  = pmgBase × %PMG_LK × %thu_đợt_này
 *   col 19   = grossLK − admin_fee
 *   col 20   = col 19 hiện tại − sum(col 20 các đợt trước)
 *
 * Với căn được test:
 *  1. Multi-phase, có admin fee, primary — pattern chuẩn nhất
 *  2. Có bonus recons xen kẽ commission — test skip bonus khi tính prev LK
 *  3. Admin fee = 0 — edge case
 *  4. Secondary (nếu có)
 *  5. Random
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import postgres from "postgres";
import * as XLSX from "xlsx";

async function main() {
  const c = postgres(process.env.DATABASE_URL!, { prepare: false });

  // Load Excel sheet 2.2 (Doanh thu)
  const wb = XLSX.readFile("BAO CAO DOANH THU.xlsx");
  const ws = wb.Sheets["2.2_Doanh thu"];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  // Header row 5 (index 4). Data starts row 6 (index 5).
  // Group Excel rows by unit_code (col 7)
  const excelByUnit = new Map<string, any[]>();
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[7]) continue;
    const key = String(r[7]).trim();
    if (!excelByUnit.has(key)) excelByUnit.set(key, []);
    excelByUnit.get(key)!.push({
      excelRow: i + 1,
      dot: r[17],
      pmgBase: r[11],
      pmgLK: r[12],
      thuDotNay: r[15],
      admin: r[16] ?? 0,
      col18_LKDaDC: r[18],
      col19_DTLKDotNay: r[19],
      col20_PhaiThuDotNay: r[20],
      col24_ThuongSale: r[24] ?? 0,
      col25_ThuongQL: r[25] ?? 0,
      col26_TongPhaiThu: r[26],
    });
  }

  // Pick 5 test căn — diverse pattern
  const testUnitCodes = [
    "B1-14-10", // multi-phase 5 đợt, admin 3.85M
    "B2-11.17", // multi-phase 2 đợt, admin=0
    "A.10.10",  // seen trong bulk sample BCT2
    "A-29-12",  // pmg_rate=5% (căn 641)
    "B.31.20",  // %PMG=6.5%, có thặng dư
  ];

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Verify formula suggest amount trên ${testUnitCodes.length} căn`);
  console.log("=".repeat(80));

  let totalTests = 0;
  let passed = 0;
  const failures: string[] = [];

  for (const unitCode of testUnitCodes) {
    const excelRecs = excelByUnit.get(unitCode);
    if (!excelRecs || excelRecs.length === 0) {
      console.log(`\n[SKIP] ${unitCode}: không có trong Excel`);
      continue;
    }
    // Filter Excel recons: chỉ giữ những dòng có col 20 và có pmg data (commission recons)
    const excelCommissions = excelRecs.filter(
      (r) => r.pmgLK && r.thuDotNay && r.col20_PhaiThuDotNay,
    );

    // Fetch DB product
    const [dbProduct] = await c`
      SELECT id, unit_code, product_code, pmg_base_price, pmg_rate, admin_fee
      FROM products WHERE unit_code = ${unitCode}
      LIMIT 1`;

    if (!dbProduct) {
      console.log(`\n[SKIP] ${unitCode}: không có trong DB`);
      continue;
    }

    // Fetch DB recons (ordered by phase/date)
    const dbRecons = await c`
      SELECT id, phase_number, reconciliation_date, pmg_cumulative_pct, phase_pct_this_time,
        revenue_this_time, total_receivable_this_time, admin_fee_vat, cdt_bonus_sale,
        cdt_bonus_manager
      FROM revenue_reconciliations
      WHERE product_id = ${dbProduct.id}
      ORDER BY COALESCE(phase_number, 999), reconciliation_date, id`;

    console.log(`\n${"-".repeat(80)}`);
    console.log(`Căn: ${unitCode} (id ${dbProduct.id}, ${dbProduct.product_code})`);
    console.log(`  pmgBase=${Number(dbProduct.pmg_base_price).toLocaleString()}, admin_fee=${Number(dbProduct.admin_fee).toLocaleString()}`);
    console.log(`  DB có ${dbRecons.length} recons, Excel có ${excelCommissions.length} recons (commission)`);

    // Test formula cho mỗi recon commission
    // prevLK = sum of revenue_this_time từ các recon commission trước (loại bỏ bonus)
    let prevLK_DB = 0;
    for (const rec of dbRecons) {
      const isBonus = Number(rec.cdt_bonus_sale) > 0 || Number(rec.cdt_bonus_manager) > 0;
      if (isBonus) {
        console.log(`  [bonus] rec ${rec.id}: skip khỏi tính LK`);
        continue;
      }

      const pmgLK = Number(rec.pmg_cumulative_pct);
      const phasePct = Number(rec.phase_pct_this_time);
      // Admin fee: ưu tiên recon.adminFeeVat, fallback product.adminFee
      const adminFee = Number(rec.admin_fee_vat) || Number(dbProduct.admin_fee);

      const pmgBase = Number(dbProduct.pmg_base_price);
      const gross = pmgBase * pmgLK * phasePct;
      const lkThisTime = gross - adminFee;
      const suggested = Math.max(0, Math.round(lkThisTime - prevLK_DB));

      // Actual = DB revenue_this_time (đã lưu = Excel col 20)
      const actual = Math.round(Number(rec.revenue_this_time));
      const diff = Math.abs(suggested - actual);
      const ok = diff < 2; // 2đ tolerance rounding

      totalTests++;
      if (ok) passed++;

      const status = ok ? "✅" : "❌";
      console.log(
        `  ${status} rec ${rec.id} (phase ${rec.phase_number}): %PMG=${(pmgLK * 100).toFixed(2)}%, %thu=${(phasePct * 100).toFixed(2)}%, admin=${adminFee.toLocaleString()}`,
      );
      console.log(
        `      gross=${Math.round(gross).toLocaleString()}, LK=${Math.round(lkThisTime).toLocaleString()}, prev=${prevLK_DB.toLocaleString()}`,
      );
      console.log(
        `      suggested=${suggested.toLocaleString()} vs actual=${actual.toLocaleString()} (diff=${diff})`,
      );

      if (!ok) {
        failures.push(
          `${unitCode} rec ${rec.id}: suggested ${suggested} vs actual ${actual} (diff ${diff})`,
        );
      }

      // Prev tăng lên bằng actual (theo Excel data, không phải suggested)
      prevLK_DB += actual;
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`TỔNG KẾT: ${passed}/${totalTests} pass`);
  console.log("=".repeat(80));
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
