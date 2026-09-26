/**
 * Tách 6421 hiện tại (đang gộp cả lương NVKD + admin) thành:
 *   - 6411: recipient ∈ NVKD (Bách, Thành, Nhật, các CTV/TV)
 *   - 6421: recipient ∈ Admin (Vi, Tường Vi, Nga, kế toán)
 *
 * BHXH cty chịu (nộp cho BHXH Bình Thạnh) — không tách theo NV được, giữ 6421.
 */

import { db } from "../lib/db";
import { financialTransactions } from "../lib/schema";
import { eq, sql, and, or, ilike } from "drizzle-orm";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Danh sách sale/NVKD (Bách là quản lý sàn nhưng gắn doanh số → xếp bán hàng
// theo báo cáo Kim 2025 6411 ≈ 198M ≈ lương Bách 12 tháng).
const NVKD_KEYWORDS = [
  "bách", "bach",
  "thành", "thanh nguyễn công", "thanh nguyen cong", "hồ nguyễn công",
  "nhật", "nhat", "trần minh nhật", "tran minh nhat",
  "cẩm giang", "cam giang",
  "duyên", "duyen",
  "thanh thúy", "thanh thuy", "lê trịnh", "le trinh",
  "hồng", "hong ", "nguyễn thị hồng",
  "quý tài", "quy tai", "nguyễn quý",
  "hạ uyên", "ha uyen", "bùi thị",
  "duy anh", "huỳnh duy",
  "hạ sang", "ha sang", "đoàn ngọc",
  "lan kim", "hồ thị lan",
  "khánh linh", "khanh linh", "trần thị khánh",
  "tùng", "tung", "phạm quang",
  "cẩm nhung", "cam nhung",
  "thái an", "thai an", "vũ thái", "vu thai",
  "đăng khoa", "dang khoa", "nguyễn đăng",
];

const ADMIN_KEYWORDS = [
  "tường vi", "tuong vi", "danh hoàng thị",
  "kế toán", "ke toan",
  "nga ", "hr",
];

async function main() {
  // Get all 6421 rows
  const rows = await db
    .select({
      id: financialTransactions.id,
      desc: financialTransactions.description,
      recipient: financialTransactions.recipient,
      amount: financialTransactions.amount,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "6421"));
  console.log(`Total rows category=6421: ${rows.length}`);

  const norm = (s: string) =>
    s.toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d");

  let toNVKD = 0;
  let stayAdmin = 0;
  let ambiguous = 0;

  for (const r of rows) {
    const target = norm(`${r.recipient ?? ""} ${r.desc}`);
    const isNVKD = NVKD_KEYWORDS.some((kw) => target.includes(norm(kw)));
    const isAdmin = ADMIN_KEYWORDS.some((kw) => target.includes(norm(kw)));

    // BHXH nộp cho cơ quan (không phải NV cụ thể) → giữ 6421
    const isBHXH = /bhxh|bao hiem|bảo hiểm/i.test(r.desc);
    if (isBHXH && !isNVKD) {
      stayAdmin++;
      continue;
    }

    if (isNVKD && !isAdmin) {
      await db
        .update(financialTransactions)
        .set({ categoryCode: "6411", managementGroup: "1a. Lương NVKD" })
        .where(eq(financialTransactions.id, r.id));
      toNVKD++;
    } else if (isAdmin && !isNVKD) {
      stayAdmin++;
    } else if (isNVKD && isAdmin) {
      ambiguous++;
    } else {
      stayAdmin++; // default nếu không rõ
    }
  }

  console.log(`\n  → 6411 (NVKD)  : ${toNVKD}`);
  console.log(`  → 6421 (Admin) : ${stayAdmin}`);
  console.log(`  → Ambiguous    : ${ambiguous} (giữ 6421)`);

  // Verify totals
  const rowsA = await db
    .select({ code: financialTransactions.categoryCode, total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)`.as("total") })
    .from(financialTransactions)
    .where(or(eq(financialTransactions.categoryCode, "6411"), eq(financialTransactions.categoryCode, "6421")))
    .groupBy(financialTransactions.categoryCode);
  console.log(`\n  Totals sau khi tách (all-time):`);
  for (const a of rowsA) {
    console.log(`    ${a.code}: ${fmt(Number(a.total))}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
