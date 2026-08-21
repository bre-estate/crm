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

      // Lite model = nhanh nhất, đủ chất lượng cho Q&A số liệu.
      // Test local (scripts/test_gemini_2turn.mjs): 1.8s total 2-turn flow.
      // "latest" alias auto-track newest stable lite; đỡ phải update code
      // khi Google release version mới.
      const MODEL = "gemini-flash-lite-latest";
      const t0 = performance.now();
      const ts = (label: string) =>
        emit("status", {
          message: `${label} (${Math.round(performance.now() - t0)}ms)`,
        });

      try {
        for (let turn = 0; turn < 5; turn++) {
          // Turn có thể có tool call → non-stream (preserve response nguyên
          // vẹn cho Gemini, tránh mất thought_signature khi accumulate deltas).
          // Turn cuối (không tool) → stream text chunk-by-chunk.
          ts(turn === 0 ? "Đang phân tích câu hỏi" : "Đang tổng hợp");

          const res = await client.chat.completions.create({
            model: MODEL,
            messages,
            tools: TOOL_SCHEMAS,
            tool_choice: "auto",
            temperature: 0.2,
          });
          const msg = res.choices[0].message;

          if (msg.tool_calls && msg.tool_calls.length > 0) {
            // Push nguyên message assistant (kèm tool_calls + có thể thought_signature)
            messages.push(msg);
            for (const tc of msg.tool_calls) {
              if (tc.type !== "function") continue;
              ts(`Đang tra ${tc.function.name}`);
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

          // Không tool call → đã có final answer. Gemini có thể trả text
          // trong content luôn (single-shot). Emit + close.
          if (msg.content) {
            ts("Đang trả lời");
            // Chia thành chunks nhỏ để UI thấy chữ chảy dần (fake streaming
            // vì non-stream already đã có full text, chunk client-side để UX)
            const chunkSize = 40;
            for (let i = 0; i < msg.content.length; i += chunkSize) {
              emit("delta", { text: msg.content.slice(i, i + chunkSize) });
            }
            emit("done", {});
            controller.close();
            return;
          }

          // Fallback edge case: không content, không tool → thoát
          emit("delta", { text: "(Không có phản hồi)" });
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
