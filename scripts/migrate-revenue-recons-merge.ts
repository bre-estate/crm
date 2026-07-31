/**
 * Migrate revenue_reconciliations sang merge model:
 *   - Populate `notes` JSONB từ field `note` cũ (theo dominant type của recon)
 *   - Merge các recon cùng (product_id + invoice_id) không NULL thành 1 record:
 *       - primary = commission recon nếu có, else oldest
 *       - copy fields cdtBonusSale/cdtBonusManager từ siblings
 *       - sum totalReceivable
 *       - merge notes JSONB
 *       - transfer payments_in.reconciliationId → primary.id
 *       - delete siblings
 *
 * Chạy dry-run trước:  npx tsx scripts/migrate-revenue-recons-merge.ts --dry-run
 * Apply live:          npx tsx scripts/migrate-revenue-recons-merge.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import { sql, eq } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const DRY_RUN = process.argv.includes("--dry-run");

type Recon = {
  id: number;
  product_id: number;
  reconciliation_date: string | null;
  minutes_number: string | null;
  invoice_id: number | null;
  revenue_this_time: number;
  cdt_bonus_sale: number;
  cdt_bonus_manager: number;
  total_receivable_this_time: number;
  note: string | null;
  notes: Record<string, string>;
  created_at: string;
};

function dominantType(r: Recon): "commission" | "bonus_sale" | "bonus_manager" | null {
  if (r.revenue_this_time > 1000) return "commission";
  if (r.cdt_bonus_sale > 1000) return "bonus_sale";
  if (r.cdt_bonus_manager > 1000) return "bonus_manager";
  return null;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN — không ghi DB ===\n" : "=== LIVE MODE ===\n");

  // Load all recons
  const raw = await db.execute(sql`
    SELECT
      id, product_id, reconciliation_date, minutes_number, invoice_id,
      revenue_this_time::float8 AS revenue_this_time,
      cdt_bonus_sale::float8 AS cdt_bonus_sale,
      cdt_bonus_manager::float8 AS cdt_bonus_manager,
      total_receivable_this_time::float8 AS total_receivable_this_time,
      note,
      notes,
      created_at::text AS created_at
    FROM revenue_reconciliations
    ORDER BY created_at
  `);
  const recons = raw as unknown as Recon[];
  console.log(`Loaded ${recons.length} recons\n`);

  // ============================================================
  // Step 1: Populate notes JSONB từ field `note` cũ
  // ============================================================
  console.log("── Step 1: Populate notes JSONB từ field `note` cũ ──");
  let step1Populated = 0;
  let step1Skipped = 0;
  const step1Updates: Array<{ id: number; notes: Record<string, string> }> = [];
  for (const r of recons) {
    // Nếu notes đã có key, skip
    if (r.notes && Object.keys(r.notes).length > 0) {
      step1Skipped++;
      continue;
    }
    // Nếu không có note text, skip
    if (!r.note || !r.note.trim()) {
      step1Skipped++;
      continue;
    }
    const type = dominantType(r);
    if (!type) {
      step1Skipped++;
      continue;
    }
    const newNotes = { [type]: r.note.trim() };
    step1Updates.push({ id: r.id, notes: newNotes });
    // Cập nhật local để step 2 dùng
    r.notes = newNotes;
    step1Populated++;
  }
  console.log(`  Sẽ populate ${step1Populated} recons, skip ${step1Skipped}`);
  if (step1Populated > 0 && !DRY_RUN) {
    for (const u of step1Updates) {
      await db.execute(sql`
        UPDATE revenue_reconciliations
        SET notes = ${JSON.stringify(u.notes)}::jsonb
        WHERE id = ${u.id}
      `);
    }
    console.log(`  ✓ Đã populate ${step1Populated} recons\n`);
  }

  // ============================================================
  // Step 2: Detect mergeable groups (cùng product + invoice_id)
  // ============================================================
  console.log("── Step 2: Detect mergeable groups (cùng product + invoice_id) ──");
  const groups = new Map<string, Recon[]>();
  let unmergeableNoInvoice = 0;
  for (const r of recons) {
    if (r.invoice_id == null) {
      unmergeableNoInvoice++;
      continue;
    }
    const key = `${r.product_id}|${r.invoice_id}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const singleGroups = [...groups.values()].filter((g) => g.length === 1);
  const mergeGroups = [...groups.values()].filter((g) => g.length >= 2);
  const totalRowsToDelete = mergeGroups.reduce((s, g) => s + (g.length - 1), 0);
  console.log(`  Recons có invoice_id: ${recons.length - unmergeableNoInvoice}`);
  console.log(`  Recons invoice_id NULL (không merge được): ${unmergeableNoInvoice}`);
  console.log(`  Groups có 1 recon (giữ nguyên): ${singleGroups.length}`);
  console.log(`  Groups có ≥ 2 recons (sẽ merge): ${mergeGroups.length}`);
  console.log(`  Sẽ xóa ${totalRowsToDelete} rows sau merge`);
  console.log(`  Tổng recons sau merge: ${recons.length - totalRowsToDelete}\n`);

  // Check anomalies: cùng invoice_id nhưng khác reconciliation_date hoặc minutes_number
  const anomalies: string[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const dates = new Set(list.map((r) => r.reconciliation_date));
    const bbs = new Set(list.map((r) => r.minutes_number ?? ""));
    if (dates.size > 1) {
      anomalies.push(
        `Group ${key}: ${list.length} recons có ${dates.size} ngày ĐC khác nhau (${[...dates].join(", ")})`,
      );
    }
    if (bbs.size > 1) {
      anomalies.push(`Group ${key}: ${list.length} recons có ${bbs.size} số BB khác nhau`);
    }
  }
  if (anomalies.length > 0) {
    console.log("⚠️  ANOMALIES (recons cùng invoice_id nhưng khác date/BB):");
    anomalies.slice(0, 10).forEach((s) => console.log(`   ${s}`));
    if (anomalies.length > 10) console.log(`   ... và ${anomalies.length - 10} nữa`);
    console.log("");
  }

  // ============================================================
  // Sample groups sẽ merge (10 groups đầu)
  // ============================================================
  if (mergeGroups.length > 0) {
    console.log(`── Sample ${Math.min(10, mergeGroups.length)} groups sẽ merge ──`);
    for (const g of mergeGroups.slice(0, 10)) {
      const key = `product ${g[0].product_id} + invoice ${g[0].invoice_id}`;
      console.log(`\n  ${key}:`);
      for (const r of g) {
        const type = dominantType(r);
        const parts: string[] = [];
        if (r.revenue_this_time > 1000) parts.push(`revenue ${fmt(r.revenue_this_time)}`);
        if (r.cdt_bonus_sale > 1000) parts.push(`cdtSale ${fmt(r.cdt_bonus_sale)}`);
        if (r.cdt_bonus_manager > 1000)
          parts.push(`cdtMgr ${fmt(r.cdt_bonus_manager)}`);
        const noteStr =
          r.notes && Object.keys(r.notes).length > 0
            ? JSON.stringify(r.notes)
            : r.note
              ? `"${r.note}"`
              : "";
        console.log(
          `    #${r.id} [${type ?? "?"}] · ${r.reconciliation_date ?? "?"} · ${parts.join(" + ") || "(rỗng)"} ${noteStr}`,
        );
      }
      // Simulate merge
      const primary =
        g.find((r) => r.revenue_this_time > 1000) ??
        g.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      const mergedNotes: Record<string, string> = {};
      const merged = {
        revenue_this_time: 0,
        cdt_bonus_sale: 0,
        cdt_bonus_manager: 0,
        total_receivable_this_time: 0,
      };
      for (const r of g) {
        merged.revenue_this_time += r.revenue_this_time;
        merged.cdt_bonus_sale += r.cdt_bonus_sale;
        merged.cdt_bonus_manager += r.cdt_bonus_manager;
        merged.total_receivable_this_time += r.total_receivable_this_time;
        if (r.notes) Object.assign(mergedNotes, r.notes);
      }
      console.log(
        `    → merged into #${primary.id}: revenue=${fmt(merged.revenue_this_time)}, cdtSale=${fmt(merged.cdt_bonus_sale)}, cdtMgr=${fmt(merged.cdt_bonus_manager)}, total=${fmt(merged.total_receivable_this_time)}`,
      );
      console.log(`    → notes: ${JSON.stringify(mergedNotes)}`);
      console.log(
        `    → xóa ${g.length - 1} siblings (${g
          .filter((r) => r.id !== primary.id)
          .map((r) => `#${r.id}`)
          .join(", ")})`,
      );
    }
    if (mergeGroups.length > 10)
      console.log(`\n  ... và ${mergeGroups.length - 10} groups nữa`);
  }

  // ============================================================
  // Step 3: Live apply merge
  // ============================================================
  if (!DRY_RUN && mergeGroups.length > 0) {
    console.log("\n── Step 3: Apply merge live ──");
    let merged = 0;
    let paymentsTransferred = 0;
    for (const g of mergeGroups) {
      const primary =
        g.find((r) => r.revenue_this_time > 1000) ??
        g.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      const siblings = g.filter((r) => r.id !== primary.id);

      // Compute merged fields
      const mergedNotes: Record<string, string> = {};
      const totals = {
        revenue_this_time: 0,
        cdt_bonus_sale: 0,
        cdt_bonus_manager: 0,
        total_receivable_this_time: 0,
      };
      for (const r of g) {
        totals.revenue_this_time += r.revenue_this_time;
        totals.cdt_bonus_sale += r.cdt_bonus_sale;
        totals.cdt_bonus_manager += r.cdt_bonus_manager;
        totals.total_receivable_this_time += r.total_receivable_this_time;
        if (r.notes) Object.assign(mergedNotes, r.notes);
      }

      // Update primary
      await db.execute(sql`
        UPDATE revenue_reconciliations
        SET
          revenue_this_time = ${totals.revenue_this_time},
          cdt_bonus_sale = ${totals.cdt_bonus_sale},
          cdt_bonus_manager = ${totals.cdt_bonus_manager},
          total_receivable_this_time = ${totals.total_receivable_this_time},
          notes = ${JSON.stringify(mergedNotes)}::jsonb
        WHERE id = ${primary.id}
      `);

      // Transfer payments from siblings to primary
      for (const s of siblings) {
        const res = await db.execute(sql`
          UPDATE payments_in
          SET reconciliation_id = ${primary.id}
          WHERE reconciliation_id = ${s.id}
        `);
        paymentsTransferred += (res as unknown as { count?: number }).count ?? 0;
      }

      // Delete siblings
      for (const s of siblings) {
        await db.execute(sql`
          DELETE FROM revenue_reconciliations WHERE id = ${s.id}
        `);
      }
      merged++;
    }
    console.log(`  ✓ Merged ${merged} groups, transferred ${paymentsTransferred} payments`);
  }

  console.log(
    `\n=== ${DRY_RUN ? "DRY RUN DONE" : "LIVE APPLY DONE"} ===\n` +
      `Ban đầu: ${recons.length} recons\n` +
      `Sau merge: ~${recons.length - totalRowsToDelete} recons\n` +
      (DRY_RUN
        ? "\n👉 Xem output ở trên. Nếu OK, chạy lại KHÔNG có --dry-run để apply live.\n"
        : ""),
  );
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error("Lỗi:", err);
    await client.end();
    process.exit(1);
  });
