import { db } from "../lib/db";
import { products, projects } from "../lib/schema";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      productCode: products.productCode,
      unitCode: products.unitCode,
      projName: projects.name,
      projFull: projects.fullCode,
    })
    .from(products)
    .leftJoin(projects, eq(projects.id, products.projectId))
    .orderBy(products.id);
  console.log(`Total products: ${rows.length}\n`);
  const uniq = new Map<string, Set<string>>();
  for (const r of rows) {
    const codes = uniq.get(r.projName ?? "?") ?? new Set();
    codes.add(r.unitCode ?? "");
    uniq.set(r.projName ?? "?", codes);
  }
  for (const [proj, codes] of uniq) {
    const arr = [...codes].sort();
    console.log(`  ${proj} (${arr.length}): ${arr.slice(0, 10).join(", ")}${arr.length > 10 ? "..." : ""}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
