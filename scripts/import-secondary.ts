/**
 * Import "DTHU Thứ cấp" từ file Theo Dõi Doanh Thu BRE.xlsx → secondary_sales.
 * Excel cột: Mã sp | Dự án | Giá | Phòng | Nhân viên | Ngày cọc | Ngày hoàn thành | ĐC DT | DT về cty | %HH | Phí cty | Note | CK về Triết | Thành tiền
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import XLSX from "xlsx";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

const toNum = (v: any): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const toAmount = (v: any): number => Math.round(toNum(v));
const toStr = (v: any): string => (v == null ? "" : String(v).trim());

// Parse date: "10/11/2024" → "2024-11-10" (dd/mm/yyyy assumed from Excel VN)
function parseDate(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const n = Number(s);
  if (Number.isFinite(n) && n > 40000 && n < 60000) {
    const d = new Date((n - 25569) * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

async function main() {
  const wb = XLSX.readFile("data-excel/Theo Dõi Doanh Thu BRE.xlsx");
  const sh = wb.Sheets["DTHU Thứ cấp"];
  const rows: any[][] = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false });

  // Header row 3 (idx 3). Data từ row 4 (idx 4).
  let inserted = 0, skipped = 0, errored = 0;
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i] || [];
    const unitCode = toStr(r[1]);
    const salesPerson = toStr(r[5]);
    if (!unitCode || !salesPerson) { skipped++; continue; }

    const sellPrice = toAmount(r[3]);
    const totalFee = toAmount(r[9]); // Doanh thu về cty (thực tế là tổng phí)
    const rate = toNum(r[10]) / 100; // %HH NVKD (Excel dạng % text)
    const companyAmount = toAmount(r[11]); // Phí cty
    const noteStatus = toStr(r[12]); // Note (Done, etc)
    const thanhTien = toAmount(r[14]); // Thành tiền = commission cho NV
    const depositDate = parseDate(r[6]);
    const completionDate = parseDate(r[7]);
    const recognitionMonth = toStr(r[8]); // "2024-T10"
    const paidTrietStr = toStr(r[13]).toLowerCase();

    // commissionAmount = NV giữ = totalFee - companyAmount
    const commissionAmount = totalFee - companyAmount;

    try {
      await sql`
        INSERT INTO secondary_sales (
          unit_code, project_name, sell_price, sales_person,
          deposit_date, completion_date, recognition_month,
          total_fee, commission_rate, commission_amount, company_amount,
          settlement_status, status, note, source_file
        ) VALUES (
          ${unitCode}, ${toStr(r[2])}, ${sellPrice}, ${salesPerson},
          ${depositDate}, ${completionDate}, ${recognitionMonth},
          ${totalFee}, ${rate > 0 ? rate : 0.5}, ${commissionAmount}, ${companyAmount},
          ${noteStatus.toLowerCase().includes("done") ? "settled" : "pending"},
          ${noteStatus.toLowerCase().includes("done") ? "done" : "processing"},
          ${noteStatus || null},
          'excel-tddt'
        )`;
      inserted++;
    } catch (e: any) {
      errored++;
      if (errored <= 3) console.warn(`Row ${i}: ${e.message?.slice(0, 100)}`);
    }
  }
  console.log(`\n✅ Import xong: ${inserted} rows, ${skipped} skip, ${errored} lỗi`);

  const [stats] = await sql`SELECT COUNT(*)::int as n, SUM(total_fee)::float8 as total, SUM(company_amount)::float8 as company FROM secondary_sales`;
  console.log(`Tổng DB: ${stats.n} giao dịch, tổng phí ${Math.round(Number(stats.total)).toLocaleString('vi-VN')}, cty ${Math.round(Number(stats.company)).toLocaleString('vi-VN')}`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
