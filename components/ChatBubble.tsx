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
          <Link key={key++} href={href} className="text-blue-600 hover:underline">
            {label}
          </Link>
        ) : (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
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
    setStatus("Đang xử lý...");

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
            setStatus((parsed.data as { message: string }).message);
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
          className="fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-orange-500 hover:bg-orange-600 text-white shadow-lg flex items-center justify-center text-xl transition-transform hover:scale-105"
          title="Hỏi trợ lý CRM"
          aria-label="Mở trợ lý CRM"
        >
          🤖
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-2rem)] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-orange-500 text-white rounded-t-xl">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span>🤖</span>
              <span>Trợ lý CRM</span>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href="/chat"
                className="text-xs px-2 py-1 rounded hover:bg-orange-600"
                title="Mở toàn màn hình"
              >
                ⤢
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-lg leading-none px-2 py-0.5 rounded hover:bg-orange-600"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs">
                Hỏi gì đó về HH, căn, dự án...
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded-2xl px-3 py-1.5 max-w-[85%] text-xs ${
                    m.role === "user"
                      ? "bg-orange-500 text-white"
                      : "bg-slate-100 text-slate-900"
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
                    <div className="text-slate-400 italic">...</div>
                  )}
                </div>
              </div>
            ))}
            {pending && status && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-1 bg-slate-100 text-slate-500 text-[10px] italic animate-pulse">
                  {status}
                </div>
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
            className="flex gap-1.5 p-2 border-t border-slate-100"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Hỏi gì đó..."
              disabled={pending}
              className="input flex-1 text-sm"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="px-3 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white text-sm disabled:opacity-50"
            >
              Gửi
            </button>
          </form>
        </div>
      )}
    </>
  );
}
