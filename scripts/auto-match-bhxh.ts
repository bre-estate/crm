/**
 * Auto-match Kim NKC BHXH groups (3383+3384+3386 cùng ngày) với DNTT rows.
 *
 * Logic:
 * 1. Group Kim BHXH entries theo (entry_date, credit_account=11211), sum amount.
 * 2. Với mỗi group, search DNTT: detail ILIKE '%BHXH%', amount within 1%, date ±15d.
 * 3. Nếu match chính xác 1 DNTT → auto-link, mark done, note "auto-matched".
 * 4. Nếu 0 hoặc >1 → skip, để user review.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: any) => Math.round(Number(n)).toLocaleString("vi-VN");

async function main() {
  console.log("═══ AUTO-MATCH BHXH (Kim NKC group → DNTT) ═══\n");

  // 1) Lấy tất cả Kim BHXH cash out (Nợ 3383/3384/3386 / Có 11211) trong 2025
  const kimRows = await sql`
    SELECT id, entry_date, debit_account, amount
    FROM accounting_journal
    WHERE debit_account IN ('3383','3384','3386')
      AND credit_account = '11211'
      AND substr(entry_date, 1, 4) = '2025'
    ORDER BY entry_date`;

  // Group by entry_date
  const groups = new Map<string, { ids: number[]; amount: number }>();
  for (const r of kimRows) {
    const key = r.entry_date;
    if (!groups.has(key)) groups.set(key, { ids: [], amount: 0 });
    const g = groups.get(key)!;
    g.ids.push(r.id);
    g.amount += Number(r.amount);
  }

  console.log(`Found ${groups.size} Kim BHXH groups (${kimRows.length} raw entries).\n`);

  let matched = 0, ambiguous = 0, orphan = 0, alreadyDone = 0;
  const results: Array<{ date: string; amount: number; status: string; note: string }> = [];

  for (const [date, g] of groups) {
    // Check if all 3 rows đã done
    const doneCount = await sql`
      SELECT COUNT(*)::int as n
      FROM kim_entry_reconciliation
      WHERE kim_entry_id = ANY(${g.ids as any}) AND status = 'done'`;
    if (Number(doneCount[0].n) === g.ids.length) {
      alreadyDone++;
      results.push({ date, amount: g.amount, status: "SKIP", note: "đã done rồi" });
      continue;
    }

    // Search DNTT candidates
    const from = new Date(date);
    from.setDate(from.getDate() - 15);
    const to = new Date(date);
    to.setDate(to.getDate() + 15);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    // Bước 1: try 1-1 match (Kim = 1 DNTT chính xác)
    let matches = await sql`
      SELECT id, request_date, amount, recipient, detail
      FROM payment_requests
      WHERE request_date >= ${fromStr}
        AND request_date <= ${toStr}
        AND detail ILIKE '%BHXH%'
        AND ABS(amount - ${g.amount}) <= ${g.amount * 0.01}
      ORDER BY request_date`;

    let matchedIds: number[] = [];
    let matchedDetails: string[] = [];

    if (matches.length === 1) {
      matchedIds = [Number(matches[0].id)];
      matchedDetails = [String(matches[0].detail ?? "")];
    } else if (matches.length === 0) {
      // Bước 2: try N-DNTT combination sum = Kim (BHXH bulk 1 lần trả cho nhiều tháng)
      const allBhxh = await sql`
        SELECT id, request_date, amount, detail
        FROM payment_requests
        WHERE request_date >= ${fromStr}
          AND request_date <= ${toStr}
          AND detail ILIKE '%BHXH%'
        ORDER BY request_date`;
      // Brute force: subsets 2-4 rows
      const arr = allBhxh.map((r: any) => ({ id: Number(r.id), amount: Number(r.amount), detail: String(r.detail ?? "") }));
      let bestCombo: typeof arr = [];
      const target = g.amount;
      const tolerance = Math.max(g.amount * 0.005, 1000); // 0.5% or 1k VND
      const findCombo = (start: number, current: typeof arr, sum: number): boolean => {
        if (Math.abs(sum - target) <= tolerance && current.length >= 2) {
          bestCombo = [...current];
          return true;
        }
        if (sum > target * 1.01 || current.length >= 4) return false;
        for (let i = start; i < arr.length; i++) {
          current.push(arr[i]);
          if (findCombo(i + 1, current, sum + arr[i].amount)) return true;
          current.pop();
        }
        return false;
      };
      findCombo(0, [], 0);
      if (bestCombo.length >= 2) {
        matchedIds = bestCombo.map((c) => c.id);
        matchedDetails = bestCombo.map((c) => c.detail);
      }
    }

    if (matchedIds.length === 0) {
      orphan++;
      results.push({ date, amount: g.amount, status: "ORPHAN", note: `${fmt(g.amount)} — không tìm DNTT match (1 hay combo)` });
      continue;
    }

    if (matches.length > 1) {
      ambiguous++;
      results.push({ date, amount: g.amount, status: "AMBIGUOUS", note: `${matches.length} DNTT 1-1 match — user chọn` });
      continue;
    }

    // Có match (1-1 hoặc combo N-1) → auto-link + mark done
    const dnttDetail = matchedDetails.join(" + ").slice(0, 100);
    for (const kimId of g.ids) {
      await sql`
        INSERT INTO kim_entry_reconciliation (
          kim_entry_id, linked_payment_request_ids, status, note, reconciled_at, reconciled_by
        ) VALUES (
          ${kimId}, ${matchedIds as any}, 'done',
          ${'auto-matched: ' + dnttDetail},
          NOW(), 'auto-match-script'
        )
        ON CONFLICT (kim_entry_id) DO UPDATE SET
          linked_payment_request_ids = EXCLUDED.linked_payment_request_ids,
          status = EXCLUDED.status,
          note = EXCLUDED.note,
          reconciled_at = EXCLUDED.reconciled_at,
          reconciled_by = EXCLUDED.reconciled_by`;
    }
    matched++;
    const linkNote = matchedIds.length === 1 ? `→ DNTT #${matchedIds[0]}` : `→ ${matchedIds.length} DNTT gộp (${matchedIds.join(",")})`;
    results.push({ date, amount: g.amount, status: "MATCHED", note: linkNote });
  }

  // Report
  console.log(`─────────────────────────────────────────────────────────────`);
  console.log(`${"Ngày".padEnd(12)} ${"Số tiền".padStart(14)}  ${"Kết quả".padEnd(10)} Ghi chú`);
  console.log(`─────────────────────────────────────────────────────────────`);
  for (const r of results) {
    const color = r.status === "MATCHED" ? "✅" : r.status === "AMBIGUOUS" ? "⚠️ " : r.status === "ORPHAN" ? "❌" : "⏭ ";
    console.log(`${r.date.padEnd(12)} ${fmt(r.amount).padStart(14)}  ${color} ${r.status.padEnd(8)} ${r.note}`);
  }
  console.log(`─────────────────────────────────────────────────────────────`);
  console.log(`Tổng: ${matched} auto-matched, ${ambiguous} ambiguous, ${orphan} orphan, ${alreadyDone} already done`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
