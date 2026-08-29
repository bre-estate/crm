import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { TOOL_IMPL } = await import("../lib/chatbot/tools");

  console.log("═══ getARAging ═══");
  const ar = await TOOL_IMPL.getARAging({});
  const arData = (ar as { ok: boolean; data: any }).data;
  console.log(`  ${arData.soCDT} CĐT nợ, tổng ${arData.tongConThu.toLocaleString("vi-VN")}`);
  arData.items.slice(0, 3).forEach((r: any) =>
    console.log(`    ${r.cdt}: ${r.tongCDTnayNo.toLocaleString("vi-VN")} (${r.soDot} đợt)`),
  );

  console.log("\n═══ getAPAging ═══");
  const ap = await TOOL_IMPL.getAPAging({});
  const apData = (ap as { ok: boolean; data: any }).data;
  console.log(`  ${apData.soNV} NV cty nợ, tổng ${apData.tongConNo.toLocaleString("vi-VN")}`);
  apData.items.slice(0, 3).forEach((r: any) =>
    console.log(`    ${r.nvkd}: ${r.tongNVnayCtyNo.toLocaleString("vi-VN")} (${r.soDot} đợt)`),
  );

  console.log("\n═══ getObligations ═══");
  const ob = await TOOL_IMPL.getObligations({});
  console.log(JSON.stringify(ob, null, 2));

  console.log("\n═══ getSalesReport({year:2026, groupBy:'project'}) ═══");
  const sales = await TOOL_IMPL.getSalesReport({ year: 2026, groupBy: "project" });
  const salesData = (sales as { ok: boolean; data: any }).data;
  console.log(`  ${salesData.ky}, tổng DT ${salesData.tongDT.toLocaleString("vi-VN")}, ${salesData.soCanCoDT} căn`);
  salesData.breakdown.slice(0, 5).forEach((r: any) =>
    console.log(`    ${r.duAn}: ${r.doanhThu.toLocaleString("vi-VN")} (${r.soCan} căn, ${r.soDot} đợt)`),
  );

  console.log("\n═══ getSalesReport({year:2026, period:'quarter', quarter:2, groupBy:'sales_person'}) ═══");
  const salesQ = await TOOL_IMPL.getSalesReport({ year: 2026, period: "quarter", quarter: 2, groupBy: "sales_person" });
  const salesQData = (salesQ as { ok: boolean; data: any }).data;
  console.log(`  ${salesQData.ky}, tổng DT ${salesQData.tongDT.toLocaleString("vi-VN")}`);
  salesQData.breakdown.slice(0, 5).forEach((r: any) =>
    console.log(`    ${r.nvkd}: ${r.doanhThu.toLocaleString("vi-VN")}`),
  );

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
