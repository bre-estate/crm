import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { TOOL_IMPL } = await import("../lib/chatbot/tools");

  console.log("═══ getProjectProfitability({year:2026}) ═══");
  const pp = await TOOL_IMPL.getProjectProfitability({ year: 2026 });
  const ppData = (pp as { ok: boolean; data: any }).data;
  console.log(`  ${ppData.ky}, ${ppData.soDuAn} dự án, tổng lãi gộp ${ppData.tongLaiGop.toLocaleString("vi-VN")} (biên ${ppData.tongBienGopPct}%)`);
  ppData.items.slice(0, 5).forEach((r: any) =>
    console.log(`    ${r.duAn}: DT net ${r.doanhThuNet.toLocaleString("vi-VN")}, giá vốn ${r.giaVon.toLocaleString("vi-VN")}, lãi gộp ${r.laiGop.toLocaleString("vi-VN")} (${r.bienGopPct}%)`),
  );

  console.log("\n═══ getPnL({year:2025}) ═══");
  const pnl = await TOOL_IMPL.getPnL({ year: 2025 });
  console.log(JSON.stringify(pnl, null, 2));

  console.log("\n═══ getBreakEven({year:2025}) ═══");
  const be = await TOOL_IMPL.getBreakEven({ year: 2025 });
  console.log(JSON.stringify(be, null, 2));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
