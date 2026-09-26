/**
 * So Kim ACCRUAL (dồn tích) vs CRM CASH (dòng tiền) theo từng loại chi phí.
 * Nguyên tắc: Tổng CẢ NĂM phải bằng nhau. Chênh theo tháng chấp nhận (timing).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const fmt = (n: number | string) => Math.round(Number(n)).toLocaleString("vi-VN");

async function kimAccrualPerMonth(tk: string): Promise<Map<string, number>> {
  // Accrual = TK debit ghi nhận chi phí phát sinh mỗi tháng (Nợ TK / Có 331 hoặc 3341...)
  // Bỏ dòng closing (chống double: TK debit → 911 credit ở cuối năm)
  const rows = await sql`
    SELECT substr(entry_date, 1, 7) as month, SUM(amount)::float8 as s
    FROM accounting_journal
    WHERE debit_account = ${tk} AND credit_account != '911'
    GROUP BY substr(entry_date, 1, 7) ORDER BY month`;
  return new Map(rows.map((r: any) => [r.month, Number(r.s)]));
}

// Kim actual cash pay per month for a given expense TK.
// Logic: Kim ghi accrual "Nợ TK / Có 331" → sau ghi "Nợ 331 / Có 11211" khi trả.
// Nhưng không luôn qua 331 — có thể trực tiếp "Nợ TK / Có 11211" nếu chi thẳng.
// → Search by description keyword matching + cross-check amounts.
async function kimCashPerMonth(regexPattern: string): Promise<Map<string, number>> {
  const rows = await sql`
    SELECT substr(entry_date, 1, 7) as month, SUM(amount)::float8 as s
    FROM accounting_journal
    WHERE credit_account = '11211'
      AND description ~* ${regexPattern}
    GROUP BY substr(entry_date, 1, 7) ORDER BY month`;
  return new Map(rows.map((r: any) => [r.month, Number(r.s)]));
}

async function crmCashPerMonth(categoryCode: string): Promise<Map<string, number>> {
  const rows = await sql`
    SELECT transaction_month as month, SUM(amount)::float8 as s
    FROM financial_transactions
    WHERE transaction_month LIKE '2025-%' AND direction = 'out' AND category_code = ${categoryCode}
    GROUP BY transaction_month ORDER BY month`;
  return new Map(rows.map((r: any) => [r.month, Number(r.s)]));
}

async function printCompare(title: string, kimAccrual: Map<string, number>, kimCash: Map<string, number>, crmCash: Map<string, number>) {
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`${title}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  const months = new Set([...kimAccrual.keys(), ...kimCash.keys(), ...crmCash.keys()]);
  const sortedMonths = [...months].filter(m => m.startsWith("2025")).sort();
  console.log(`${"Tháng".padEnd(8)} ${"Kim accrual".padStart(14)} ${"Kim đã trả".padStart(14)} ${"CRM".padStart(14)}  Match`);
  console.log("─".repeat(80));
  let kaT = 0, kcT = 0, crT = 0;
  for (const m of sortedMonths) {
    const ka = kimAccrual.get(m) ?? 0;
    const kc = kimCash.get(m) ?? 0;
    const cr = crmCash.get(m) ?? 0;
    kaT += ka; kcT += kc; crT += cr;
    const matchKimCr = Math.abs(kc - cr);
    const flag = kc === 0 && cr === 0 ? "" : matchKimCr < 100 ? "✅" : matchKimCr / Math.max(kc, 1) < 0.05 ? "~" : "❌";
    console.log(`${m.padEnd(8)} ${fmt(ka).padStart(14)} ${fmt(kc).padStart(14)} ${fmt(cr).padStart(14)}  ${flag}`);
  }
  console.log("─".repeat(80));
  console.log(`${"TỔNG".padEnd(8)} ${fmt(kaT).padStart(14)} ${fmt(kcT).padStart(14)} ${fmt(crT).padStart(14)}`);
  const gapAccrualCash = kaT - kcT;
  const gapKimCashCrm = kcT - crT;
  console.log(`  Chênh Kim accrual vs Kim cash: ${fmt(gapAccrualCash)} (${gapAccrualCash === 0 ? "đã trả sạch" : gapAccrualCash > 0 ? "còn nợ" : "trả dư"})`);
  console.log(`  Chênh Kim cash vs CRM:         ${fmt(gapKimCashCrm)} ${Math.abs(gapKimCashCrm) < 100_000 ? "✅ khớp" : "❌ CRM thiếu " + fmt(Math.abs(gapKimCashCrm))}`);
}

async function main() {
  // ========================================
  // THUÊ VP + TIỆN ÍCH (6427)
  // ========================================
  await printCompare(
    "🏢 THUÊ VP + TIỆN ÍCH + DỊCH VỤ (Kim TK 6427)",
    await kimAccrualPerMonth("6427"),
    await kimCashPerMonth("thue nha|thuê nhà|thue VP|thuê VP|thuê văn phòng|thue van phong|internet|wifi|đồng phục|dong phuc|phí dịch vụ|phi dich vu"),
    await crmCashPerMonth("6427"),
  );

  // ========================================
  // LƯƠNG NVKD (6411)
  // ========================================
  await printCompare(
    "👨‍💼 LƯƠNG NVKD (Kim TK 6411)",
    await kimAccrualPerMonth("6411"),
    await kimCashPerMonth("luong.*(NVKD|Bách|Thành|Nhật|Linh|CTV|thu lao|Hong Yen)|luong thu viec|thu lao CTV"),
    await crmCashPerMonth("6411"),
  );

  // ========================================
  // LƯƠNG ADMIN + KẾ TOÁN (6421)
  // ========================================
  await printCompare(
    "👩‍💼 LƯƠNG ADMIN + KẾ TOÁN (Kim TK 6421)",
    await kimAccrualPerMonth("6421"),
    await kimCashPerMonth("luong.*(admin|Tường Vi|Thịnh|Kim)|phi dich vu ke toan|ke toan"),
    await crmCashPerMonth("6421"),
  );

  // ========================================
  // BHXH CTY ĐÓNG (3383 + 3384 + 3386)
  // ========================================
  const bhxhKim = new Map<string, number>();
  for (const tk of ["3383", "3384", "3386"]) {
    const m = await kimAccrualPerMonth(tk);
    for (const [k, v] of m) bhxhKim.set(k, (bhxhKim.get(k) ?? 0) + v);
  }
  await printCompare(
    "🏥 BHXH + BHYT + BHTN CTY ĐÓNG (Kim TK 3383+3384+3386)",
    bhxhKim,
    await kimCashPerMonth("BHXH|BHYT|BHTN"),
    await crmCashPerMonth("3383"),
  );

  // ========================================
  // HH SALE + MARKETING + THƯỞNG (6417)
  // ========================================
  const crmHHsale = await crmCashPerMonth("6417");
  await printCompare(
    "💰 HH SALE + MARKETING + THƯỞNG (Kim TK 6417)",
    await kimAccrualPerMonth("6417"),
    await kimCashPerMonth("hoa hong|hoa hồng|thuong nong|thưởng nóng|thu lao|thù lao|thuong QL|KPI QL|thuong doanh so|thưởng doanh số|ho tro can|hỗ trợ căn"),
    crmHHsale,
  );

  // ========================================
  // ĐỒ DÙNG VP (6423)
  // ========================================
  await printCompare(
    "🖇 ĐỒ DÙNG VP (Kim TK 6423)",
    await kimAccrualPerMonth("6423"),
    await kimCashPerMonth("do dung"),
    await crmCashPerMonth("6423"),
  );

  // ========================================
  // CHI PHÍ KHÁC (811)
  // ========================================
  await printCompare(
    "📎 CHI PHÍ KHÁC KHÔNG HÓA ĐƠN (Kim TK 811)",
    await kimAccrualPerMonth("811"),
    new Map(), // Kim rarely tracks cash directly for 811
    await crmCashPerMonth("811"),
  );

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
