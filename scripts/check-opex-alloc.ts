import { db } from "../lib/db";
import { financialTransactions, products } from "../lib/schema";
import { sql, inArray } from "drizzle-orm";
import { OPEX_CATEGORIES, FIXED_COST_CATEGORIES } from "../lib/accounting/categories";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const [opexAll] = await db
    .select({ sum: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(inArray(financialTransactions.categoryCode, OPEX_CATEGORIES));
  const [fixed] = await db
    .select({ sum: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(inArray(financialTransactions.categoryCode, FIXED_COST_CATEGORIES));
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products);
  const [{ rev, cost }] = await db
    .select({
      rev: sql<number>`coalesce(sum(total_revenue), 0)::float8`,
      cost: sql<number>`coalesce(sum(total_cost), 0)::float8`,
    })
    .from(products);
  const avgGross = n > 0 ? (Number(rev) / 1.1 - Number(cost)) / n : 0;

  console.log(`Tổng products: ${n}`);
  console.log(`Tổng doanh thu: ${fmt(Number(rev))}`);
  console.log(`Tổng giá vốn: ${fmt(Number(cost))}`);
  console.log(`Lãi gộp trung bình / căn: ${fmt(avgGross)}`);
  console.log();
  console.log(`OPEX_CATEGORIES (gồm 6417 HH sale): ${fmt(Number(opexAll.sum))}`);
  console.log(`  → phân bổ / căn: ${fmt(Number(opexAll.sum) / n)} → lãi thuần TB: ${fmt(avgGross - Number(opexAll.sum) / n)}`);
  console.log();
  console.log(`FIXED_COST_CATEGORIES (không HH sale): ${fmt(Number(fixed.sum))}`);
  console.log(`  → phân bổ / căn: ${fmt(Number(fixed.sum) / n)} → lãi thuần TB: ${fmt(avgGross - Number(fixed.sum) / n)}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
