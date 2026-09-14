/**
 * Đọc sổ chi cá nhân của founder trên Drive → bảng founder_spending.
 * File nguồn: 4-Kế Toán - BRE/0.2-Sổ quản lý chung/Chi phí cá nhân/0.2.6-Chi phí cá nhân - Vốn góp.xlsx
 * Nạp lại được nhiều lần: xóa sạch bảng rồi ghi lại từ file.
 *
 *   npx tsx scripts/import-chi-phi-ca-nhan.ts            # xem trước
 *   npx tsx scripts/import-chi-phi-ca-nhan.ts --apply    # ghi
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { classifyFounderSpend, isCompanySpend, isDeposit, type FounderSpendRow } from "../lib/founder-spending-core";

const FILE = process.env.CHI_PHI_CA_NHAN_FILE ?? path.resolve(process.env.HOME ?? "",
  "Documents/Company/BRE/App/Drive/4-Kế Toán - BRE/0.2-Sổ quản lý chung/Chi phí cá nhân/0.2.6-Chi phí cá nhân - Vốn góp.xlsx");
const APPLY = process.argv.includes("--apply");

const nfc = (s: unknown) => String(s ?? "").normalize("NFC").trim();
const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0);

/** "15/08/2025" → "2025-08-15"; không đọc được thì lấy mùng 1 của tháng; vẫn không được thì null. */
function toDate(v: unknown, month: string): string | null {
  const ok = (d: string) => (Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()) ? null : d);
  const m = nfc(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = ok(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
    if (d) return d;
  }
  return /^\d{4}-\d{2}$/.test(month) ? ok(`${month}-01`) : null;
}

function read(): FounderSpendRow[] {
  const wb = XLSX.read(fs.readFileSync(FILE));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Chi tiết"], { defval: null });
  return rows
    .filter((r) => nfc(r["Tháng"]) && num(r["Số tiền"]))
    .map((r) => ({
      month: nfc(r["Tháng"]),
      date: toDate(r["Ngày chi"], nfc(r["Tháng"])),
      person: nfc(r["Người chi"]),
      title: nfc(r["Hạng mục"]),
      detail: nfc(r["Chi tiết"]),
      payee: nfc(r["Người nhận / NCC"]),
      amount: num(r["Số tiền"]),
      capital: nfc(r["Tính vốn góp"]),
      note: nfc(r["Note"]),
      source: nfc(r["Nguồn dòng"]),
    })) as (FounderSpendRow & { note: string; source: string })[];
}

async function main() {
  const rows = read();
  const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
  const byCat = new Map<string, number>(), byYear = new Map<string, number>();
  let capital = 0, spend = 0, deposit = 0;
  for (const r of rows) {
    const cat = classifyFounderSpend(r);
    if (r.capital === "Có") capital += r.amount;
    if (isDeposit(r)) deposit += r.amount;
    if (isCompanySpend(r)) {
      spend += r.amount;
      byCat.set(cat, (byCat.get(cat) ?? 0) + r.amount);
      byYear.set(r.month.slice(0, 4), (byYear.get(r.month.slice(0, 4)) ?? 0) + r.amount);
    }
  }
  console.log(`${rows.length} dòng từ ${path.basename(FILE)}`);
  console.log(`  Vốn góp (cột Tính vốn góp = Có): ${fmt(capital)}`);
  console.log(`  Nộp vào tài khoản công ty, sao kê đã có: ${fmt(deposit)}`);
  console.log(`  Công ty đã tiêu, sẽ cộng vào báo cáo: ${fmt(spend)}`);
  console.log("  Theo năm: " + [...byYear.entries()].sort().map(([y, v]) => `${y} ${fmt(v)}`).join(" · "));
  console.log("  Theo nhóm:");
  for (const [c, v] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) console.log(`     ${c.padEnd(16)} ${fmt(v).padStart(14)}`);

  if (!APPLY) { console.log("\n(chạy thử, thêm --apply để ghi)"); return; }
  const sql = postgres(process.env.DATABASE_URL!);
  await sql.unsafe(fs.readFileSync("drizzle/0046_founder_spending.sql", "utf8"));
  await sql`TRUNCATE founder_spending RESTART IDENTITY`;
  for (const r of rows as (FounderSpendRow & { note: string; source: string })[]) {
    await sql`INSERT INTO founder_spending (month, spend_date, person, title, detail, note, payee, amount, capital_note, is_deposit, is_company_spend, category, source_row)
      VALUES (${r.month}, ${r.date}, ${r.person}, ${r.title}, ${r.detail}, ${r.note}, ${r.payee}, ${r.amount},
              ${r.capital}, ${isDeposit(r)}, ${isCompanySpend(r)}, ${classifyFounderSpend(r)}, ${r.source})`;
  }
  console.log(`\nĐã ghi ${rows.length} dòng vào founder_spending.`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
