/**
 * Backfill invoices từ Excel 2.2 col D (Ngày Inv) + col E (Số Inv).
 * Insert vào invoices table, link revenue_reconciliations.invoiceId.
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

const normUnit = (s: string) => s.replace(/[.\-\s]/g, "").toLowerCase();
const daysDiff = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

async function main() {
  const wb = XLSX.readFile("/Users/trietnguyen/Documents/Company/BRE/App/CRM/BAO CAO DOANH THU.xlsx");
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["2.2_Doanh thu"], { header: 1, defval: null });

  const products = await c`SELECT id, product_code, unit_code FROM products`;
  const projs = await c`SELECT id, partner_id FROM projects`;
  const productByCode = new Map(products.map((p) => [p.product_code, p.id]));
  const productByUnitNorm = new Map<string, number>();
  const productToPartner = new Map<number, number | null>();
  for (const p of products) {
    if (p.unit_code) productByUnitNorm.set(normUnit(p.unit_code), p.id);
  }

  // Get partnerId per product (via project.partner_id)
  const prods = await c`
    SELECT p.id, p.project_id, pr.partner_id
    FROM products p LEFT JOIN projects pr ON pr.id = p.project_id
  `;
  for (const p of prods) productToPartner.set(p.id, p.partner_id);

  // Load existing invoices to dedupe
  const existingInvoices = await c`SELECT id, invoice_number, invoice_date, partner_id FROM invoices`;
  const invoiceKey = (n: string, d: string | null, pid: number | null) => `${n}|${d ?? ""}|${pid ?? ""}`;
  const invoiceMap = new Map<string, number>();
  for (const inv of existingInvoices) {
    invoiceMap.set(invoiceKey(inv.invoice_number, inv.invoice_date, inv.partner_id), inv.id);
  }
  console.log(`Existing invoices: ${existingInvoices.length}`);

  // Load recons
  const recons = await c`
    SELECT id, product_id, reconciliation_date, total_receivable_this_time, invoice_id
    FROM revenue_reconciliations
  `;
  type ReconRow = (typeof recons)[number];
  const reconsByProduct = new Map<number, ReconRow[]>();
  for (const r of recons) {
    if (!reconsByProduct.has(r.product_id)) reconsByProduct.set(r.product_id, [] as ReconRow[]);
    reconsByProduct.get(r.product_id)!.push(r);
  }

  let inserted = 0;
  let linked = 0;
  let skipped = 0;
  const skipList: string[] = [];

  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const invDate = excelDate(r[3]);
    const invNumRaw = r[4];
    if (!invDate || invNumRaw == null || invNumRaw === "") continue;
    const invNum = String(invNumRaw).trim();

    const productCode = String(r[6] ?? "").trim();
    const unitCode = String(r[7] ?? "").trim();
    let productId = productByCode.get(productCode) ?? productByUnitNorm.get(normUnit(unitCode));
    if (!productId) {
      skipped++;
      if (skipList.length < 5) skipList.push(`row ${i + 1}: no product ${productCode}/${unitCode}`);
      continue;
    }

    const partnerId = productToPartner.get(productId) ?? null;
    const reconDate = excelDate(r[1]);
    const totalRec = Number(r[26] ?? 0);
    const invValue = Number(r[5] ?? 0) || totalRec;

    // Find matching recon by (product, date within 3 days, totalRec close)
    const cands = reconsByProduct.get(productId) ?? [];
    let match: (typeof recons)[number] | undefined;
    for (const c of cands) {
      const dd = c.reconciliation_date && reconDate ? daysDiff(c.reconciliation_date, reconDate) : 999;
      if (dd > 3) continue;
      if (Math.abs(Number(c.total_receivable_this_time) - totalRec) > Math.max(500, totalRec * 0.005)) continue;
      match = c;
      break;
    }
    if (!match) {
      skipped++;
      if (skipList.length < 5) skipList.push(`row ${i + 1}: no matching recon`);
      continue;
    }

    // Get or create invoice
    const key = invoiceKey(invNum, invDate, partnerId);
    let invId: number = invoiceMap.get(key) ?? 0;
    if (!invId) {
      if (APPLY) {
        const ins = await c`
          INSERT INTO invoices (invoice_number, invoice_date, partner_id, total_amount_vat)
          VALUES (${invNum}, ${invDate}, ${partnerId ?? null}, ${invValue})
          RETURNING id
        `;
        invId = Number(ins[0].id);
      } else {
        invId = -1;
      }
      invoiceMap.set(key, invId);
      inserted++;
    }

    // Link recon.invoiceId
    if (match.invoice_id !== invId) {
      if (APPLY) {
        await c`UPDATE revenue_reconciliations SET invoice_id = ${invId} WHERE id = ${match.id}`;
      }
      linked++;
    }
  }

  console.log(`\nInvoices ${APPLY ? "inserted" : "would insert"}: ${inserted}`);
  console.log(`Recons ${APPLY ? "linked" : "would link"}: ${linked}`);
  console.log(`Skipped: ${skipped}`);
  if (skipList.length > 0) skipList.forEach((s) => console.log(`  ${s}`));
  console.log(`\n${APPLY ? "✅ APPLIED" : "(dry-run, add --apply)"}`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
