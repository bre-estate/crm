import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { TOOL_IMPL } = await import("../lib/chatbot/tools");
  const r = await TOOL_IMPL.listAllProjectPolicies({ minUnits: 2 });
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
