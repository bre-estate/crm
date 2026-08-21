/**
 * Chat streaming endpoint — SSE (Server-Sent Events).
 *
 * Vì tool_calling + streaming phức tạp, dùng approach hybrid:
 * - Turn tool selection: non-streaming (nhanh, msg ngắn)
 * - Turn synthesis cuối: streaming (msg dài, cải thiện perceived speed)
 * - Emit "status" events giữa turns để UI show progress.
 */
import { getCurrentUser } from "@/lib/auth";
import OpenAI from "openai";
import {
  TOOL_SCHEMAS,
  TOOL_IMPL,
  SENSITIVE_TOOL_NAMES,
  SENSITIVE_ALLOWED_ROLES,
} from "@/lib/chatbot/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT_BASE = `Bạn là trợ lý CRM của BRE. Chỉ trả lời dựa trên data từ tool.

QUY TẮC TUYỆT ĐỐI:
1. CHỈ dùng số liệu từ tool. TUYỆT ĐỐI KHÔNG bịa, KHÔNG tự ước lượng ("khoảng X%"), KHÔNG generalize từ 1-2 mẫu.
2. Nếu user hỏi mức phổ biến / chính sách / thống kê 1 DỰ ÁN CỤ THỂ → dùng getProjectPolicy.
3. Nếu user hỏi SO SÁNH chính sách nhiều dự án / "CĐT nào tốt nhất" / "dự án nào %HH cao nhất" → dùng listAllProjectPolicies rồi TỰ SORT theo tiêu chí user hỏi:
   - "CĐT nào trả HH cao" → sort desc theo pctHHSale_phoBien
   - "CĐT nào ưu đãi tốt" → so sánh combo pctPMG + cdtThuongNongSale
   - "CĐT nào chốt được nhiều căn" → sort desc theo soCan
4. Nếu user hỏi ranking bán tốt nhất theo doanh số → dùng getTopProjects (số căn + doanh thu + HH).
5. Nếu user hỏi 1 căn cụ thể → dùng getUnitInfo.
6. Nếu user hỏi:
   - "căn nào chưa nhận đủ tiền", "căn nào cần thu tiếp", "lô nào CĐT chưa trả" → listUnitsNeedingCollection
   - "căn nào chưa đối chiếu HH", "căn nào chưa ghi nợ HH cho NV" → listUnitsMissingHHRecon
   - "CĐT nào còn nợ mình", "ai còn nợ bao lâu", "quá 90 ngày" → getARAging
   - "mình còn nợ ai", "NV nào nợ lâu", "cần trả gấp ai" → getAPAging
   - "nợ thuế bao nhiêu", "nghĩa vụ tài chính", "vị thế ròng" → getObligations (owner only)
   - "DT quý X", "DT dự án X 2026", "top NV doanh số", "phòng nào DT cao" → getSalesReport
   - "biên gộp dự án", "dự án nào lỗ", "top lãi dự án" → getProjectProfitability
   - "lãi năm nay", "P&L quý", "công ty lãi hay lỗ" → getPnL
   - "điểm hòa vốn", "cần bán bao nhiêu căn hòa vốn", "biên an toàn" → getBreakEven
7. Không có tool phù hợp → trả lời rõ scope hỗ trợ (đủ tools cover: HH per NV, chi dư, thông tin căn, list căn dự án, chính sách dự án, so sánh CĐT, ranking dự án, AR/AP aging, obligations, sales, project profit, P&L, break-even).
8. Khi tool trả về link (linkChiTiet), dùng markdown [Xem chi tiết](/products/N). CHECK link đúng căn trước khi trả.
9. Nhiều căn cùng match → hỏi user chọn, KHÔNG tự đoán.

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

const SYSTEM_PROMPT_SENSITIVE_SUFFIX = `\n\nBạn đang phục vụ chủ tài khoản hoặc quản lý. Có quyền truy cập TẤT CẢ tools bao gồm P&L, điểm hòa vốn, tổng doanh thu, biên gộp dự án, nghĩa vụ tài chính, chi dư nội bộ.`;

const SYSTEM_PROMPT_PUBLIC_SUFFIX = `\n\nBạn đang phục vụ nhân viên (không phải chủ/quản lý). CHỈ có tools: tra thông tin căn, list căn dự án, HH sale + công nợ 1 NV, tuổi nợ CĐT (AR aging), tuổi nợ mình (AP aging), chính sách 1 dự án. KHÔNG có tools về tổng DT/lợi nhuận/hòa vốn/nghĩa vụ tài chính — nếu user hỏi mấy cái này, nói rõ: "Thông tin này chỉ chủ tài khoản và quản lý xem được. Bạn có thể hỏi về HH của bạn, thông tin căn, đối chiếu, hoặc CĐT nào còn nợ."`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Chưa đăng nhập" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  const canSensitive = SENSITIVE_ALLOWED_ROLES.has(user.role);
  const allowedTools = canSensitive
    ? TOOL_SCHEMAS
    : TOOL_SCHEMAS.filter((t) => !SENSITIVE_TOOL_NAMES.has(t.function.name));

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

      const systemPrompt =
        SYSTEM_PROMPT_BASE +
        (canSensitive ? SYSTEM_PROMPT_SENSITIVE_SUFFIX : SYSTEM_PROMPT_PUBLIC_SUFFIX);

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
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
            tools: allowedTools,
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
              } else if (
                SENSITIVE_TOOL_NAMES.has(tc.function.name) &&
                !canSensitive
              ) {
                // Defense in depth: LLM có thể hallucinate call sensitive
                // tool dù không có trong schema. Chặn server-side.
                result = {
                  ok: false,
                  error: `Bạn không có quyền xem thông tin này. Chỉ chủ tài khoản và quản lý mới xem được tổng hợp doanh thu, lợi nhuận, nghĩa vụ tài chính.`,
                };
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
