import dotenv from "dotenv";
dotenv.config({ path: "/Users/trietnguyen/Documents/Company/BRE/App/CRM/.env.local" });
const { assertRevenueCapNotExceeded, assertCostCapNotExceeded, assertPmgCumulativePctInRange, assertPaymentProgressPctInRange } = await import("../lib/actions/cap-guards.ts");

async function run(label, fn) {
  try {
    await fn();
    console.log(`  ❓ ${label}: KHÔNG throw`);
  } catch (e) {
    console.log(`  ✅ ${label}: ${e.message.slice(0, 220)}`);
  }
}

console.log("Test 1: #4301 (140.9M) trên căn ATSR (id=887) — phải block");
await run("assertRevenueCap", () => assertRevenueCapNotExceeded(887, 140908475));

console.log("\nTest 2: DT 10M trên ATSR — phải cho qua");
try {
  await assertRevenueCapNotExceeded(887, 10000000);
  console.log("  ✅ cho qua");
} catch (e) { console.log(`  ❌ block sai: ${e.message.slice(0, 100)}`); }

console.log("\nTest 3: pmg_cumulative_pct=1.1 — phải block");
await run("assertPmgCumulativePct", () => assertPmgCumulativePctInRange(1.1));

console.log("\nTest 4: N=1.05 — phải block");
await run("assertPaymentProgress", () => assertPaymentProgressPctInRange(1.05));

console.log("\nTest 5: HH sale 500M trên căn ATSR — phải block");
await run("assertCostCap", () => assertCostCapNotExceeded(887, "sale_commission", 500000000));

process.exit(0);
