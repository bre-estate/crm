/**
 * Import sheet "1.1-Đề nghị thanh toán" → payment_requests.
 * Chi tiết per person / per approval, dedup by 'dntt-{stt}'.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import XLSX from "xlsx";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

// Parse Vietnamese number: "125,397,899" or " 125,397,899 " → 125397899
function parseVN(s: any): number {
  if (typeof s === "number") return s;
  const str = String(s ?? "").replace(/[\s,]/g, "").replace(/\s?₫/g, "").trim();
  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

// Parse date: "5-Jan-2026", "22-Jun-2026", "12/5/2025" → "YYYY-MM-DD"
const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
function parseDate(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // dd-Mmm-yyyy
  const m1 = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m1) {
    const mm = MONTHS[m1[2].toLowerCase()];
    if (!mm) return null;
    return `${m1[3]}-${mm}-${m1[1].padStart(2, "0")}`;
  }
  // m/d/yyyy or mm/dd/yyyy
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  // Excel serial
  const n = Number(s);
  if (Number.isFinite(n) && n > 40000 && n < 60000) {
    const d = new Date((n - 25569) * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

async function main() {
  const wb = XLSX.readFile("data-excel/Chi phí/So theo doi thanh toan.xlsx");
  const sheet = wb.Sheets["1.1-Đề nghị thanh toán"];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

  // Header ở row 8-9. Data từ row 10 trở đi.
  // Cols theo header:
  //   0: STT
  //   1: Ngày đề nghị
  //   2: Người đề nghị
  //   3: Bộ phận
  //   4: Chi tiết khoản thanh toán
  //   5: Số tiền ĐNTT
  //   6: Hồ sơ chứng từ kèm
  //   8: Hình thức thanh toán
  //   9: Nội dung chuyển khoản
  //  10: Người nhận tiền
  //  11: STK người nhận
  //  12: Ngân hàng
  //  13: Người kiểm tra (Kim)
  //  14: Ngày kiểm tra
  //  15: Kết quả kiểm tra (Đồng ý...)
  //  16-18: Phê duyệt
  //  19+: Thanh toán thực tế

  let inserted = 0, skipped = 0, invalid = 0, errored = 0;

  for (let i = 10; i < rows.length; i++) {
    try {
    const r = rows[i] || [];
    const stt = Number(r[0]);
    if (!Number.isFinite(stt) || stt <= 0) continue;
    const amount = parseVN(r[5]);
    if (amount <= 0) { invalid++; continue; }

    const dedupKey = `dntt-${stt}`;
    const record = {
      stt,
      requestDate: parseDate(r[1]),
      requester: String(r[2] ?? "").trim() || null,
      department: String(r[3] ?? "").trim() || null,
      detail: String(r[4] ?? "").trim() || null,
      amount,
      attachments: String(r[6] ?? "").trim() || null,
      paymentMethod: String(r[8] ?? "").trim() || null,
      transferContent: String(r[9] ?? "").trim() || null,
      recipient: String(r[10] ?? "").trim() || null,
      recipientAccount: String(r[11] ?? "").trim() || null,
      recipientBank: String(r[12] ?? "").trim() || null,
      reviewedBy: String(r[13] ?? "").trim() || null,
      reviewedAt: parseDate(r[14]),
      reviewedStatus: String(r[15] ?? "").trim() || null,
      approvedBy: String(r[16] ?? "").trim() || null,
      approvedAt: parseDate(r[17]),
      paidAt: parseDate(r[19]),
      sourceRow: i,
      dedupKey,
    };

    const res = await sql`
      INSERT INTO payment_requests (
        stt, request_date, requester, department, detail, amount,
        attachments, payment_method, transfer_content, recipient,
        recipient_account, recipient_bank, reviewed_by, reviewed_at,
        reviewed_status, approved_by, approved_at, paid_at,
        source_row, dedup_key
      ) VALUES (
        ${record.stt}, ${record.requestDate}, ${record.requester}, ${record.department},
        ${record.detail}, ${record.amount}, ${record.attachments}, ${record.paymentMethod},
        ${record.transferContent}, ${record.recipient}, ${record.recipientAccount},
        ${record.recipientBank}, ${record.reviewedBy}, ${record.reviewedAt},
        ${record.reviewedStatus}, ${record.approvedBy}, ${record.approvedAt},
        ${record.paidAt}, ${record.sourceRow}, ${record.dedupKey}
      )
      ON CONFLICT (dedup_key) DO UPDATE SET
        request_date = EXCLUDED.request_date,
        requester = EXCLUDED.requester,
        department = EXCLUDED.department,
        detail = EXCLUDED.detail,
        amount = EXCLUDED.amount,
        attachments = EXCLUDED.attachments,
        payment_method = EXCLUDED.payment_method,
        transfer_content = EXCLUDED.transfer_content,
        recipient = EXCLUDED.recipient,
        recipient_account = EXCLUDED.recipient_account,
        recipient_bank = EXCLUDED.recipient_bank,
        reviewed_by = EXCLUDED.reviewed_by,
        reviewed_at = EXCLUDED.reviewed_at,
        reviewed_status = EXCLUDED.reviewed_status,
        paid_at = EXCLUDED.paid_at
      RETURNING (xmax = 0) as inserted`;
    if (res[0]?.inserted) inserted++; else skipped++;
    } catch (e: any) {
      errored++;
      console.warn(`⚠️  Row ${i}: ${e.message?.slice(0, 150)}`);
    }
  }

  console.log(`\n✅ Import xong: ${inserted} rows mới, ${skipped} rows update, ${invalid} rows bỏ (amount<=0), ${errored} rows lỗi`);

  const stat = await sql`
    SELECT COUNT(*) as n, SUM(amount)::float8 as s,
      MIN(request_date) as min_d, MAX(request_date) as max_d
    FROM payment_requests`;
  console.log(`Tổng payment_requests: ${stat[0].n} rows, ${Math.round(Number(stat[0].s)).toLocaleString('vi-VN')} VND`);
  console.log(`Range: ${stat[0].min_d} → ${stat[0].max_d}`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
