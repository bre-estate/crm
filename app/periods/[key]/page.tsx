import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/auth";
import { fmtMoney, fmtPctTight, costTypeLabel } from "@/lib/format";
import {
  loadAllContext,
  summarizePeriod,
  parsePeriodKey,
  periodLabel,
  periodStartDate,
  PERIOD_BASIS_LABEL,
} from "@/lib/period-commission";
import { PeriodToolbar, RetroRowButton } from "./PeriodActions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "nvkd", label: "NVKD" },
  { key: "tpkd", label: "Phòng / TPKD" },
  { key: "admin", label: "Admin / CEO" },
  { key: "retro", label: "Hồi tố / chi dư" },
  { key: "units", label: "Căn trong kỳ" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const posLabel = (p: string) =>
  p === "nvkd" ? "NVKD" : p === "tpkd" ? "TPKD" : p === "ctv" ? "CTV" : p === "ceo" ? "CEO" : p || "—";

export default async function PeriodDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  if (!(await hasPermission("periods", "view"))) notFound();
  const canEdit = await hasPermission("periods", "edit");
  const ref = parsePeriodKey(key);
  if (!ref) notFound();
  const ctx = await loadAllContext();
  const s = summarizePeriod(ctx, key);
  if (!s) notFound();
  const tab: Tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "nvkd") as Tab;
  const pending = s.retro.filter((r) => !r.alreadyRetro);

  const polNvkd = s.policies.nvkd;
  const polTpkd = s.policies.tpkd;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/periods" className="text-blue-600 hover:underline">← Kỳ HH & thưởng</Link>
        <span className="text-slate-400">/</span>
        <span>{periodLabel(ref)}</span>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Kỳ {periodLabel(ref)}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {periodStartDate(ref)} → {s.endDate} · Chính sách áp theo ngày cuối kỳ
            {polNvkd && (
              <> · NVKD: {fmtPctTight(Number(polNvkd.baseRate))} dưới {fmtMoney(polNvkd.tiers?.[0]?.threshold ?? 0)}, {fmtPctTight(polNvkd.tiers?.[0]?.rate ?? 0)} từ mốc</>
            )}
            {s.adminExpectedRate != null && <> · Admin: {fmtPctTight(s.adminExpectedRate)}</>}
          </p>
        </div>
        <PeriodToolbar periodKey={key} pendingCount={pending.length} canEdit={canEdit} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Số căn" value={String(s.totals.unitCount)} />
        <Stat label="Doanh thu kỳ" value={fmtMoney(s.totals.revenue)} />
        <Stat label="Thưởng doanh số" value={fmtMoney(s.totals.bonusTotal)} />
        <Stat label="Hồi tố treo" value={fmtMoney(s.totals.retroPlus)} tone={s.totals.retroPlus ? "red" : undefined} />
        <Stat label="Chi dư treo" value={fmtMoney(s.totals.retroMinus)} tone={s.totals.retroMinus ? "purple" : undefined} />
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/periods/${key}?tab=${t.key}`}
            className={`px-3 py-1.5 text-sm whitespace-nowrap border-b-2 -mb-px ${
              tab === t.key ? "border-orange-500 text-orange-700 font-semibold" : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
            {t.key === "retro" && pending.length > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{pending.length}</span>
            )}
          </Link>
        ))}
      </div>

      {tab === "nvkd" && (
        <Table
          head={["STT", "Tên", "Chức vụ", "Phòng", "Căn", "Doanh thu kỳ", "% mong đợi", "HH đã ĐC", "HH mong đợi", "Chênh", "Đã chi", "Thưởng DS"]}
          right={[4, 5, 6, 7, 8, 9, 10, 11]}
          rows={s.nvkd.map((r, i) => [
            String(i + 1),
            <span key="n" className="font-medium">{r.name}</span>,
            posLabel(r.position),
            r.deptName ?? "—",
            String(r.unitCount),
            fmtMoney(r.revenue),
            r.expectedRate == null ? "—" : fmtPctTight(r.expectedRate),
            fmtMoney(r.hhReconciled),
            fmtMoney(r.hhExpected),
            <Diff key="d" v={r.diff} />,
            fmtMoney(r.paid),
            r.bonus ? fmtMoney(r.bonus) : "—",
          ])}
          empty="Kỳ này chưa có căn."
        />
      )}

      {tab === "tpkd" && (
        <div className="space-y-4">
          {s.depts.length === 0 && <Empty>Kỳ này chưa có căn thuộc phòng nào.</Empty>}
          {s.depts.map((d) => (
            <div key={d.deptId} className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="font-bold">{d.deptName}</span>
                <span className="text-slate-500">TPKD: {d.leaderName ?? "—"}</span>
                <span>Doanh thu phòng: <b className="tabular-nums">{fmtMoney(d.revenue)}</b></span>
                <span>Tier KPI: <b>{fmtPctTight(d.expectedRate)}</b></span>
                <span>KPI đã ĐC: <span className="tabular-nums">{fmtMoney(d.kpiReconciled)}</span></span>
                <span>Mong đợi: <span className="tabular-nums">{fmtMoney(d.kpiExpected)}</span></span>
                <span>Chênh: <Diff v={d.diff} /></span>
                {d.leaderSalary != null && (
                  <span className="text-slate-500">Lương TPKD tham khảo ({d.nvkdCount} NVKD): {fmtMoney(d.leaderSalary)}</span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">Căn</th>
                    <th className="text-left p-2">Dự án</th>
                    <th className="text-left p-2">NVKD</th>
                    <th className="text-left p-2">Ngày cọc</th>
                    <th className="text-right p-2">Doanh thu</th>
                    <th className="text-right p-2">% KPI đã ĐC</th>
                    <th className="text-right p-2">KPI đã ĐC</th>
                  </tr>
                </thead>
                <tbody>
                  {d.units.map((u, i) => (
                    <tr key={u.productCode} className="border-t border-slate-100">
                      <td className="p-2 text-xs text-slate-500">{i + 1}</td>
                      <td className="p-2 font-mono text-xs">{u.unitCode}</td>
                      <td className="p-2 text-xs">{u.projectName ?? "—"}</td>
                      <td className="p-2 text-xs">{u.ownerName}</td>
                      <td className="p-2 text-xs">{u.depositDate ?? "—"}</td>
                      <td className="p-2 text-right tabular-nums">{fmtMoney(u.revenue)}</td>
                      <td className={`p-2 text-right tabular-nums ${u.kpiRate != null && Math.abs(u.kpiRate - d.expectedRate) > 1e-6 ? "text-amber-700 font-medium" : ""}`}>
                        {u.kpiRate == null ? <span className="text-slate-400">chưa ĐC</span> : fmtPctTight(u.kpiRate)}
                      </td>
                      <td className="p-2 text-right tabular-nums">{u.kpiAmount ? fmtMoney(u.kpiAmount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {polTpkd?.managerBonusTiers && (
            <div className="text-xs text-slate-500">
              Tier KPI TPKD: {polTpkd.managerBonusTiers.map((t) => `≥ ${fmtMoney(t.threshold)} → ${fmtPctTight(t.rate)}`).join(" · ")}
            </div>
          )}
        </div>
      )}

      {tab === "admin" && (
        <div className="space-y-4">
          <Table
            title={`KPI Admin (mong đợi ${s.adminExpectedRate != null ? fmtPctTight(s.adminExpectedRate) : "—"})`}
            head={["Căn", "Người", "% đã ĐC", "KPI đã ĐC", "Chênh"]}
            right={[2, 3, 4]}
            rows={s.adminUnits.map((u) => [
              <span key="u" className="font-mono text-xs">{u.unitCode}</span>,
              u.employeeName ?? <span className="text-slate-400">chưa ĐC</span>,
              u.actualRate == null ? "—" : fmtPctTight(u.actualRate),
              u.amount ? fmtMoney(u.amount) : "—",
              <Diff key="d" v={u.diff} />,
            ])}
            empty="Không có căn."
          />
          <Table
            title="KPI CEO (chưa có chính sách văn bản, chỉ hiển thị)"
            head={["Căn", "Người", "% đã ĐC", "KPI đã ĐC"]}
            right={[2, 3]}
            rows={s.ceoUnits.map((u) => [
              <span key="u" className="font-mono text-xs">{u.unitCode}</span>,
              u.employeeName ?? <span className="text-slate-400">chưa ĐC</span>,
              u.actualRate == null ? "—" : fmtPctTight(u.actualRate),
              u.amount ? fmtMoney(u.amount) : "—",
            ])}
            empty="Không có căn."
          />
        </div>
      )}

      {tab === "retro" && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Chênh = số đã ĐC × (rate mong đợi / rate đã dùng − 1). Dương = hồi tố tăng, âm = chi dư cần hoàn.
            Không sửa ĐC cũ; bấm tạo sẽ sinh 1 ĐC mới cùng căn, cùng người, amount = chênh.
          </p>
          <Table
            head={["Căn", "Người", "Loại", "ĐC gốc", "Ngày ĐC", "Số đã ĐC", "% đã dùng → mong đợi", "Chênh", "Trạng thái", ""]}
            right={[5, 7]}
            rows={s.retro.map((r) => [
              <span key="u" className="font-mono text-xs">{r.unitCode}</span>,
              r.employeeName,
              costTypeLabel(r.costType),
              <Link key="l" href={`/costs/${r.reconId}/edit?returnTo=/periods/${key}?tab=retro`} className="text-blue-600 hover:underline text-xs">#{r.reconId}</Link>,
              r.reconciliationDate ?? "—",
              fmtMoney(r.amount),
              `${fmtPctTight(r.actualRate)} → ${fmtPctTight(r.expectedRate)}`,
              <Diff key="d" v={r.diff} />,
              r.alreadyRetro ? (
                <Link key="s" href={`/costs/${r.retroReconId}/edit`} className="text-xs text-green-700 hover:underline">Đã tạo #{r.retroReconId}</Link>
              ) : (
                <span key="s" className="text-xs text-amber-700">Chưa tạo</span>
              ),
              r.alreadyRetro ? null : <RetroRowButton key="b" periodKey={key} reconId={r.reconId} canEdit={canEdit} />,
            ])}
            empty="Không có ĐC nào lệch chính sách trong kỳ."
          />
        </div>
      )}

      {tab === "units" && (
        <Table
          head={["Căn", "Dự án", "NVKD", "Phòng", "Ngày cọc", "Căn cứ kỳ", "Doanh thu"]}
          right={[6]}
          rows={s.products.map((p) => [
            <Link key="u" href={`/products/${p.id}`} className="font-mono text-xs text-blue-600 hover:underline">{p.unitCode}</Link>,
            p.projectName ?? "—",
            p.ownerName || "—",
            p.deptName ?? "—",
            p.depositDate ?? "—",
            PERIOD_BASIS_LABEL[p.periodBasis],
            fmtMoney(p.revenue),
          ])}
          empty="Kỳ này chưa có căn."
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "red" | "purple" }) {
  return (
    <div className="rounded-lg bg-card ring-1 ring-foreground/10 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "red" ? "text-red-600" : tone === "purple" ? "text-purple-700" : ""}`}>{value}</div>
    </div>
  );
}

function Diff({ v }: { v: number }) {
  if (!v) return <span className="text-slate-400">—</span>;
  return (
    <span className={`tabular-nums font-medium ${v > 0 ? "text-red-600" : "text-purple-700"}`}>
      {v > 0 ? "+" : ""}{fmtMoney(v)}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-6 text-center text-sm text-slate-500 bg-card rounded-xl ring-1 ring-foreground/10">{children}</div>;
}

function Table({
  title,
  head,
  rows,
  right = [],
  empty,
}: {
  title?: string;
  head: string[];
  rows: React.ReactNode[][];
  right?: number[];
  empty: string;
}) {
  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
      {title && <div className="p-3 font-semibold text-sm border-b border-slate-100">{title}</div>}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-600">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`p-2 ${right.includes(i) ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={head.length} className="p-6 text-center text-slate-500">{empty}</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
              {r.map((c, j) => (
                <td key={j} className={`p-2 ${right.includes(j) ? "text-right tabular-nums" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
