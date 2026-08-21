"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Render text với inline markdown link + bold.
// Ko dùng thư viện react-markdown vì ESM incompat với Next 15.
function renderRichText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIdx = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(text.slice(lastIdx, m.index));
    }
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

const SUGGESTIONS = [
  "HH sale của Đoàn Lê Bách năm 2026 bao nhiêu?",
  "Ai đang nợ công ty do chi dư thưởng nóng?",
  "Căn A-07-09 có thông tin gì và đã thanh toán bao nhiêu %?",
  "Tô Rô Ly Na có nợ gì không?",
];

// Parse 1 block SSE: `event: X\ndata: {...}\n\n` → [event, data]
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

export default function ChatUI() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
        // Tách block theo `\n\n`
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
            const err = parsed.data as { message: string; status?: number; code?: string };
            throw new Error(
              `${err.message}${err.status ? ` (${err.status})` : ""}${err.code ? ` [${err.code}]` : ""}`,
            );
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
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      <div className="flex-1 overflow-y-auto space-y-3 p-2">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-slate-400 text-sm mb-4">Thử hỏi:</div>
            <div className="flex flex-col gap-2 items-center">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="text-xs text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 max-w-md w-full text-slate-700"
                >
                  {s}
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
            <div
              className={`rounded-2xl px-4 py-2 max-w-[80%] text-sm ${
                m.role === "user"
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-900"
              }`}
            >
              {m.content ? (
                <div className="whitespace-pre-wrap">
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
            <div className="rounded-2xl px-4 py-2 bg-slate-100 text-slate-500 text-xs italic animate-pulse">
              {status}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 p-3 border-t"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Hỏi về HH, thưởng nóng, căn..."
          disabled={pending}
          className="input flex-1"
          autoComplete="off"
        />
        <Button
          type="submit"
          disabled={pending || !input.trim()}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          Gửi
        </Button>
      </form>
    </div>
  );
}
