import { listKimEntries, getProgressStats } from "./actions";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import BreakdownClient from "./BreakdownClient";
import { tkLabel } from "@/lib/reports/opex-from-journal";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

type SP = Promise<{ tk?: string; year?: string; status?: string }>;

export default async function KimBreakdownPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") notFound();

  const sp = await searchParams;
  const year = sp.year ?? "2025";
  const tk = sp.tk ?? "6411";
  const status = sp.status ?? "pending";

  const [entries, stats] = await Promise.all([
    listKimEntries({ tk, year, status }),
    getProgressStats(year),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs">
          <Link href="/admin" className="text-blue-600 hover:underline">← Admin</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Kim NKC ↔ Đề nghị thanh toán</h1>
        <p className="text-sm text-slate-500 mt-1">
          Breakdown Kim bulk entries (source of truth OPEX) bằng cách link với DNTT chi tiết.
          Chốt xong từng entry → status = done.
        </p>
      </div>

      {/* Progress per TK */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Tiến độ chốt — Năm {year}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {stats.map((s) => {
            const pct = s.total > 0 ? (s.done / s.total) * 100 : 0;
            const pctMoney = s.sumTotal > 0 ? (s.sumDone / s.sumTotal) * 100 : 0;
            const active = tk === s.tk;
            return (
              <Link
                key={s.tk}
                href={`/admin/kim-breakdown?tk=${s.tk}&year=${year}&status=${status}`}
                className={`block p-2 rounded-lg border text-xs transition-colors ${
                  active
                    ? "border-orange-400 bg-orange-50"
                    : "border-slate-200 hover:border-slate-400"
                }`}
              >
                <div className="font-mono font-semibold">{s.tk}</div>
                <div className="text-[10px] text-slate-500 truncate" title={tkLabel(s.tk)}>
                  {tkLabel(s.tk)}
                </div>
                <div className="mt-1 tabular-nums">
                  {s.done}/{s.total} ({pct.toFixed(0)}%)
                </div>
                <div className="text-[10px] text-slate-500 tabular-nums">
                  {fmt(s.sumDone / 1_000_000)}/{fmt(s.sumTotal / 1_000_000)}M ({pctMoney.toFixed(0)}%)
                </div>
                <div className="h-1 bg-slate-100 rounded overflow-hidden mt-1">
                  <div
                    className={pct >= 100 ? "bg-green-500" : "bg-orange-400"}
                    style={{ width: `${pct}%`, height: "100%" }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 text-sm">
        <div>
          <label className="text-xs text-slate-500 mr-1">TK:</label>
          <span className="font-mono font-semibold">{tk}</span>
          <span className="text-slate-400 ml-1">({tkLabel(tk)})</span>
        </div>
        <div className="ml-auto flex gap-1">
          {["pending", "done", "all"].map((s) => (
            <Link
              key={s}
              href={`/admin/kim-breakdown?tk=${tk}&year=${year}&status=${s}`}
              className={`px-2.5 py-1 rounded text-xs ${
                status === s
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s === "pending" ? "Chưa chốt" : s === "done" ? "Đã chốt" : "Tất cả"}
            </Link>
          ))}
        </div>
      </div>

      <BreakdownClient entries={entries} />
    </div>
  );
}
