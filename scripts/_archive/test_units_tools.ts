import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { TOOL_IMPL } = await import("../lib/chatbot/tools");
  console.log("═══ listUnitsNeedingCollection ═══");
  const r1 = await TOOL_IMPL.listUnitsNeedingCollection({ limit: 5 });
  const d1 = (r1 as any).data;
  console.log(`  ${d1.soCan} căn còn thu, tổng ${d1.tongConThu.toLocaleString("vi-VN")}`);
  d1.items.slice(0, 5).forEach((r: any) =>
    console.log(`    ${r.maCan} (${r.cdt}, ${r.khach ?? "?"}, ${r.nvkd ?? "?"}): còn ${r.conPhaiThu.toLocaleString("vi-VN")}, quá hạn ${r.soNgayTuLanDCCuoi} ngày`),
  );

  console.log("\n═══ listUnitsMissingHHRecon ═══");
  const r2 = await TOOL_IMPL.listUnitsMissingHHRecon({ limit: 5 });
  const d2 = (r2 as any).data;
  console.log(`  ${d2.soCan} căn chưa đối chiếu HH, DT ghi nhận ${d2.tongDT.toLocaleString("vi-VN")}`);
  d2.items.slice(0, 5).forEach((r: any) =>
    console.log(`    ${r.maCan} (${r.nvkd ?? "?"}): DT ${r.doanhThuGhiNhan.toLocaleString("vi-VN")}, cọc ${r.ngayCoc}`),
  );
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
