"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateContractTiers } from "@/lib/actions/contracts";

type Tier = {
  min: number;
  max: number | null;
  rate: number;      // 0.055 = 5,5%
  saleCap: number | null;
};

type Contract = {
  id: number;
  partnerName: string | null;
  contractNumber: string | null;
  pmgLk: number | null;
  pmgLkSale: number | null;
  pmgStructure: string | null;
  pmgTiers: unknown; // Array<Tier> or null
  pmgMetric: string | null;
  pmgRetroactive: boolean | null;
  pmgNotes: string | null;
};

const fmtPct = (n: number | null) => n == null ? "—" : (n * 100).toFixed(2).replace(/\.?0+$/, "") + "%";

function normalizeTier(t: any): Tier {
  return {
    min: Number(t?.min ?? 0),
    max: t?.max == null ? null : Number(t.max),
    rate: Number(t?.rate ?? 0),
    saleCap: t?.saleCap == null ? null : Number(t.saleCap),
  };
}

export default function ContractTiersEditor({ contract }: { contract: Contract }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initialTiers: Tier[] = Array.isArray(contract.pmgTiers) && contract.pmgTiers.length > 0
    ? (contract.pmgTiers as any[]).map(normalizeTier)
    : contract.pmgLk != null
      ? [{ min: 0, max: null, rate: Number(contract.pmgLk), saleCap: null }]
      : [];

  const [tiers, setTiers] = useState<Tier[]>(initialTiers);
  const [metric, setMetric] = useState<"count" | "percent" | "combined" | "other">(
    (contract.pmgMetric as any) ?? "count"
  );
  const [retroactive, setRetroactive] = useState(contract.pmgRetroactive === true);
  const [notes, setNotes] = useState(contract.pmgNotes ?? "");
  const [showRaw, setShowRaw] = useState(false);

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const nextMin = last ? (last.max == null ? last.min + 1 : last.max + 1) : 0;
    setTiers([...tiers, { min: nextMin, max: null, rate: 0.05, saleCap: null }]);
  };

  const removeTier = (i: number) => {
    setTiers(tiers.filter((_, idx) => idx !== i));
  };

  const updateTier = (i: number, patch: Partial<Tier>) => {
    setTiers(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };

  const save = () => {
    startTransition(async () => {
      try {
        await updateContractTiers(contract.id, {
          tiers: tiers.map(t => ({
            min: t.min,
            max: t.max,
            rate: t.rate,
            saleCap: t.saleCap ?? undefined,
          })),
          metric,
          retroactive,
          notes: notes.trim() || null,
        });
        toast.success("Đã lưu biểu PMG");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi lưu");
      }
    });
  };

  const unitLabel = metric === "percent" ? "%" : "căn";

  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-slate-800">{contract.partnerName}</div>
          {contract.contractNumber && (
            <div className="text-xs text-slate-500 mt-0.5" title={contract.contractNumber}>
              {contract.contractNumber.length > 80 ? contract.contractNumber.slice(0, 80) + "…" : contract.contractNumber}
            </div>
          )}
        </div>
        <div className="text-xs text-slate-500">
          Rate CĐT→BRE tối đa: <b className="text-slate-700">{fmtPct(contract.pmgLk)}</b> ·
          Sale (mặc định): <b className="text-slate-700">{fmtPct(contract.pmgLkSale)}</b>
        </div>
      </div>

      {contract.pmgStructure && (
        <div className="text-[11px]">
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="text-blue-600 hover:underline"
          >
            {showRaw ? "Ẩn" : "Xem"} biểu gốc từ hợp đồng ▾
          </button>
          {showRaw && (
            <div className="mt-1 p-2 bg-slate-50 rounded border border-slate-200 text-slate-700 whitespace-pre-wrap">
              {contract.pmgStructure}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
        <label className="text-xs">
          <span className="block text-slate-500 mb-1">Metric tính bậc</span>
          <select value={metric} onChange={e => setMetric(e.target.value as any)} className="input">
            <option value="count">Số căn X đã bán</option>
            <option value="percent">% giỏ hàng Y đã bán</option>
            <option value="other">Khác (không tự cross-check)</option>
          </select>
        </label>
        <label className="text-xs flex items-end gap-2">
          <input
            type="checkbox"
            checked={retroactive}
            onChange={e => setRetroactive(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-slate-700">Hồi tố toàn phần (đạt bậc cao thì áp cho căn cũ)</span>
        </label>
      </div>

      <div>
        <div className="text-xs text-slate-500 mb-1">Biểu bậc PMG lũy kế</div>
        {tiers.length > 0 && (
          <div className="grid gap-1 text-[11px] text-slate-400 px-2 mb-1" style={{ gridTemplateColumns: "1.5rem 5rem 5rem 3rem 5rem 5rem 2rem" }}>
            <div>#</div>
            <div>Từ ({unitLabel})</div>
            <div>Đến</div>
            <div></div>
            <div className="text-right">Rate PMG %</div>
            <div className="text-right">Trần sale %</div>
            <div></div>
          </div>
        )}
        <div className="space-y-1">
          {tiers.length === 0 && (
            <div className="text-xs text-slate-400 italic p-2 bg-slate-50 rounded">
              Chưa có bậc. Bấm "+ Thêm bậc" bên dưới.
            </div>
          )}
          {tiers.map((t, i) => (
            <div
              key={i}
              className="grid items-center gap-1 text-xs bg-slate-50 rounded px-2 py-1"
              style={{ gridTemplateColumns: "1.5rem 5rem 5rem 3rem 5rem 5rem 2rem" }}
            >
              <span className="text-slate-500">{i + 1}</span>
              <input
                type="number"
                value={metric === "percent" ? Math.round(t.min * 100) : t.min}
                onChange={e => {
                  const raw = Number(e.target.value);
                  updateTier(i, { min: metric === "percent" ? raw / 100 : raw });
                }}
                className="input h-7 text-right px-1.5"
              />
              <input
                type="number"
                value={t.max == null ? "" : (metric === "percent" ? Math.round(t.max * 100) : t.max)}
                onChange={e => {
                  const v = e.target.value.trim();
                  if (v === "") updateTier(i, { max: null });
                  else {
                    const raw = Number(v);
                    updateTier(i, { max: metric === "percent" ? raw / 100 : raw });
                  }
                }}
                placeholder="∞"
                className="input h-7 text-right px-1.5"
              />
              <span className="text-slate-400 text-center">→</span>
              <input
                type="number"
                value={+(t.rate * 100).toFixed(4)}
                onChange={e => updateTier(i, { rate: Number(e.target.value) / 100 })}
                step={0.01}
                className="input h-7 text-right px-1.5 font-semibold"
              />
              <input
                type="number"
                value={t.saleCap == null ? "" : +(t.saleCap * 100).toFixed(4)}
                onChange={e => {
                  const v = e.target.value.trim();
                  updateTier(i, { saleCap: v === "" ? null : Number(v) / 100 });
                }}
                placeholder="—"
                step={0.01}
                className="input h-7 text-right px-1.5"
              />
              <button
                type="button"
                onClick={() => removeTier(i)}
                className="text-red-500 hover:text-red-700 text-sm"
                disabled={pending}
                title="Xoá bậc"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addTier}
          className="mt-2 text-xs text-blue-600 hover:underline"
          disabled={pending}
        >
          + Thêm bậc
        </button>
      </div>

      <label className="text-xs block">
        <span className="block text-slate-500 mb-1">Ghi chú (VD: "Sale full theo BRE quyết định, không ràng buộc trần")</span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="input"
          rows={2}
        />
      </label>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <Button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {pending ? "Đang lưu..." : "Lưu biểu PMG"}
        </Button>
      </div>
    </div>
  );
}
