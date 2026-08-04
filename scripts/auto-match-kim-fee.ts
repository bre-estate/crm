/**
 * Auto-match phí dịch vụ kế toán Kim.
 *
 * Kim NKC pattern:
 *   - Accrual: Nợ 6427 / Có 331 · 3.333.333 · "Chi phí dịch vụ kế toán T0X/2025" (T1-T8)
 *   - Cash out: Nợ 331 / Có 11211 · 3M-4M · "BRE thanh toan phi dich vu thang X"
 *
 * DNTT pattern:
 *   - recipient = "Hồ Thị Lan Kim" (personal) · 3M · "Phí dịch vụ kế toán tháng X"
 *
 * Chỉ auto-match 1-1 EXACT (amount ±1%, date ±15d). Combo/mờ → pending.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: any) => Math.round(Number(n)).toLocaleString("vi-VN");

async function main() {
  console.log("═══ AUTO-MATCH phí dịch vụ Kim (1-1 exact only) ═══\n");

  // Kim entries: BOTH accrual (Nợ 6427/Có 331) và cash (Nợ 331/Có 11211) cho phí Kim
  // Filter theo description có "dịch vụ kế toán" hoặc "phi dich vu thang"
  const kimRows = await sql`
    SELECT id, entry_date, debit_account, credit_account, amount, description
    FROM accounting_journal
    WHERE substr(entry_date, 1, 4) = '2025'
      AND (
        (debit_account = '6427' AND description ILIKE '%dịch vụ kế toán%')
        OR (debit_account = '331' AND credit_account = '11211' AND description ILIKE '%phi dich vu%')
      )
    ORDER BY entry_date`;

  console.log(`Found ${kimRows.length} Kim entries.\n`);

  let matched = 0, ambiguous = 0, orphan = 0, alreadyDone = 0;
  const results: Array<{ date: string; type: string; amount: number; status: string; note: string }> = [];

  for (const kr of kimRows) {
    const kimId = kr.id;
    const kimAmount = Number(kr.amount);
    const kimDate = kr.entry_date;
    const kimType = kr.debit_account === "6427" ? "accrual" : "cash";

    // Check done
    const existing = await sql`SELECT status FROM kim_entry_reconciliation WHERE kim_entry_id = ${kimId}`;
    if (existing[0]?.status === "done") {
      alreadyDone++;
      results.push({ date: kimDate, type: kimType, amount: kimAmount, status: "SKIP", note: "đã done" });
      continue;
    }

    // DNTT window
    const from = new Date(kimDate);
    from.setDate(from.getDate() - 15);
    const to = new Date(kimDate);
    to.setDate(to.getDate() + 15);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    // DNTT for Kim (personal): recipient Kim, amount ±1%
    // Loại DNTT có description multi-month (+, gộp, BS, bổ sung) để tránh ambiguous.
    const matches = await sql`
      SELECT id, request_date, amount, recipient, detail
      FROM payment_requests
      WHERE request_date >= ${fromStr}
        AND request_date <= ${toStr}
        AND (recipient ILIKE '%Hồ Thị Lan Kim%' OR recipient ILIKE '%HỒ THỊ LAN KIM%')
        AND ABS(amount - ${kimAmount}) <= ${kimAmount * 0.01}
        AND detail !~ '\\+'
        AND detail NOT ILIKE '%gộp%'
        AND detail NOT ILIKE '%BS %'
        AND detail NOT ILIKE '%bổ sung%'
      ORDER BY request_date`;

    if (matches.length === 0) {
      orphan++;
      results.push({ date: kimDate, type: kimType, amount: kimAmount, status: "ORPHAN", note: `${fmt(kimAmount)} — không DNTT match` });
      continue;
    }
    if (matches.length > 1) {
      ambiguous++;
      results.push({ date: kimDate, type: kimType, amount: kimAmount, status: "AMBIGUOUS", note: `${matches.length} DNTT match` });
      continue;
    }

    // 1-1 match → auto-link + mark done
    const dnttId = Number(matches[0].id);
    const dnttDetail = String(matches[0].detail ?? "");
    await sql`
      INSERT INTO kim_entry_reconciliation (
        kim_entry_id, linked_payment_request_ids, status, note, reconciled_at, reconciled_by
      ) VALUES (
        ${kimId}, ${[dnttId] as any}, 'done',
        ${'auto-matched (1-1): ' + dnttDetail.slice(0, 60)},
        NOW(), 'auto-match-script'
      )
      ON CONFLICT (kim_entry_id) DO UPDATE SET
        linked_payment_request_ids = EXCLUDED.linked_payment_request_ids,
        status = EXCLUDED.status,
        note = EXCLUDED.note,
        reconciled_at = EXCLUDED.reconciled_at,
        reconciled_by = EXCLUDED.reconciled_by`;
    matched++;
    results.push({ date: kimDate, type: kimType, amount: kimAmount, status: "MATCHED", note: `→ DNTT #${dnttId} (${matches[0].request_date})` });
  }

  console.log(`─────────────────────────────────────────────────────────────`);
  console.log(`${"Ngày".padEnd(12)} ${"Loại".padEnd(9)} ${"Số tiền".padStart(12)}  ${"Kết quả".padEnd(10)} Ghi chú`);
  console.log(`─────────────────────────────────────────────────────────────`);
  for (const r of results) {
    const icon = r.status === "MATCHED" ? "✅" : r.status === "AMBIGUOUS" ? "⚠️ " : r.status === "ORPHAN" ? "❌" : "⏭ ";
    console.log(`${r.date.padEnd(12)} ${r.type.padEnd(9)} ${fmt(r.amount).padStart(12)}  ${icon} ${r.status.padEnd(8)} ${r.note}`);
  }
  console.log(`─────────────────────────────────────────────────────────────`);
  console.log(`Tổng: ${matched} matched, ${ambiguous} ambiguous, ${orphan} orphan, ${alreadyDone} already done`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
