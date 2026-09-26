/**
 * Phase E — Reconciliation Kim sổ 2025 vs App.
 *
 * Read từng sheet chi phí trong "SO SACH BRE 2025.xlsx" (6411/6417/6421/6423/6425/6427/811),
 * so từng dòng với financial_transactions.
 *
 * Match rule (fuzzy):
 *   - date within ±5 ngày
 *   - amount khớp exact hoặc ± 100 VND (rounding)
 *   - description có > 3 từ chung
 *
 * Output 3 file:
 *   - reconcile-kim-only.csv    : Kim có, App không → cần import bổ sung
 *   - reconcile-app-only.csv    : App có, Kim không → check ngoại sổ
 *   - reconcile-matched.csv     : match — verify OK
 */

import { db } from "../lib/db";
import { financialTransactions } from "../lib/schema";
import { like } from "drizzle-orm";
import * as XLSX from "xlsx";
import { writeFileSync } from "fs";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const KIM_SHEETS = ["6411", "6417", "6421", "6423", "6425", "6427", "811"];

interface KimRow {
  sheet: string;
  date: string;
  desc: string;
  amount: number;
  tkDU: string; // TK đối ứng
  rawRowIdx: number;
}

interface AppRow {
  id: number;
  date: string;
  desc: string;
  amount: number;
  categoryCode: string;
  recipient: string | null;
  source: string;
}

function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[.,;:'"()+_\-*!?/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normText(s).split(" ").filter((t) => t.length >= 3));
}

function tokenOverlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n;
}

