"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TEN_NHOM, type NhomLoi, type PhatHien } from "@/lib/soat-du-lieu-types";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default function SoatClient({ phatHien }: { phatHien: PhatHien[] }) {
  const [chon, setChon] = useState<string | null>(phatHien[0]?.id ?? null);

  const theoNhom = useMemo(() => {
    const m = new Map<NhomLoi, PhatHien[]>();
    for (const x of phatHien) {
      if (!m.has(x.nhom)) m.set(x.nhom, []);
      m.get(x.nhom)!.push(x);
    }
    return m;
  }, [phatHien]);

  const dangXem = phatHien.find((x) => x.id === chon) ?? null;
  const tongLech = phatHien.reduce((s, x) => s + x.lech, 0);

  if (phatHien.length === 0) {
    return (
      <div className="bg-card ring-1 ring-foreground/10 rounded-xl p-8 text-center">
        <div className="text-2xl mb-2">✓</div>
        <div className="font-medium">Không tìm thấy sai lệch nào</div>
        <p className="text-sm text-slate-500 mt-1">
          Doanh thu và giá vốn của mọi căn đều nằm trong trần hợp đồng.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-4 items-start">
      {/* ── Cột trái: danh sách ── */}
      <div className="bg-card ring-1 ring-foreground/10 rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 flex items-baseline justify-between">
          <span className="text-sm font-semibold">{phatHien.length} sai lệch</span>
          {tongLech > 0 && (
            <span className="text-xs text-red-700 tabular-nums">{fmt(tongLech)}</span>
          )}
        </div>
        <div className="max-h-[36rem] overflow-y-auto">
          {[...theoNhom.entries()].map(([nhom, ds]) => (
            <div key={nhom}>
              <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-600 sticky top-0">
                {TEN_NHOM[nhom]} ({ds.length})
              </div>
              {ds.map((x) => {
                const dang = x.id === chon;
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setChon(x.id)}
                    className={`w-full text-left px-3 py-2 border-b border-slate-100 flex items-baseline gap-2 ${
                      dang ? "bg-orange-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className={`text-sm ${dang ? "font-semibold" : ""}`}>{x.canTen}</span>
                    <span className="text-[11px] text-slate-500 flex-1 truncate">{x.tieuDe}</span>
                    {x.lech > 0 && (
                      <span className="text-xs text-red-700 tabular-nums shrink-0">
                        {fmt(x.lech)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Cột phải: phép tính ── */}
      {dangXem && (
        <div className="bg-card ring-1 ring-foreground/10 rounded-xl p-4 space-y-4">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">{dangXem.canTen}</h2>
              <span className="text-xs text-slate-500">{dangXem.duAn}</span>
            </div>
            <div className="text-sm text-slate-600 mt-0.5">
              {TEN_NHOM[dangXem.nhom]} · {dangXem.tieuDe}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{dangXem.canMa}</div>
          </div>

          <table className="w-full text-sm">
            <tbody>
              {dangXem.phepTinh.map((d, i) => (
                <tr
                  key={i}
                  className={d.chot ? "border-t border-slate-300 font-semibold" : ""}
                >
                  <td className="py-1 pr-4 text-slate-600">{d.nhan}</td>
                  <td className="py-1 text-right tabular-nums whitespace-nowrap">{d.giaTri}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
            {dangXem.ketLuan}
          </div>

          <div className="flex gap-2 flex-wrap pt-1 border-t border-slate-100">
            {dangXem.lienKet.map((l, i) => (
              <Link
                key={i}
                href={l.href}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                {l.nhan} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
