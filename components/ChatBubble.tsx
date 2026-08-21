"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";

type ChatMessage = { role: "user" | "assistant"; content: string };

function renderRichText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIdx = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    if (m[1]) {
      parts.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3]) {
      const label = m[4];
      const href = m[5];
      const isInternal = href.startsWith("/");
      parts.push(
        isInternal ? (
          <Link key={key++} href={href} className="text-orange-600 hover:underline font-medium">
            {label}
          </Link>
        ) : (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-600 hover:underline font-medium"
          >
            {label}
          </a>
        ),
      );
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

function parseSSEBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split("\n");
  let event = "message";
  let dataStr = "";
  for (const l of lines) {
    if (l.startsWith("event: ")) event = l.slice(7).trim();
    else if (l.startsWith("data: ")) dataStr += l.slice(6);
  }
  if (!dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) };
  } catch {
    return null;
  }
}

const QUICK_QUESTIONS = [
  "Căn nào chưa nhận đủ tiền từ CĐT?",
  "CĐT nào đang nợ mình?",
  "HH sale của tôi tháng này bao nhiêu?",
];

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending, status]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    setInput("");
    const historySnapshot = messages;
    const withUser = [...messages, { role: "user" as const, content: q }];
    setMessages([...withUser, { role: "assistant", content: "" }]);
    setPending(true);
    setStatus("Đang xử lý");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historySnapshot, question: q }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Lỗi không xác định" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const b of blocks) {
          if (!b.trim()) continue;
          const parsed = parseSSEBlock(b);
          if (!parsed) continue;
          if (parsed.event === "status") {
            const msg = (parsed.data as { message: string }).message;
            // Bỏ ms suffix cho UI compact
            setStatus(msg.replace(/\s*\(\d+ms\)$/, ""));
          } else if (parsed.event === "delta") {
            assistantText += (parsed.data as { text: string }).text;
            setMessages([...withUser, { role: "assistant", content: assistantText }]);
          } else if (parsed.event === "done") {
            setStatus(null);
          } else if (parsed.event === "error") {
            const err = parsed.data as { message: string; status?: number };
            throw new Error(`${err.message}${err.status ? ` (${err.status})` : ""}`);
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi khi hỏi bot";
      toast.error(msg);
      setMessages([...withUser, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setPending(false);
      setStatus(null);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-orange-500 hover:bg-orange-600 text-white shadow-xl flex items-center justify-center text-2xl transition-all hover:scale-105 active:scale-95"
          title="Hỏi trợ lý CRM"
          aria-label="Mở trợ lý CRM"
        >
          🤖
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Header với gradient + avatar */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">
                🤖
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">Trợ lý CRM</div>
                <div className="text-[10px] text-orange-100 flex items-center gap-1 leading-tight mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                  Đang hoạt động
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <Link
                href="/chat"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/15 transition"
                title="Mở toàn màn hình"
                aria-label="Mở toàn màn hình"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/15 transition"
                aria-label="Đóng"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.length === 0 && (
              <div className="space-y-4 py-4">
                <div className="flex justify-start">
                  <div className="max-w-[85%]">
                    <div className="flex items-end gap-2">
                      <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-sm flex-shrink-0">
                        🤖
                      </div>
                      <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2 text-sm text-slate-800 shadow-sm">
                        Chào bạn! Mình hỗ trợ tra HH, đối chiếu, thông tin căn, công nợ CĐT. Bạn cần hỏi gì?
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pt-2 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold px-1">
                    Câu hỏi gợi ý
                  </div>
                  {QUICK_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => send(q)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-slate-700 transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-sm flex-shrink-0 mr-2 self-end">
                    🤖
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2 max-w-[80%] text-sm ${
                    m.role === "user"
                      ? "bg-orange-500 text-white rounded-br-md"
                      : "bg-white text-slate-800 shadow-sm rounded-bl-md"
                  }`}
                >
                  {m.content ? (
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {m.role === "assistant"
                        ? m.content.split("\n").map((line, li) => (
                            <div key={li}>{renderRichText(line)}</div>
                          ))
                        : m.content}
                    </div>
                  ) : (
                    <div className="flex gap-1 py-1 items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {pending && status && messages.length > 0 && messages[messages.length - 1].content && (
              <div className="flex justify-start pl-9">
                <div className="text-[10px] text-slate-400 italic">{status}...</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 p-3 border-t border-slate-100 bg-white"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập câu hỏi..."
              disabled={pending}
              className="flex-1 px-3.5 py-2 rounded-full bg-slate-100 border border-transparent focus:border-orange-300 focus:bg-white focus:outline-none text-sm transition disabled:opacity-50"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="w-10 h-10 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition"
              aria-label="Gửi"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
