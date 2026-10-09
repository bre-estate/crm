"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { TEN_NHOM, type NhomLoi, type PhatHien } from "@/lib/soat-du-lieu-types";
import { TRANG_THAI, type TrangThai } from "@/lib/soat-trang-thai";
import { luuGhiChuSoat } from "@/lib/actions/soat";
import { cauLoi } from "@/lib/actions/ket-qua";

export type GhiChuMuc = { trangThai: string; ghiChu: string; luc: string | null };

const MAU_TRANG_THAI: Record<string, string> = {
  moi: "bg-slate-100 text-slate-600",
  dang_xu_ly: "bg-blue-100 text-blue-700",
  de_sau: "bg-slate-200 text-slate-500",
};

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default function SoatClient({
  phatHien,
  ghiChu,
}: {
  phatHien: PhatHien[];
  ghiChu: Record<string, GhiChuMuc>;
}) {
  const [chon, setChon] = useState<string | null>(phatHien[0]?.id ?? null);
  const [soDo, setSoDo] = useState<Record<string, GhiChuMuc>>(ghiChu);
  const [pending, start] = useTransition();

  const mucDangXem = (id: string): GhiChuMuc =>
    soDo[id] ?? { trangThai: "moi", ghiChu: "", luc: null };

  const luu = (id: string, trangThai: string, noiDung: string) => {
    start(async () => {
      const kq = await luuGhiChuSoat(id, trangThai, noiDung);
      if (kq?.error) {
        toast.error(cauLoi(kq.error));
        return;
      }
      setSoDo((cu) => ({
        ...cu,
        [id]: { trangThai, ghiChu: noiDung, luc: new Date().toISOString() },
      }));
      toast.success("Đã lưu");
    });
  };

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
                    {soDo[x.id] && soDo[x.id].trangThai !== "moi" && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                          MAU_TRANG_THAI[soDo[x.id].trangThai] ?? ""
                        }`}
                      >
                        {TRANG_THAI[soDo[x.id].trangThai as TrangThai]}
                      </span>
                    )}
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

          <GhiChuMucForm
            key={dangXem.id}
            muc={mucDangXem(dangXem.id)}
            pending={pending}
            onLuu={(tt, nd) => luu(dangXem.id, tt, nd)}
          />
        </div>
      )}
    </div>
  );
}

/** Ô theo dõi từng mục. Không lưu tên người, chỉ trạng thái và ghi chú. */
function GhiChuMucForm({
  muc,
  pending,
  onLuu,
}: {
  muc: GhiChuMuc;
  pending: boolean;
  onLuu: (trangThai: string, ghiChu: string) => void;
}) {
  const [trangThai, setTrangThai] = useState(muc.trangThai);
  const [noiDung, setNoiDung] = useState(muc.ghiChu);
  const doi = trangThai !== muc.trangThai || noiDung !== muc.ghiChu;

  return (
    <div className="pt-3 border-t border-slate-100 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">Trạng thái</span>
        {(Object.keys(TRANG_THAI) as TrangThai[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTrangThai(k)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              trangThai === k
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-300 hover:bg-slate-50"
            }`}
          >
            {TRANG_THAI[k]}
          </button>
        ))}
      </div>
      <textarea
        value={noiDung}
        onChange={(e) => setNoiDung(e.target.value)}
        rows={2}
        placeholder="Ghi chú: đã hỏi ai, hỏi gì, đang chờ gì"
        className="input w-full text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!doi || pending}
          onClick={() => onLuu(trangThai, noiDung)}
          className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40"
        >
          {pending ? "Đang lưu..." : "Lưu"}
        </button>
        {muc.luc && !doi && (
          <span className="text-[11px] text-slate-400">
            Cập nhật {new Date(muc.luc).toLocaleString("vi-VN")}
          </span>
        )}
      </div>
    </div>
  );
}
