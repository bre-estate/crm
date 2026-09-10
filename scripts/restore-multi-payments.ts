/**
 * Sau import-fresh: khôi phục chi tiết "thu tiền nhiều lần" cho các đợt đối chiếu
 * doanh thu mà Excel gộp thành 1 dòng (Excel chỉ có 1 cột Ngày nhận / Số tiền).
 *
 * Nguồn: snapshot JSON trước import (backups/bre-crm-snapshot-<ts>.json).
 * Match đợt cũ ↔ đợt mới theo (product_code, tổng phải thu ±1 VND, ngày ĐC gần nhất).
 * Chỉ thay khi: đợt mới đang có đúng 1 payment và số tiền = tổng các payment cũ.
 *
 * Run: npx tsx scripts/restore-multi-payments.ts backups/<snapshot>.json        # dry-run
 *      npx tsx scripts/restore-multi-payments.ts backups/<snapshot>.json --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "fs";
import postgres from "postgres";

const file = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!file) { console.error("Thiếu đường dẫn snapshot"); process.exit(1); }
const snap = JSON.parse(fs.readFileSync(file, "utf8"));
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const oldProducts = new Map<number, string>(snap.products.map((p: any) => [p.id, p.productCode]));
  const oldRecons = new Map<number, any>(snap.revenueReconciliations.map((r: any) => [r.id, r]));
  const byRecon = new Map<number, any[]>();
  for (const p of snap.paymentsIn) {
    if (!byRecon.has(p.reconciliationId)) byRecon.set(p.reconciliationId, []);
    byRecon.get(p.reconciliationId)!.push(p);
  }
  const groups = [...byRecon.entries()]
    .filter(([, ps]) => ps.length > 1)
    .map(([rid, ps]) => {
      const r = oldRecons.get(rid);
      return {
        oldReconId: rid,
        productCode: oldProducts.get(r.productId),
        oldDate: r.reconciliationDate as string | null,
        total: Number(r.totalReceivableThisTime ?? 0),
        payments: ps
          // Data cũ có ngày lỗi năm "0026-..." → chuẩn hóa về "2026-..."
          .map((p) => ({ date: (p.paymentDate as string | null)?.replace(/^00(\d\d)-/, "20$1-") ?? null, amount: Number(p.amount ?? 0) }))
          .sort((a, b) => String(a.date).localeCompare(String(b.date))),
      };
    });
  console.log(`Snapshot: ${groups.length} đợt có >1 lần thu`);

  const newRecons = await sql<{ id: number; product_code: string; date: string | null; total: number }[]>`
    SELECT r.id, p.product_code, r.reconciliation_date::text AS date, r.total_receivable_this_time AS total
    FROM revenue_reconciliations r JOIN products p ON p.id = r.product_id`;
  const newPays = await sql<{ id: number; recon_id: number; date: string | null; amount: number }[]>`
    SELECT id, reconciliation_id AS recon_id, payment_date AS date, amount FROM payments_in`;
  const paysByRecon = new Map<number, { id: number; recon_id: number; date: string | null; amount: number }[]>();
  for (const p of newPays) {
    if (!paysByRecon.has(p.recon_id)) paysByRecon.set(p.recon_id, []);
    paysByRecon.get(p.recon_id)!.push(p);
  }

  let ok = 0;
  const skipped: string[] = [];
  const plan: { newReconId: number; deletePayId: number; inserts: { date: string | null; amount: number }[]; label: string }[] = [];
  for (const g of groups) {
    const sumOld = g.payments.reduce((s, p) => s + p.amount, 0);
    const cands = newRecons.filter(
      (r) => r.product_code === g.productCode && Math.abs(Number(r.total) - g.total) <= 1,
    );
    if (cands.length === 0) { skipped.push(`${g.productCode} ${g.oldDate} ${fmt(g.total)}: không tìm thấy đợt mới`); continue; }
    cands.sort((a, b) => Math.abs(Date.parse(a.date ?? "") - Date.parse(g.oldDate ?? "")) - Math.abs(Date.parse(b.date ?? "") - Date.parse(g.oldDate ?? "")));
    const target = cands[0];
    const ps = paysByRecon.get(target.id) ?? [];
    if (ps.length !== 1) { skipped.push(`${g.productCode} ${g.oldDate}: đợt mới #${target.id} có ${ps.length} payment`); continue; }
    if (Math.abs(Number(ps[0].amount) - sumOld) > 1) {
      skipped.push(`${g.productCode} ${g.oldDate}: Excel nhận ${fmt(Number(ps[0].amount))} ≠ tổng cũ ${fmt(sumOld)}`);
      continue;
    }
    plan.push({
      newReconId: target.id,
      deletePayId: ps[0].id,
      inserts: g.payments,
      label: `${g.productCode} ĐC ${target.date} (cũ ${g.oldDate}) ${fmt(g.total)} ← ${g.payments.map((p) => `${p.date}:${fmt(p.amount)}`).join(" + ")}`,
    });
    ok++;
  }
  console.log(`\nSẽ khôi phục ${ok}/${groups.length}:`);
  plan.forEach((p) => console.log("  " + p.label));
  if (skipped.length) { console.log(`\nBỏ qua ${skipped.length}:`); skipped.forEach((s) => console.log("  " + s)); }

  if (!APPLY) { console.log("\n(dry-run — thêm --apply để thực hiện)"); await sql.end(); return; }
  for (const p of plan) {
    await sql`DELETE FROM payments_in WHERE id = ${p.deletePayId}`;
    for (const ins of p.inserts) {
      await sql`INSERT INTO payments_in (reconciliation_id, payment_date, amount) VALUES (${p.newReconId}, ${ins.date}, ${ins.amount})`;
    }
  }
  const [c] = await sql`SELECT count(*) n, sum(amount)::bigint s FROM payments_in`;
  console.log(`\n✅ Đã khôi phục ${plan.length} đợt. payments_in: ${c.n} dòng, tổng ${fmt(Number(c.s))}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
