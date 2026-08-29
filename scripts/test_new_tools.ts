import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { TOOL_IMPL } = await import("../lib/chatbot/tools");

  console.log("═══ getProjectPolicy('Emerald Boulevard') ═══");
  const r1 = await TOOL_IMPL.getProjectPolicy({ projectName: "Emerald Boulevard" });
  console.log(JSON.stringify(r1, null, 2));

  console.log("\n═══ getTopProjects({}) ═══");
  const r2 = await TOOL_IMPL.getTopProjects({});
  console.log(JSON.stringify(r2, null, 2));

  console.log("\n═══ getTopProjects({year:2026, limit:5}) ═══");
  const r3 = await TOOL_IMPL.getTopProjects({ year: 2026, limit: 5 });
  console.log(JSON.stringify(r3, null, 2));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
