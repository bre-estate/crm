"use client";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <h1 className="text-xl font-bold text-red-700">Chat lỗi</h1>
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 whitespace-pre-wrap">
        <div className="font-semibold mb-1">Message:</div>
        <div>{error.message || "(không có message)"}</div>
        {error.digest && (
          <>
            <div className="font-semibold mt-3 mb-1">Digest:</div>
            <div className="font-mono text-xs">{error.digest}</div>
          </>
        )}
        {error.stack && (
          <>
            <div className="font-semibold mt-3 mb-1">Stack:</div>
            <div className="font-mono text-xs">{error.stack}</div>
          </>
        )}
      </div>
      <button
        onClick={reset}
        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-sm"
      >
        Thử lại
      </button>
    </div>
  );
}
