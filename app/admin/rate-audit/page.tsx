/**
 * /admin/rate-audit — Đối chiếu rate căn vs biểu PMG hợp đồng.
 * Phát hiện:
 *   - 🔴 Rate không thuộc biểu (nhập sai)
 *   - ⚠️ Chưa đủ lũy kế để đạt bậc (cần verify với sale/manager)
 *   - 🔴 Vi phạm trần rate NVKD (sale > saleCap)
 */
import { db } from "@/lib/db";
import { contracts, products } from "@/lib/schema";
import { and, sql, like, isNotNull, eq, asc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { tierAt } from "@/lib/pmg-tier-parser";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmtPct = (n: number | null | undefined) => n == null ? "?" : ((n as number) * 100).toFixed(2) + "%";

type Flag = {
  contractCode: string;
  partnerName: string;
  metric: string | null;
  retroactive: boolean;
  X_final: number;
  maxReachedRate: number | null;
  finalTierSaleCap: number | null;
  products: Array<{
    productCode: string;
    pmgRate: number | null;
    pmgSaleRate: number | null;
    depositDate: string | null;
    salesPerson: string | null;
    kind: "bad" | "insufficient" | "capViol" | "ok";
    note: string;
  }>;
};

async function runAudit(): Promise<Flag[]> {
  const allContracts = await db.select().from(contracts).where(isNotNull(contracts.projectId)).orderBy(asc(contracts.projectCode));
  const flags: Flag[] = [];

  for (const c of allContracts) {
    const rows = await db
      .select({
        id: products.id,
        productCode: products.productCode,
        pmgRate: products.pmgRate,
        pmgSaleRate: products.pmgSaleRate,
        depositDate: products.depositDate,
        salesPerson: products.salesPerson,
      })
      .from(products)
      .where(and(like(products.productCode, `${c.projectCode}_%`), isNotNull(products.depositDate)))
      .orderBy(asc(products.depositDate), asc(products.id));

    if (rows.length === 0) continue;

    const tiers = c.pmgTiers;
    const useTier = Array.isArray(tiers) && tiers.length > 0 && c.pmgMetric === "count";
    const retroactive = c.pmgRetroactive === true;
    const X_final = rows.length;
    const finalTier = useTier ? tierAt(tiers as any, X_final) : null;

    const validRates = new Set<number>();
    if (useTier) for (const t of tiers as any[]) validRates.add(Math.round(t.rate * 10000));
    else if (c.pmgLk != null) validRates.add(Math.round(Number(c.pmgLk) * 10000));

    const maxReachedRate = retroactive
      ? finalTier?.rate ?? null
      : useTier
        ? Math.max(...(tiers as any[]).filter(t => t.min <= X_final).map(t => t.rate))
        : c.pmgLk != null ? Number(c.pmgLk) : null;
    const finalTierSaleCap = finalTier?.saleCap ?? null;

    const flagged: Flag["products"] = [];

    for (const p of rows) {
      const actual = p.pmgRate == null ? null : Number(p.pmgRate);
      const saleActual = p.pmgSaleRate == null ? null : Number(p.pmgSaleRate);
      let kind: Flag["products"][number]["kind"] = "ok";
      let note = "";

      if (actual != null && validRates.size > 0 && !validRates.has(Math.round(actual * 10000))) {
        kind = "bad";
        note = `Rate ${fmtPct(actual)} không thuộc biểu (${Array.from(validRates).map(k => fmtPct(k/10000)).join(", ")})`;
      } else if (actual != null && maxReachedRate != null && actual > maxReachedRate + 0.0001) {
        kind = "insufficient";
        note = `Chưa đủ ${X_final} căn — max hiện tại chỉ ${fmtPct(maxReachedRate)}, căn ghi ${fmtPct(actual)}`;
      }

      // saleCap check (song song)
      let capNote = "";
      if (finalTierSaleCap != null && saleActual != null && saleActual > finalTierSaleCap + 0.0001) {
        capNote = `sale ${fmtPct(saleActual)} > trần NVKD ${fmtPct(finalTierSaleCap)}`;
        if (kind === "ok") {
          kind = "capViol";
          note = capNote;
        } else {
          note += ` · ${capNote}`;
        }
      }

      if (kind !== "ok") {
        flagged.push({
          productCode: p.productCode,
          pmgRate: actual,
          pmgSaleRate: saleActual,
          depositDate: p.depositDate,
          salesPerson: p.salesPerson,
          kind,
          note,
        });
      }
    }

    if (flagged.length > 0) {
      flags.push({
        contractCode: c.projectCode,
        partnerName: c.partnerName ?? "?",
        metric: c.pmgMetric,
        retroactive,
        X_final,
        maxReachedRate,
        finalTierSaleCap,
        products: flagged,
      });
    }
  }
  return flags;
}

export default async function RateAuditPage() {
  await requirePermission("finance");
  const flags = await runAudit();

  const counts = flags.reduce(
    (acc, f) => {
      for (const p of f.products) acc[p.kind]++;
      return acc;
    },
    { bad: 0, insufficient: 0, capViol: 0, ok: 0 }
  );
  const total = counts.bad + counts.insufficient + counts.capViol;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs"><Link href="/admin/data-checks" className="text-blue-600 hover:underline">← Kiểm tra dữ liệu</Link></div>
        <h1 className="text-2xl font-bold mt-1">Đối chiếu rate căn vs biểu PMG</h1>
        <p className="text-sm text-slate-500 mt-1">
          So từng căn với biểu bậc PMG trong hợp đồng. Nếu rate không thuộc biểu, hoặc chưa đủ lũy kế để đạt bậc, hoặc vượt trần NVKD → cần verify.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card label="Rate không thuộc biểu" value={counts.bad} color="red" />
        <Card label="Chưa đủ lũy kế" value={counts.insufficient} color="amber" />
        <Card label="Vượt trần NVKD" value={counts.capViol} color="red" />
      </div>

      {total === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center text-green-800">
          ✅ Không có căn nào cần verify — tất cả rate đều khớp biểu PMG.
        </div>
      ) : (
        <div className="space-y-4">
          {flags.map((f) => (
            <div key={f.contractCode} className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
              <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-baseline gap-3">
                <div className="font-mono text-xs text-slate-500">{f.contractCode}</div>
                <div className="font-semibold">{f.partnerName}</div>
                <div className="text-xs text-slate-500">
                  {f.metric === "count" ? "theo số căn" : f.metric === "percent" ? "theo %giỏ hàng" : "phẳng"}
                  {f.retroactive && " · ↺ hồi tố"}
                </div>
                <div className="text-xs text-slate-500">
                  X_final = <b>{f.X_final}</b> căn · max reached rate <b>{fmtPct(f.maxReachedRate)}</b>
                  {f.finalTierSaleCap != null && <> · trần sale <b>{fmtPct(f.finalTierSaleCap)}</b></>}
                </div>
                <div className="ml-auto text-xs">
                  <b>{f.products.length}</b> căn cần check
                </div>
              </div>
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left p-2 w-24">Loại</th>
                    <th className="text-left p-2">Căn</th>
                    <th className="text-left p-2">NV</th>
                    <th className="text-right p-2">PMG</th>
                    <th className="text-right p-2">sale</th>
                    <th className="text-left p-2">Cọc</th>
                    <th className="text-left p-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {f.products.map((p) => {
                    const badge = p.kind === "bad"
                      ? { txt: "🔴 sai", cls: "bg-red-100 text-red-700" }
                      : p.kind === "insufficient"
                        ? { txt: "⚠️ verify", cls: "bg-amber-100 text-amber-800" }
                        : { txt: "🔴 trần", cls: "bg-red-100 text-red-700" };
                    return (
                      <tr key={p.productCode} className="border-t hover:bg-slate-50">
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${badge.cls}`}>{badge.txt}</span>
                        </td>
                        <td className="p-2 font-mono">{p.productCode}</td>
                        <td className="p-2">{p.salesPerson ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{fmtPct(p.pmgRate)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtPct(p.pmgSaleRate)}</td>
                        <td className="p-2">{p.depositDate ?? "—"}</td>
                        <td className="p-2 text-slate-700">{p.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-slate-500 italic">
        Nguồn: contracts.pmg_tiers (parse từ sheet 1_HOP DONG) vs products.pmg_rate/pmg_sale_rate. Chạy real-time.
      </div>
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: number; color: string }) {
  const cls: Record<string, string> = {
    red: "bg-red-50 border-red-200 text-red-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    green: "bg-green-50 border-green-200 text-green-800",
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[color]}`}>
      <div className="text-[11px] uppercase tracking-wide font-semibold">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
