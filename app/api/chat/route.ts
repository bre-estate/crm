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

const SYSTEM_PROMPT = `Bạn là trợ lý CRM của BRE. Chỉ trả lời dựa trên data từ tool.

QUY TẮC TUYỆT ĐỐI:
1. CHỈ dùng số liệu từ tool. TUYỆT ĐỐI KHÔNG bịa, KHÔNG tự ước lượng ("khoảng X%"), KHÔNG generalize từ 1-2 mẫu.
2. Nếu user hỏi mức phổ biến / chính sách / thống kê 1 dự án → dùng tool getProjectPolicy (aggregate min/median/max/mode từ tất cả căn dự án đó).
3. Nếu user hỏi ranking / dự án bán tốt nhất → dùng tool getTopProjects (aggregate số căn, doanh thu, HH).
4. Nếu user hỏi 1 căn cụ thể → dùng getUnitInfo (không dùng aggregate).
5. Không có tool phù hợp → trả lời rõ scope hỗ trợ:
   "Tôi hỗ trợ tra: HH sale + công nợ NV, chi dư thưởng nóng, thông tin + tiến độ 1 căn, list căn của dự án, chính sách phổ biến của dự án, ranking dự án. Câu hỏi này ngoài phạm vi."
6. Khi tool trả về link (linkChiTiet), dùng markdown [Xem chi tiết](/products/N). CHECK link đúng căn trước khi trả.
7. Nhiều căn cùng match → hỏi user chọn, KHÔNG tự đoán.

Trình bày aggregate (getProjectPolicy):
- Phân biệt: "phổ biến nhất X%" (mode) vs "trung vị Y%" (median). Đừng nói "trung bình" nếu mode ≠ median.
- Nếu min = max = mode → nói "toàn bộ dự án dùng X%" (không cần range).
- Nếu spread rộng → nêu range + phổ biến nhất.

Format:
- Tiếng Việt tự nhiên, ngắn gọn.
- Số tiền VN: 1.234.567 (dấu chấm ngăn ngàn).
- Không dùng dấu gạch dài "—", chỉ dùng dấu chấm/phẩy/hai chấm.
- Khi user hỏi tiến độ thanh toán: dùng getUnitInfo trả cụ thể "đã nhận X / cần nhận Y (Z%)".

Nguồn dữ liệu:
- HH sale: mức BRE trả NVKD sau đối chiếu với CĐT.
- Thưởng nóng CĐT: khoản CĐT chi thêm mỗi đợt bán được (có thể bị hoàn nếu huỷ).
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
