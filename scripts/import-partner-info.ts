/**
 * Import thông tin pháp lý partner (legal_name, tax_code, address, email) từ sheet 1_HOP DONG.
 * Cột nguồn: 25=TÊN ĐỐI TÁC (pháp nhân), 26=MST, 27=ĐỊA CHỈ, 28=EMAIL.
 * Match qua partner_name (col 4) với partners.name.
 *
 * Chỉ UPDATE trường nào đang NULL/rỗng — không ghi đè giá trị user đã sửa tay.
 *
 * Usage: cd BRE/App/CRM && npx tsx scripts/import-partner-info.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import ExcelJS from "exceljs";
import postgres from "postgres";
import path from "path";

const FILE = "data-excel/BAO CAO DOANH THU.xlsx";
const sql = postgres(process.env.DATABASE_URL!);

function str(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r: any) => r.text ?? "").join("").trim();
    if ("result" in v) return str((v as any).result);
    if ("text" in v) return str((v as any).text);
  }
  return String(v).trim();
}

async function main() {
  const { runWithImportLog } = await import("../lib/import-log");
  await runWithImportLog({
    scriptName: "import-partner-info",
    sourceFile: FILE,
    targetTable: "partners",
  }, async (log) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(FILE);
    const ws = wb.getWorksheet("1_HOP DONG");
    if (!ws) throw new Error("Sheet 1_HOP DONG không tồn tại");

    const partners = await sql<Array<{
      id: number; name: string; legal_name: string | null; tax_code: string | null;
      address: string | null; email: string | null; phone: string | null;
    }>>`SELECT id, name, legal_name, tax_code, address, email, phone FROM partners`;
    const partnerByName = new Map(partners.map(p => [p.name.toLowerCase(), p]));

    // Dedup theo tax_code (MST unique per pháp nhân — 1 partner có thể xuất hiện nhiều lần)
    const byPartner = new Map<string, {
      partnerName: string;
      legalName: string;
      taxCode: string;
      address: string;
      email: string;
      rows: number[];
    }>();

    for (let i = 9; i <= 30; i++) {
      const row = ws.getRow(i);
      const partnerName = str(row.getCell(4).value);
      if (!partnerName) continue;

      const legalName = str(row.getCell(25).value);
      const taxCode = str(row.getCell(26).value);
      const address = str(row.getCell(27).value);
      const email = str(row.getCell(28).value);

      if (!legalName && !taxCode && !address && !email) continue;

      const key = partnerName.toLowerCase();
      const existing = byPartner.get(key);
      if (!existing) {
        byPartner.set(key, { partnerName, legalName, taxCode, address, email, rows: [i] });
      } else {
        // Multi-row per partner — pick non-empty values (first found wins)
        if (!existing.legalName && legalName) existing.legalName = legalName;
        if (!existing.taxCode && taxCode) existing.taxCode = taxCode;
        if (!existing.address && address) existing.address = address;
        if (!existing.email && email) existing.email = email;
        existing.rows.push(i);
      }
    }

    console.log(`Đọc ${byPartner.size} partner có thông tin pháp lý từ Excel.\n`);

    let updated = 0, notFound = 0, skipped = 0;
    for (const info of byPartner.values()) {
      const p = partnerByName.get(info.partnerName.toLowerCase());
      if (!p) {
        console.log(`  ✗ ${info.partnerName} — không có trong bảng partners`);
        notFound++;
        continue;
      }

      // Chỉ update field đang NULL/rỗng
      const patch: Record<string, string> = {};
      if (!p.legal_name && info.legalName) patch.legal_name = info.legalName;
      if (!p.tax_code && info.taxCode) patch.tax_code = info.taxCode;
      if (!p.address && info.address) patch.address = info.address;
      if (!p.email && info.email) patch.email = info.email;

      if (Object.keys(patch).length === 0) {
        skipped++;
        continue;
      }

      await sql`UPDATE partners SET ${sql(patch)} WHERE id = ${p.id}`;
      updated++;
      const cols = Object.keys(patch).join(", ");
      console.log(`  ✓ ${p.name.padEnd(24)} ← ${cols}`);
    }

    console.log(`\n✅ Đã update ${updated} partners, skip ${skipped} (đã có sẵn), không match ${notFound}`);
    log.updated = updated;
    log.skipped = skipped;
    log.details = { not_found: notFound };

    await sql.end();
  });
}
main().catch(e => { console.error(e); process.exit(1); });
