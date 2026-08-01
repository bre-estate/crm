"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Entry = { rate: string; date: string; note: string };

const emptyEntry = (): Entry => ({ rate: "", date: "", note: "" });

export default function PmgRateHistoryEditor({
  defaultHistory,
  defaultCurrentRate,
  onLatestChange,
}: {
  defaultHistory: string | null;
  defaultCurrentRate: number | null;
  onLatestChange?: (rate: number) => void;
}) {
  // Parse initial history JSON
  const initial = ((): Entry[] => {
    try {
      if (defaultHistory) {
        const arr = JSON.parse(defaultHistory) as Array<{
          rate: number;
          date: string;
          note?: string;
        }>;
        if (Array.isArray(arr) && arr.length > 0) {
          return arr.map((e) => ({
            rate: String(Number((e.rate * 100).toFixed(4))),
            date: e.date ?? "",
            note: e.note ?? "",
          }));
        }
      }
    } catch {
      // ignore
    }
    // Fallback: 1 entry with current rate
    return [
      {
        rate: defaultCurrentRate
          ? String(Number((defaultCurrentRate * 100).toFixed(4)))
          : "",
        date: "",
        note: "",
      },
    ];
  })();

  const [entries, setEntries] = useState<Entry[]>(initial);

  const update = (i: number, patch: Partial<Entry>) => {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };
  const add = () => setEntries((prev) => [...prev, emptyEntry()]);
  const remove = (i: number) =>
    setEntries((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  // Build serialized JSON for hidden input
  const serialized = ((): string => {
    const valid = entries
      .filter((e) => e.rate)
      .map((e) => ({
        rate: Number(e.rate) / 100,
        date: e.date,
        note: e.note || undefined,
      }));
    return JSON.stringify(valid);
  })();

  // Latest rate: mốc có date mới nhất. Entry chưa nhập date coi là "cũ nhất"
  // (fallback initial), không được ưu tiên. Nếu tất cả đều không có date,
  // dùng entry cuối (thứ tự nhập).
  const latestRate = ((): string => {
    const filtered = entries.filter((e) => e.rate);
    if (filtered.length === 0) return "";
    const withDate = filtered.filter((e) => e.date);
    if (withDate.length > 0) {
      const sorted = [...withDate].sort((a, b) => b.date.localeCompare(a.date));
      return sorted[0].rate;
    }
    return filtered[filtered.length - 1].rate;
  })();

  // Emit latest rate lên parent để live compute
  useEffect(() => {
    if (onLatestChange) {
      onLatestChange(latestRate ? Number(latestRate) / 100 : 0);
    }
  }, [latestRate, onLatestChange]);

  return (
    <div className="space-y-2">
      <input type="hidden" name="pmgRateHistory" value={serialized} />
      {/* Auto-sync pmgRate = latest entry */}
      <input type="hidden" name="pmgRate" value={latestRate} />

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
        <div className="text-xs text-slate-500 mb-2">
          Mỗi mốc = 1 lần %HH thay đổi (vd đầu năm 6.75%, sau đạt KPI được nâng
          lên 7%). %HH mới nhất (dựa ngày áp dụng) sẽ là số áp dụng hiện tại.
        </div>
        <div className="grid grid-cols-12 gap-2 text-xs text-slate-500 font-semibold mb-1 px-1">
          <div className="col-span-3">%HH (vd: 6.75)</div>
          <div className="col-span-3">Ngày áp dụng</div>
          <div className="col-span-5">Ghi chú</div>
          <div className="col-span-1"></div>
        </div>
        {entries.map((e, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center mb-1">
            <input
              type="text"
              inputMode="decimal"
              value={e.rate}
              onChange={(ev) => update(i, { rate: ev.target.value })}
              placeholder="6,75"
              className="input col-span-3 text-sm py-1"
            />
            <input
              type="date"
              value={e.date}
              onChange={(ev) => update(i, { date: ev.target.value })}
              className="input col-span-3 text-sm py-1"
            />
            <input
              type="text"
              value={e.note}
              onChange={(ev) => update(i, { note: ev.target.value })}
              placeholder="vd: hồi tố khi đạt KPI"
              className="input col-span-5 text-sm py-1"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-red-500 hover:bg-red-50 rounded px-1 col-span-1 text-lg"
              disabled={entries.length === 1}
              title="Xóa mốc"
            >
              ×
            </button>
          </div>
        ))}
        <Button
          type="button"
          size="xs"
          onClick={add}
          className="bg-orange-500 hover:bg-orange-600 text-white mt-2"
        >
          + Thêm mốc mới
        </Button>
      </div>
    </div>
  );
}
