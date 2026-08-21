"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { chatQuery, type ChatMessage } from "@/lib/actions/chatbot";

const SUGGESTIONS = [
  "HH sale của Đoàn Lê Bách năm 2026 bao nhiêu?",
  "Ai đang nợ công ty do chi dư thưởng nóng?",
  "Căn A-07-09 có thông tin gì?",
  "Tô Rô Ly Na có nợ gì không?",
];

export default function ChatUI() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    setInput("");
    const newHistory = [...messages, { role: "user" as const, content: q }];
    setMessages(newHistory);
    start(async () => {
      try {
        const res = await chatQuery(messages, q);
        setMessages([...newHistory, { role: "assistant", content: res.answer }]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi khi hỏi bot");
        setMessages(messages);
      }
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      <div className="flex-1 overflow-y-auto space-y-3 p-2">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-slate-400 text-sm mb-4">
              Thử hỏi:
            </div>
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
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2 bg-slate-100 text-slate-500 text-sm animate-pulse">
              Đang trả lời...
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
