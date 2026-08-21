/**
 * Chat streaming endpoint — SSE (Server-Sent Events).
 *
 * Vì tool_calling + streaming phức tạp, dùng approach hybrid:
 * - Turn tool selection: non-streaming (nhanh, msg ngắn)
 * - Turn synthesis cuối: streaming (msg dài, cải thiện perceived speed)
 * - Emit "status" events giữa turns để UI show progress.
 */
import { requireOwner } from "@/lib/auth";
import OpenAI from "openai";
import { TOOL_SCHEMAS, TOOL_IMPL } from "@/lib/chatbot/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Bạn là trợ lý CRM của BRE — nền tảng môi giới BĐS. Nhân viên hỏi số liệu về hoa hồng (HH sale), thưởng nóng CĐT, đối chiếu công nợ, thông tin căn.

Nguyên tắc:
- Trả lời NGẮN GỌN bằng tiếng Việt tự nhiên, không dài dòng.
- Dùng số liệu chính xác từ tool, KHÔNG bịa. Nếu tool báo không tìm thấy, nói rõ.
- Format số tiền VN: 1.234.567 (dấu chấm ngăn ngàn).
- Không dùng em dash "—", chỉ dùng dấu chấm/phẩy/hai chấm.
- Khi tool trả về linkChiTiet (VD /products/123), luôn hiển thị dưới dạng markdown link [Xem chi tiết](/products/123).
- Khi user hỏi về THANH TOÁN / TIẾN ĐỘ THU / % ĐÃ NHẬN, ưu tiên gọi tool getUnitInfo và trả về số cụ thể: đã nhận X, còn phải nhận Y, đạt Z%.
- Nếu tool trả về nhiều căn (do search partial match), hỏi lại user để xác định căn nào.

Nguồn dữ liệu:
- HH sale: mức BRE trả cho NVKD sau đối chiếu với CĐT.
- Thưởng nóng CĐT: khoản CĐT chi thêm cho từng đợt bán được (có thể bị hoàn nếu giao dịch huỷ).
- Chi dư: NV đã nhận nhưng CĐT hoàn, sẽ khấu trừ đợt HH sale sau.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  try {
    await requireOwner();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unauthorized" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!process.env.BRE_CRM_KEY) {
    return new Response(
      JSON.stringify({ error: "Thiếu BRE_CRM_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = (await req.json()) as { history: ChatMessage[]; question: string };
  const client = new OpenAI({
    apiKey: process.env.BRE_CRM_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (type: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...body.history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: body.question },
      ];

      try {
        for (let turn = 0; turn < 5; turn++) {
          const response = await client.chat.completions.create({
            model: "gemini-3.6-flash",
            messages,
            tools: TOOL_SCHEMAS,
            tool_choice: "auto",
            temperature: 0.3,
          });

          const msg = response.choices[0].message;

          if (msg.tool_calls && msg.tool_calls.length > 0) {
            messages.push({
              role: "assistant",
              content: msg.content ?? "",
              tool_calls: msg.tool_calls,
            });
            for (const tc of msg.tool_calls) {
              if (tc.type !== "function") continue;
              emit("status", { message: `Đang tra ${tc.function.name}...` });
              const fn = TOOL_IMPL[tc.function.name];
              let result: unknown;
              if (!fn) {
                result = { ok: false, error: `Unknown tool: ${tc.function.name}` };
              } else {
                try {
                  const args = JSON.parse(tc.function.arguments);
                  result = await fn(args);
                } catch (e) {
                  result = {
                    ok: false,
                    error: `Tool error: ${e instanceof Error ? e.message : String(e)}`,
                  };
                }
              }
              messages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              });
            }
            continue;
          }

          // Không tool call → có content luôn (thường Gemini trả về single-shot)
          // OR: cần synthesize final answer với streaming.
          if (msg.content) {
            // Emit toàn bộ content 1 lần (đã có sẵn từ non-stream response)
            emit("delta", { text: msg.content });
            emit("done", {});
            controller.close();
            return;
          }

          // Fallback: gọi lại với streaming để lấy answer
          emit("status", { message: "Đang tổng hợp..." });
          const streamRes = await client.chat.completions.create({
            model: "gemini-3.6-flash",
            messages,
            stream: true,
            temperature: 0.3,
          });
          for await (const chunk of streamRes) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) emit("delta", { text: delta });
          }
          emit("done", {});
          controller.close();
          return;
        }

        emit("delta", { text: "Quá nhiều bước xử lý, vui lòng hỏi lại câu ngắn hơn." });
        emit("done", {});
        controller.close();
      } catch (e) {
        const err = e as Error & { status?: number; code?: string };
        emit("error", {
          message: err.message,
          status: err.status,
          code: err.code,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
