import OpenAI from "openai";
import { readFileSync } from "fs";

const env = readFileSync("/Users/trietnguyen/Documents/Company/BRE/App/CRM/.env.local", "utf-8");
const KEY = env.match(/BRE_CRM_KEY\s*=\s*['"]?([^'"\n]+)['"]?/)?.[1];
if (!KEY) throw new Error("no key");

const client = new OpenAI({
  apiKey: KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const tools = [{
  type: "function",
  function: {
    name: "getWeather",
    description: "Lấy thời tiết",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
}];

async function testModel(model) {
  console.log(`\n===== ${model} =====`);
  const messages = [
    { role: "user", content: "Thời tiết ở Hanoi hôm nay thế nào?" },
  ];

  const t0 = Date.now();

  // Turn 1: non-stream, tool call expected
  const r1 = await client.chat.completions.create({
    model,
    messages,
    tools,
    stream: false,
  });
  const t1 = Date.now() - t0;
  console.log(`Turn 1 (${t1}ms): tool_calls=`, JSON.stringify(r1.choices[0].message.tool_calls?.[0]?.function));

  // Push assistant message
  const msg1 = r1.choices[0].message;
  messages.push(msg1);
  console.log(`  msg1 keys:`, Object.keys(msg1));

  // Push fake tool result
  const tc = msg1.tool_calls?.[0];
  if (tc) {
    messages.push({
      role: "tool",
      tool_call_id: tc.id,
      content: JSON.stringify({ temp: 30, condition: "sunny" }),
    });
  }

  // Turn 2: stream, expect final answer
  const r2 = await client.chat.completions.create({
    model,
    messages,
    tools,
    stream: true,
  });
  let text = "";
  for await (const c of r2) {
    text += c.choices[0]?.delta?.content ?? "";
  }
  const t2 = Date.now() - t0 - t1;
  console.log(`Turn 2 (${t2}ms stream): "${text}"`);
  console.log(`Total: ${Date.now() - t0}ms`);
}

for (const m of ["gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-3.6-flash"]) {
  try {
    await testModel(m);
  } catch (e) {
    console.log(`❌ ${m}: ${e.message?.slice(0, 200)}`);
  }
}
