import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { getEmployeeOverpaid, getProductOverpaidSummary } = await import("../lib/employee-overpaid");

  console.log("═══ getEmployeeOverpaid() — all ═══");
  const all = await getEmployeeOverpaid();
  console.log(`Total: ${all.length} rows`);
  all.forEach(r => console.log(`  #${r.productId} ${r.productCode} · ${r.employeeName} · ${r.costType}: paid=${r.paid.toLocaleString("vi-VN")} rev=${r.revenueTotal.toLocaleString("vi-VN")} → OVERPAID ${r.overpaid.toLocaleString("vi-VN")}`));

  console.log("\n═══ getEmployeeOverpaid(915) — căn A2-06-17 ═══");
  const one = await getEmployeeOverpaid(915);
  one.forEach(r => console.log(`  ${r.employeeName} · ${r.costType}: paid=${r.paid.toLocaleString("vi-VN")} rev=${r.revenueTotal.toLocaleString("vi-VN")} → OVERPAID ${r.overpaid.toLocaleString("vi-VN")}`));

  console.log("\n═══ getProductOverpaidSummary() ═══");
  const summary = await getProductOverpaidSummary();
  console.log(`Products có chi dư: ${summary.size}`);
  for (const [pid, s] of summary) {
    console.log(`  #${pid}: ${s.totalOverpaid.toLocaleString("vi-VN")} · ${s.employees.join(", ")}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
