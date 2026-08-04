/**
 * Auto-match Kim service fee v2: match theo THÁNG (extract từ description).
 *
 * Kim NKC accrual "Chi phí dịch vụ kế toán T0X/2025" (gross VAT 3.333M)
 * DNTT "Phí dịch vụ tháng X/2025" (net 3M)
 * → match nếu cùng tháng, không care amount.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: any) => Math.round(Number(n)).toLocaleString("vi-VN");

// Extract "T01/2025", "tháng 1/2025", "thang 1 2025" → "2025-01"
function extractMonth(text: string | null): string | null {
  if (!text) return null;
  const s = text.toLowerCase();
  // T01/2025 or T1/2025 or T01.2025
  let m = s.match(/t(\d{1,2})[\/.\s]+(\d{4})/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  // "tháng 1/2025", "thang 1 2025", "thang 12.2024"
  m = s.match(/th[aá]ng\s+(\d{1,2})[\/.\s]+(\d{4})/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  // "T5 2025"
  m = s.match(/t\s*(\d{1,2})\s+(\d{4})/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  return null;
}

async function main() {
  console.log("═══ AUTO-MATCH phí Kim v2 (theo tháng, không care amount) ═══\n");

  const kimRows = await sql`
    SELECT id, entry_date, debit_account, amount, description
    FROM accounting_journal
    WHERE substr(entry_date, 1, 4) = '2025'
      AND debit_account = '6427'
      AND description ILIKE '%dịch vụ kế toán%'
    ORDER BY entry_date`;

  // Bất kỳ DNTT nào recipient = Kim (không care description vì variations lớn:
  // "Phí dịch vụ", "Lương", "Thù lao CTV" — tất cả cho Kim đều là fee).
  // Nhưng loại FPT hóa đơn / thuế / etc.
  const dnttRows = await sql`
    SELECT id, request_date, amount, detail
    FROM payment_requests
    WHERE (recipient ILIKE '%Hồ Thị Lan Kim%' OR recipient ILIKE '%HỒ THỊ LAN KIM%')
      AND detail NOT ILIKE '%FPT%'
      AND detail NOT ILIKE '%hoá đơn%'
      AND detail NOT ILIKE '%hoa don%'
      AND detail !~ '\\+'
      AND detail NOT ILIKE '%gộp%'
      AND detail NOT ILIKE '%BS %'
    ORDER BY request_date`;

  // Index DNTT by month
  const dnttByMonth = new Map<string, any[]>();
  for (const d of dnttRows) {
    const m = extractMonth(d.detail);
    if (!m) continue;
    if (!dnttByMonth.has(m)) dnttByMonth.set(m, []);
    dnttByMonth.get(m)!.push(d);
  }

  console.log(`Kim entries: ${kimRows.length}, DNTT by month: ${dnttByMonth.size} months`);
  console.log(`DNTT months: ${[...dnttByMonth.keys()].sort().join(", ")}\n`);

  let matched = 0, orphan = 0, ambiguous = 0, alreadyDone = 0;

  for (const kr of kimRows) {
    const kimMonth = extractMonth(kr.description);
    if (!kimMonth) {
      orphan++;
      console.log(`⚠️  Kim #${kr.id} (${kr.entry_date}): không extract được tháng từ "${kr.description?.slice(0, 60)}"`);
      continue;
    }

    // Check done
    const existing = await sql`SELECT status FROM kim_entry_reconciliation WHERE kim_entry_id = ${kr.id}`;
    if (existing[0]?.status === "done") {
      alreadyDone++;
      console.log(`⏭  Kim #${kr.id} (${kimMonth}): đã done`);
      continue;
    }

    const cands = dnttByMonth.get(kimMonth) ?? [];
    if (cands.length === 0) {
      orphan++;
      console.log(`❌ Kim #${kr.id} (${kimMonth}) ${fmt(kr.amount)}: không DNTT cùng tháng`);
      continue;
    }
    if (cands.length > 1) {
      ambiguous++;
      console.log(`⚠️  Kim #${kr.id} (${kimMonth}): ${cands.length} DNTT candidates — user chọn`);
      continue;
    }

    const dntt = cands[0];
    await sql`
      INSERT INTO kim_entry_reconciliation (
        kim_entry_id, linked_payment_request_ids, status, note, reconciled_at, reconciled_by
      ) VALUES (
        ${kr.id}, ${[Number(dntt.id)] as any}, 'done',
        ${'auto-matched theo tháng ' + kimMonth + ': Kim ' + fmt(kr.amount) + ' gross vs DNTT ' + fmt(dntt.amount) + ' net (chênh = VAT/phí)'},
        NOW(), 'auto-match-script'
      )
      ON CONFLICT (kim_entry_id) DO UPDATE SET
        linked_payment_request_ids = EXCLUDED.linked_payment_request_ids,
        status = EXCLUDED.status,
        note = EXCLUDED.note,
        reconciled_at = EXCLUDED.reconciled_at,
        reconciled_by = EXCLUDED.reconciled_by`;
    matched++;
    console.log(`✅ Kim #${kr.id} (${kimMonth}) ${fmt(kr.amount)} → DNTT #${dntt.id} (${fmt(dntt.amount)}, ${dntt.detail?.slice(0, 40)})`);
  }

  console.log(`\nTổng: ${matched} matched, ${ambiguous} ambiguous, ${orphan} orphan, ${alreadyDone} already done`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
