"use server";

import { requirePermission } from "@/lib/auth";
import OpenAI from "openai";
import { TOOL_SCHEMAS, TOOL_IMPL } from "@/lib/chatbot/tools";

const SYSTEM_PROMPT = `Bạn là trợ lý CRM của BRE — nền tảng môi giới BĐS. Nhân viên hỏi số liệu về hoa hồng (HH sale), thưởng nóng CĐT, đối chiếu công nợ, thông tin căn.

Nguyên tắc:
- Trả lời NGẮN GỌN bằng tiếng Việt tự nhiên, không dài dòng.
- Dùng số liệu chính xác từ tool, KHÔNG bịa. Nếu tool báo không tìm thấy, nói rõ.
- Format số tiền VN: 1.234.567 (dấu chấm ngăn ngàn).
- Không dùng em dash "—", chỉ dùng dấu chấm/phẩy/hai chấm.
- Nếu tool trả về link (VD /products/123), hiển thị dưới dạng markdown link để user click.
- Khi user hỏi câu không rõ, hỏi lại 1 câu để xác định (VD "bạn hỏi HH của năm nào?").

Nguồn dữ liệu:
- HH sale: mức BRE trả cho NVKD sau đối chiếu với CĐT.
- Thưởng nóng CĐT: khoản CĐT chi thêm cho từng đợt bán được (có thể bị hoàn nếu giao dịch huỷ).
- Chi dư: NV đã nhận nhưng CĐT hoàn, sẽ khấu trừ đợt HH sale sau.`;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function chatQuery(
  history: ChatMessage[],
  question: string,
): Promise<{ answer: string; toolCalls: string[] }> {
  await requirePermission("reports.commissions", "view");

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Thiếu OPENAI_API_KEY. Add vào .env.local (local) hoặc Vercel Environment Variables (production).",
    );
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

  const toolCalls: string[] = [];

  // Loop tối đa 5 turn tool-call để tránh infinite (LLM misbehave).
  for (let turn = 0; turn < 5; turn++) {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: "auto",
      temperature: 0.3,
    });

    const msg = response.choices[0].message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Push assistant message (giữ tool_calls) vào history để tool response match
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });

      // Execute từng tool call
      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;
        const name = tc.function.name;
        const fn = TOOL_IMPL[name];
        toolCalls.push(name);
        let result: unknown;
        if (!fn) {
          result = { ok: false, error: `Unknown tool: ${name}` };
        } else {
          try {
            const args = JSON.parse(tc.function.arguments);
            result = await fn(args);
          } catch (e) {
            result = {
              ok: false,
              error: `Tool ${name} error: ${e instanceof Error ? e.message : String(e)}`,
            };
          }
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      continue; // Loop tiếp để LLM tổng hợp
    }

    // Không tool call nữa → answer cuối
    return {
      answer: msg.content ?? "(Không có phản hồi)",
      toolCalls,
    };
  }

  return {
    answer: "Quá nhiều bước xử lý, vui lòng hỏi lại câu ngắn gọn hơn.",
    toolCalls,
  };
}
