/**
 * Import 19 hợp đồng từ sheet 1_HOP DONG (BAO CAO DOANH THU.xlsx) → contracts table.
 * Sau import: link project_id + partner_id qua match project_code + partner_name.
 *
 * Usage: cd BRE/App/CRM && npx tsx scripts/import-contracts.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import ExcelJS from "exceljs";
import postgres from "postgres";
import fs from "fs";
import path from "path";

const FILE = "data-excel/BAO CAO DOANH THU.xlsx";
const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function str(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r: any) => r.text ?? "").join("");
    if ("result" in v) return str((v as any).result);
    if ("text" in v) return str((v as any).text);
  }
  return String(v).trim();
}
function num(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "result" in v) return num((v as any).result);
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? null : n;
}

async function main() {
  const { runWithImportLog } = await import("../lib/import-log");
  await runWithImportLog({
    scriptName: "import-contracts",
    sourceFile: FILE,
    targetTable: "contracts",
  }, async (log) => {
    // Migration
    const mig = fs.readFileSync("drizzle/0036_contracts.sql", "utf-8");
    await sql.unsafe(mig);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(FILE);
    const ws = wb.getWorksheet("1_HOP DONG");
    if (!ws) throw new Error("Sheet 1_HOP DONG không tồn tại");

    // Load projects + partners for FK lookup
    const projects = await sql<Array<{ id: number; code: string; name: string }>>`
      SELECT id, full_code as code, name FROM projects
    `;
    const partners = await sql<Array<{ id: number; name: string }>>`SELECT id, name FROM partners`;

    const projByCode = new Map(projects.map(p => [p.code, p.id]));
    const partnerByName = new Map(partners.map(p => [p.name.toLowerCase(), p.id]));

    // Clear existing
    await sql`DELETE FROM contracts`;
    console.log("Cleared existing contracts");

    const rows: any[] = [];
    // Data row 9+ (header row 8)
    for (let i = 9; i <= 30; i++) {
      const row = ws.getRow(i);
      const projectCode = str(row.getCell(2).value);
      if (!projectCode || projectCode === "#N/A") continue;

      const partnerName = str(row.getCell(4).value);
      const projectId = projByCode.get(projectCode) ?? null;
      const partnerId = partnerName ? partnerByName.get(partnerName.toLowerCase()) ?? null : null;

      rows.push({
        project_code: projectCode,
        project_id: projectId,
        partner_id: partnerId,
        partner_name: partnerName || null,
        contract_number: str(row.getCell(5).value) || null,
        status: str(row.getCell(6).value) === "ĐÃ KÝ" ? "active" : "unknown",
        pmg_lk: num(row.getCell(7).value),
        pmg_structure: str(row.getCell(8).value) || null,
        pmg_lk_sale: num(row.getCell(9).value),
        admin_fee: num(row.getCell(10).value),
        admin_fee_sale: num(row.getCell(11).value),
        payment_phases: num(row.getCell(12).value),
        pmg_phase_1: str(row.getCell(13).value) || null,
        pmg_phase_2: str(row.getCell(14).value) || null,
        pmg_phase_3: str(row.getCell(15).value) || null,
        pmg_phase_4: str(row.getCell(16).value) || null,
        pmg_phase_5: str(row.getCell(17).value) || null,
        cdt_bonus_sale: num(row.getCell(18).value),
        cdt_bonus_manager: str(row.getCell(19).value) || null,
        source_file: path.basename(FILE),
        source_row: i,
      });
    }

    console.log(`\nImporting ${rows.length} contracts...`);
    let created = 0, unmatchedProj = 0, unmatchedPartner = 0;
    for (const r of rows) {
      await sql`INSERT INTO contracts ${sql(r)}`;
      created++;
      if (!r.project_id) unmatchedProj++;
      if (!r.partner_id) unmatchedPartner++;
    }
    console.log(`✅ Created ${created} contracts`);
    console.log(`⚠️  ${unmatchedProj} không match project (code không có trong projects table)`);
    console.log(`⚠️  ${unmatchedPartner} không match partner`);

    log.created = created;
    log.details = { unmatched_project: unmatchedProj, unmatched_partner: unmatchedPartner };

    // Show list
    console.log("\n═══ Contracts đã import ═══");
    const list = await sql`
      SELECT c.id, c.project_code, c.partner_name, c.pmg_lk, c.pmg_lk_sale, c.admin_fee, c.project_id, c.partner_id
      FROM contracts c ORDER BY c.project_code, c.partner_name`;
    for (const c of list) {
      const proj = c.project_id ? "✓" : "✗";
      const part = c.partner_id ? "✓" : "✗";
      console.log(`  ${c.project_code.padEnd(12)} ${(c.partner_name || "?").padEnd(20)} PMG=${c.pmg_lk ?? "?"} sale=${c.pmg_lk_sale ?? "?"} admin=${c.admin_fee ?? "?"}  proj${proj} partner${part}`);
    }

    await sql.end();
  });
}
main().catch(e => { console.error(e); process.exit(1); });
