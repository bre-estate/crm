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

      // gemini-3.6-flash có "thinking mode" yêu cầu thought_signature khi
      // stream tool calls, OpenAI-compat endpoint không handle được → 400.
      // gemini-2.0-flash không có thinking, stream tool ổn định + nhanh hơn.
      const MODEL = "gemini-2.0-flash";
      const t0 = performance.now();
      const ts = (label: string) =>
        emit("status", {
          message: `${label} (${Math.round(performance.now() - t0)}ms)`,
        });

      try {
        for (let turn = 0; turn < 5; turn++) {
          ts(turn === 0 ? "Đang phân tích câu hỏi" : "Đang tổng hợp câu trả lời");

          // Stream toàn bộ turns. Accumulate tool_calls từ deltas nếu có.
          const streamRes = await client.chat.completions.create({
            model: MODEL,
            messages,
            tools: TOOL_SCHEMAS,
            tool_choice: "auto",
            temperature: 0.2,
            stream: true,
          });

          let accumulated = "";
          const toolCallsAcc: Record<
            number,
            { id: string; name: string; args: string }
          > = {};

          for await (const chunk of streamRes) {
            const d = chunk.choices[0]?.delta;
            if (!d) continue;
            if (d.content) {
              accumulated += d.content;
              emit("delta", { text: d.content });
            }
            if (d.tool_calls) {
              for (const tc of d.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallsAcc[idx]) {
                  toolCallsAcc[idx] = { id: "", name: "", args: "" };
                }
                if (tc.id) toolCallsAcc[idx].id = tc.id;
                if (tc.function?.name) toolCallsAcc[idx].name = tc.function.name;
                if (tc.function?.arguments)
                  toolCallsAcc[idx].args += tc.function.arguments;
              }
            }
          }

          const toolCalls = Object.values(toolCallsAcc).filter((t) => t.name);

          if (toolCalls.length === 0) {
            // Đã stream xong final answer
            emit("done", {});
            controller.close();
            return;
          }

          // Có tool calls → execute + tiếp turn sau
          messages.push({
            role: "assistant",
            content: accumulated || "",
            tool_calls: toolCalls.map((t) => ({
              id: t.id,
              type: "function" as const,
              function: { name: t.name, arguments: t.args },
            })),
          });

          for (const tc of toolCalls) {
            ts(`Đang tra ${tc.name}`);
            const fn = TOOL_IMPL[tc.name];
            let result: unknown;
            if (!fn) {
              result = { ok: false, error: `Unknown tool: ${tc.name}` };
            } else {
              try {
                const args = JSON.parse(tc.args);
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
