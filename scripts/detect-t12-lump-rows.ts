/**
 * Tìm 3 row gộp cục T1/2026 cho Bách/Thành/Nhật (chi lương T12/2025 dồn cục
 * gồm cả HH + thưởng), rồi tính lương cứng median từ các tháng tách rõ.
 */

import { db } from "../lib/db";
import { financialTransactions } from "../lib/schema";
import { and, eq, ilike, or, inArray, like } from "drizzle-orm";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const PEOPLE = [
  { name: "Đoàn Lê Bách", short: "Bách" },
  { name: "Hồ Nguyễn Công Thành", short: "Thành" },
  { name: "Trần Minh Nhật", short: "Nhật" },
];

async function main() {
  // 1. Find lump rows T1/2026 for 3 people
  console.log(`═════════════════════════════════════════════════`);
  console.log(`  ROWS GỘP CỤC T1/2026`);
  console.log(`═════════════════════════════════════════════════\n`);
  const lumpRows = await db
    .select({
      id: financialTransactions.id,
      date: financialTransactions.transactionDate,
      amount: financialTransactions.amount,
      recipient: financialTransactions.recipient,
      desc: financialTransactions.description,
      categoryCode: financialTransactions.categoryCode,
      accrualMonth: financialTransactions.accrualMonth,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.transactionMonth, "2026-01"),
        inArray(financialTransactions.recipient, PEOPLE.map((p) => p.name)),
      ),
    );
  for (const r of lumpRows) {
    console.log(`  [${r.id}] ${r.date} · ${fmt(r.amount).padStart(14)} · ${r.categoryCode} · accrual=${r.accrualMonth}`);
    console.log(`    recipient: ${r.recipient}`);
    console.log(`    desc: ${r.desc}`);
  }

  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`  MEDIAN LƯƠNG CỨNG (chỉ row description "Lương tháng X")`);
  console.log(`═════════════════════════════════════════════════\n`);

  for (const p of PEOPLE) {
    const rows = await db
      .select({
        month: financialTransactions.transactionMonth,
        amount: financialTransactions.amount,
        desc: financialTransactions.description,
      })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.recipient, p.name),
          inArray(financialTransactions.categoryCode, ["6411", "6421"]),
        ),
      );

    // Filter: chỉ giữ row description có "Lương tháng" hoặc "Lương T" — không có "Thưởng" hay "HH"
    const pureSalary = rows.filter((r) => {
      const d = r.desc.toLowerCase();
      const isLuong = d.includes("lương") || d.includes("luong");
      const hasBonus = d.includes("thưởng") || d.includes("thuong") ||
                       d.includes("hoa hồng") || d.includes("hoa hong") ||
                       d.includes("thu nhập khác") || d.includes("thu nhap khac") ||
                       d.includes("bổ sung") || d.includes("bo sung");
      return isLuong && !hasBonus;
    });
    const amts = pureSalary.map((r) => Number(r.amount)).sort((a, b) => a - b);
    const median = amts.length > 0 ? amts[Math.floor(amts.length / 2)] : 0;
    const mode = new Map<number, number>();
    for (const a of amts) mode.set(a, (mode.get(a) ?? 0) + 1);
    const topMode = [...mode.entries()].sort((a, b) => b[1] - a[1])[0];

    console.log(`  ${p.short} (${p.name}): ${pureSalary.length} row lương cứng`);
    console.log(`    Median : ${fmt(median)}`);
    if (topMode) console.log(`    Mode   : ${fmt(topMode[0])} (${topMode[1]} lần)`);
    console.log(`    Range  : ${fmt(amts[0] ?? 0)} - ${fmt(amts[amts.length - 1] ?? 0)}`);
    console.log(`    Sample rows (5 mới nhất):`);
    for (const r of pureSalary.slice(-5)) {
      console.log(`      ${r.month} · ${fmt(Number(r.amount)).padStart(14)} · ${r.desc.substring(0, 50)}`);
    }
    console.log();
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