function excelSerialToDate(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

function dateDiff(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.abs(da - db) / (86400 * 1000);
}

async function main() {
  // 1. Read Kim sheets
  const wb = XLSX.readFile("data-excel/SO SACH BRE 2025.xlsx");
  const kimRows: KimRow[] = [];
  for (const sheet of KIM_SHEETS) {
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const raw = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      blankrows: false,
    });
    // Find data start (skip header rows)
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      if (!r) continue;
      const cells = r.map((c: any) => (c === null || c === undefined ? "" : c));
      // Try to detect data row: col 0 = date serial number
      const c0 = cells[0];
      if (typeof c0 !== "number" || c0 < 40000 || c0 > 50000) continue;
      const date = excelSerialToDate(c0);
      const desc = String(cells[3] ?? "").trim();
      const tkDU = String(cells[4] ?? "").trim();
      const noNum = Number(cells[5] ?? 0);
      const coNum = Number(cells[6] ?? 0);
      const amount = noNum || coNum || 0;
      // Skip kết chuyển + trích trước aggregate rows
      if (desc.toLowerCase().includes("kết chuyển")) continue;
      if (amount === 0) continue;
      kimRows.push({ sheet, date, desc, amount, tkDU, rawRowIdx: i });
    }
  }
  console.log(`Loaded Kim rows: ${kimRows.length}`);
  const kimTotal = kimRows.reduce((s, r) => s + r.amount, 0);
  console.log(`  Total Kim: ${fmt(kimTotal)}\n`);

  // 2. Load App 2025 (all categories, all view)
  const appRows: AppRow[] = (
    await db
      .select({
        id: financialTransactions.id,
        date: financialTransactions.transactionDate,
        desc: financialTransactions.description,
        amount: financialTransactions.amount,
        categoryCode: financialTransactions.categoryCode,
        recipient: financialTransactions.recipient,
        source: financialTransactions.sourceFile,
      })
      .from(financialTransactions)
      .where(like(financialTransactions.transactionMonth, "2025-%"))
  ).map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));
  console.log(`Loaded App 2025 rows: ${appRows.length}`);
  const appTotal = appRows.reduce((s, r) => s + r.amount, 0);
  console.log(`  Total App: ${fmt(appTotal)}\n`);

  // 3. Match rows
  const usedApp = new Set<number>();
  const kimMatched: Array<{ kim: KimRow; app: AppRow }> = [];
  const kimOnly: KimRow[] = [];

  for (const k of kimRows) {
    let best: { app: AppRow; score: number } | null = null;
    for (const a of appRows) {
      if (usedApp.has(a.id)) continue;
      // Amount must be close
      const amtDiff = Math.abs(k.amount - a.amount);
      if (amtDiff > 100) continue;
      // Date within 15 days (accrual vs cash can be far apart)
      const dd = dateDiff(k.date, a.date);
      if (dd > 30) continue;
      // Token overlap ≥ 2
      const overlap = tokenOverlap(k.desc, a.desc);
      if (overlap < 2 && amtDiff > 0) continue;

      const score = (100 - amtDiff) + (30 - dd) + overlap * 5;
      if (!best || score > best.score) best = { app: a, score };
    }
    if (best) {
      usedApp.add(best.app.id);
      kimMatched.push({ kim: k, app: best.app });
    } else {
      kimOnly.push(k);
    }
  }

  const appOnly = appRows.filter((a) => !usedApp.has(a.id));

  const kimOnlyTotal = kimOnly.reduce((s, r) => s + r.amount, 0);
  const appOnlyTotal = appOnly.reduce((s, r) => s + r.amount, 0);
  const matchedTotal = kimMatched.reduce((s, m) => s + m.kim.amount, 0);

  console.log(`═════════════════════════════════════════════════`);
  console.log(`  RECONCILIATION RESULT`);
  console.log(`═════════════════════════════════════════════════`);
  console.log(`  Matched            : ${kimMatched.length} rows · ${fmt(matchedTotal)}`);
  console.log(`  Kim có, App không : ${kimOnly.length} rows · ${fmt(kimOnlyTotal)}`);
  console.log(`  App có, Kim không : ${appOnly.length} rows · ${fmt(appOnlyTotal)}`);

  // Kim only breakdown by sheet
  console.log(`\n  Kim-only theo sheet:`);
  const bySheet = new Map<string, { cnt: number; total: number }>();
  for (const k of kimOnly) {
    const s = bySheet.get(k.sheet) ?? { cnt: 0, total: 0 };
    s.cnt++;
    s.total += k.amount;
    bySheet.set(k.sheet, s);
  }
  for (const [sh, v] of [...bySheet.entries()].sort()) {
    console.log(`    ${sh}: ${v.cnt} rows · ${fmt(v.total)}`);
  }

  // App only breakdown by category
  console.log(`\n  App-only theo category:`);
  const byCat = new Map<string, { cnt: number; total: number }>();
  for (const a of appOnly) {
    const c = byCat.get(a.categoryCode) ?? { cnt: 0, total: 0 };
    c.cnt++;
    c.total += a.amount;
    byCat.set(a.categoryCode, c);
  }
  for (const [c, v] of [...byCat.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`    ${c.padEnd(15)}: ${v.cnt} rows · ${fmt(v.total)}`);
  }

  // 4. Write CSVs
  const csvEsc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const dir = "backups/reconcile-2026-07-27";
  writeFileSync(
    `${dir}-kim-only.csv`,
    "sheet,date,amount,tk_du,description\n" +
      kimOnly
        .sort((a, b) => b.amount - a.amount)
        .map(
          (k) =>
            `${k.sheet},${k.date},${k.amount},${csvEsc(k.tkDU)},${csvEsc(k.desc)}`,
        )
        .join("\n"),
  );
  writeFileSync(
    `${dir}-app-only.csv`,
    "id,date,category,source,amount,recipient,description\n" +
      appOnly
        .sort((a, b) => b.amount - a.amount)
        .map(
          (a) =>
            `${a.id},${a.date},${a.categoryCode},${a.source},${a.amount},${csvEsc(a.recipient ?? "")},${csvEsc(a.desc)}`,
        )
        .join("\n"),
  );
  writeFileSync(
    `${dir}-matched.csv`,
    "kim_sheet,kim_date,kim_amount,kim_desc,app_id,app_date,app_category,app_desc\n" +
      kimMatched
        .map(
          (m) =>
            `${m.kim.sheet},${m.kim.date},${m.kim.amount},${csvEsc(m.kim.desc)},${m.app.id},${m.app.date},${m.app.categoryCode},${csvEsc(m.app.desc)}`,
        )
        .join("\n"),
  );

  console.log(`\n  Files written:`);
  console.log(`    ${dir}-kim-only.csv`);
  console.log(`    ${dir}-app-only.csv`);
  console.log(`    ${dir}-matched.csv`);

  // Top 15 Kim-only rows (giá trị cao)
  console.log(`\n  Top 15 Kim-only cần import:`);
  for (const k of kimOnly.sort((a, b) => b.amount - a.amount).slice(0, 15)) {
    console.log(`    [${k.sheet}] ${k.date} · ${fmt(k.amount).padStart(14)} · ${k.desc.substring(0, 70)}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
