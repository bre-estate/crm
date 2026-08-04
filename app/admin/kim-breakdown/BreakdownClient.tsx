"use client";

import { useState, useTransition } from "react";
import { getDnttCandidates, saveReconciliation, type KimEntryWithRecon, type DnttCandidate } from "./actions";
import { toast } from "sonner";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default function BreakdownClient({ entries }: { entries: KimEntryWithRecon[] }) {
  const [selected, setSelected] = useState<KimEntryWithRecon | null>(null);
  const [candidates, setCandidates] = useState<DnttCandidate[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<number>>(new Set());
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"pending" | "done" | "needs_kim" | "orphan">("pending");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function selectEntry(e: KimEntryWithRecon) {
    setSelected(e);
    setLinkedIds(new Set(e.linkedIds));
    setNote(e.note ?? "");
    setStatus((e.status as any) ?? "pending");
    setLoading(true);
    try {
      const cands = await getDnttCandidates(e.groupIds);
      setCandidates(cands);
    } finally {
      setLoading(false);
    }
  }

  function toggleCandidate(id: number) {
    const s = new Set(linkedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setLinkedIds(s);
  }

  function save(newStatus: typeof status) {
    if (!selected) return;
    startTransition(async () => {
      const res = await saveReconciliation({
        kimEntryIds: selected.groupIds,
        linkedIds: [...linkedIds],
        status: newStatus,
        note,
      });
      if (res.ok) {
        toast.success(newStatus === "done" ? "Đã chốt entry" : "Đã lưu");
        // Update local state
        setStatus(newStatus);
        // Optional: could refresh entries list via router.refresh()
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  const linkedSum = candidates
    .filter((c) => linkedIds.has(c.id))
    .reduce((s, c) => s + c.amount, 0);
  const gap = selected ? selected.amount - linkedSum : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* LEFT: Kim entries list */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="p-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Kim NKC entries ({entries.length})
        </div>
        <div className="overflow-y-auto max-h-[600px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left p-2 w-20">Ngày</th>
                <th className="text-right p-2 w-24">Số tiền</th>
                <th className="text-left p-2">Diễn giải</th>
                <th className="text-center p-2 w-16">TT</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isSelected = selected?.id === e.id;
                return (
                  <tr
                    key={e.id}
                    onClick={() => selectEntry(e)}
                    className={`border-t border-slate-100 cursor-pointer transition-colors ${
                      isSelected ? "bg-orange-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="p-2 font-mono tabular-nums">{e.entryDate}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{fmt(e.amount)}</td>
                    <td className="p-2">{e.description}</td>
                    <td className="p-2 text-center">
                      <StatusBadge status={e.status} />
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-slate-500">
                  Không có entries.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT: DNTT candidates + save */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="p-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
          DNTT candidates {selected && `— match với entry ${selected.entryDate}`}
        </div>

        {!selected && (
          <div className="p-6 text-center text-slate-500 text-sm">
            Click 1 entry Kim bên trái để bắt đầu.
          </div>
        )}

        {selected && (
          <div>
            {/* Summary + save controls */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Kim tổng:</span>
                <span className="font-semibold tabular-nums">{fmt(selected.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">DNTT đã tick ({linkedIds.size}):</span>
                <span className="font-semibold tabular-nums">{fmt(linkedSum)}</span>
              </div>
              <div className={`flex justify-between font-semibold ${
                Math.abs(gap) < 1000 ? "text-green-700" : gap > 0 ? "text-orange-700" : "text-red-700"
              }`}>
                <span>Chênh:</span>
                <span className="tabular-nums">{fmt(gap)}</span>
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú (tùy chọn) — VD: 'Kim gộp lương cả tháng', 'Cần Kim clarify'..."
                className="w-full mt-2 p-2 text-xs border border-slate-300 rounded resize-none"
                rows={2}
              />

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => save("done")}
                  disabled={pending}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium disabled:opacity-50"
                >
                  ✓ Chốt xong
                </button>
                <button
                  onClick={() => save("needs_kim")}
                  disabled={pending}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-medium disabled:opacity-50"
                >
                  Cần hỏi Kim
                </button>
                <button
                  onClick={() => save("orphan")}
                  disabled={pending}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium disabled:opacity-50"
                >
                  Không match DNTT
                </button>
                <button
                  onClick={() => save("pending")}
                  disabled={pending}
                  className="ml-auto px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs disabled:opacity-50"
                >
                  Reset
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-6 text-center text-slate-500 text-sm">Loading...</div>
            ) : (
              <div className="overflow-y-auto max-h-[500px]">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="p-2 w-10"></th>
                      <th className="text-left p-2 w-20">Ngày</th>
                      <th className="text-right p-2 w-24">Số tiền</th>
                      <th className="text-left p-2">Người nhận / Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => {
                      const checked = linkedIds.has(c.id);
                      const dupWarn = c.alreadyLinkedTo !== null;
                      return (
                        <tr
                          key={c.id}
                          className={`border-t border-slate-100 ${dupWarn ? "bg-red-50" : ""}`}
                        >
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCandidate(c.id)}
                            />
                          </td>
                          <td className="p-2 font-mono tabular-nums">{c.requestDate ?? "—"}</td>
                          <td className="p-2 text-right tabular-nums font-semibold">{fmt(c.amount)}</td>
                          <td className="p-2">
                            <div className="font-medium">{c.recipient ?? "?"}</div>
                            <div className="text-slate-500 text-[11px]">{c.detail}</div>
                            {dupWarn && (
                              <div className="text-red-700 text-[10px] mt-0.5">
                                ⚠️ Đã link Kim entry #{c.alreadyLinkedTo}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {candidates.length === 0 && (
                      <tr><td colSpan={4} className="p-6 text-center text-slate-500">
                        Không tìm thấy DNTT match (±30 ngày).
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    done: "bg-green-100 text-green-800",
    pending: "bg-slate-100 text-slate-600",
    needs_kim: "bg-amber-100 text-amber-800",
    orphan: "bg-red-100 text-red-800",
  };
  const labels: Record<string, string> = {
    done: "✓",
    pending: "•",
    needs_kim: "?",
    orphan: "✗",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${styles[status] ?? styles.pending}`}>
      {labels[status] ?? "•"}
    </span>
  );
}
