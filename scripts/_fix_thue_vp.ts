import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  // ═══════════════════════════════════════════
  // 1) Xóa dup T10 (merged-Bách 15/10 · 13M · "Tiền thuê VP tháng 10")
  //    Giữ row 06/10 thanh-toan (bank txn cty, chính xác hơn)
  // ═══════════════════════════════════════════
  const dup = await sql`
    SELECT id, transaction_date, description, source_file
    FROM financial_transactions
    WHERE transaction_date = '2025-10-15'
      AND amount = 13000000
      AND direction = 'out'
      AND description ILIKE '%thuê VP tháng 10%'
      AND source_file ILIKE '%merged-Bách%'`;
  console.log(`Dup found: ${dup.length} rows`);
  for (const r of dup) console.log(`  id=${r.id} · ${r.transaction_date} · ${r.description}`);
  if (dup.length === 1) {
    await sql`DELETE FROM financial_transactions WHERE id = ${dup[0].id}`;
    console.log(`✅ Deleted 1 dup row`);
  } else {
    console.log(`⚠️  Không delete (expect 1 row, got ${dup.length}) — dừng`);
    process.exit(1);
  }

  // ═══════════════════════════════════════════
  // 2) Import 6 rows thuê VP T1-T6 từ Kim journal
  // ═══════════════════════════════════════════
  const missing = [
    { date: "2025-01-20", month: "2025-01", desc: "Thanh toán tiền thuê văn phòng T1/2025", note: "Kim journal CTNH — nhập bổ sung 2026-08-04" },
    { date: "2025-02-20", month: "2025-02", desc: "Thanh toán tiền thuê văn phòng T2/2025", note: "Kim journal CTNH — nhập bổ sung 2026-08-04" },
    { date: "2025-03-22", month: "2025-03", desc: "Thanh toán tiền thuê văn phòng T3/2025", note: "Kim journal CTNH — nhập bổ sung 2026-08-04" },
    { date: "2025-04-18", month: "2025-04", desc: "Thanh toán tiền thuê văn phòng T4/2025", note: "Kim journal CTNH — nhập bổ sung 2026-08-04" },
    { date: "2025-05-22", month: "2025-05", desc: "Thanh toán tiền thuê văn phòng T5/2025", note: "Kim journal CTNH — nhập bổ sung 2026-08-04" },
    { date: "2025-06-23", month: "2025-06", desc: "Thanh toán tiền thuê văn phòng T6/2025", note: "Kim journal CTNH — nhập bổ sung 2026-08-04" },
  ];

  let inserted = 0;
  for (const r of missing) {
    const dedup = `thue-vp-landlord-${r.month}`;
    const res = await sql`
      INSERT INTO financial_transactions (
        transaction_date, transaction_month, accrual_month,
        description, amount, direction, category_code, management_group,
        recipient, has_invoice, invoice_valid,
        source_file, source_row, dedup_key, note
      ) VALUES (
        ${r.date}, ${r.month}, ${r.month},
        ${r.desc}, 13000000, 'out', '6427', 'opex',
        'Landlord VP (SH...)', true, true,
        'Kim-NKC', ${"kim-thue-" + r.month}, ${dedup}, ${r.note}
      )
      ON CONFLICT (dedup_key) DO NOTHING
      RETURNING id`;
    if (res.length > 0) {
      inserted++;
      console.log(`✅ Inserted ${r.month}: 13M`);
    } else {
      console.log(`⏭  Skip ${r.month} (already exists)`);
    }
  }
  console.log(`\nTổng: ${inserted} rows inserted (${(inserted * 13).toLocaleString("vi-VN")}M)`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
