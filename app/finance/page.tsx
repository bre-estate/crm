import { db } from "@/lib/db";
import { financialTransactions, companyInvestments, companyExpenses } from "@/lib/schema";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { sql, eq, inArray, and, ne, isNotNull } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("vi-VN");

export default async function FinanceLandingPage() {
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  // Stat cards data
  const [txSummary] = await db
    .select({
      n: sql<number>`count(*)::int`,
      sum: sql<number>`coalesce(sum(amount), 0)::float8`,
    })
    .from(financialTransactions);

  // Vốn góp founder = mọi giao dịch payer IN (Triết, Bách) TRỪ thứ cấp.
  // Framework 2026-07-24: bao gồm cả chi hộ, không chỉ TK 411/244.
  const capitalRows = await db
    .select({
      payer: financialTransactions.payer,
      sum: sql<number>`sum(amount)::float8`,
    })
    .from(financialTransactions)
    .where(
      and(
        inArray(financialTransactions.payer, ["Triết", "Bách"]),
        ne(financialTransactions.categoryCode, "secondary"),
      ),
    )
    .groupBy(financialTransactions.payer);
  const capitalTotal = capitalRows.reduce((s, r) => s + Number(r.sum), 0);
  const byFounder = new Map(capitalRows.map((r) => [r.payer ?? "?", Number(r.sum)]));

  // Ký quỹ (244) riêng
  const [kiquyRow] = await db
    .select({ sum: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "244"));

  // Legacy data — cho migration awareness
  const [legacyInv] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(companyInvestments);
  const [legacyExp] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(companyExpenses);

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Tài chính công ty</h1>
        <p className="text-sm text-slate-500 mt-1">
          Trung tâm quản lý vốn góp, tài sản, chi phí, giao dịch. Nền tảng cho
          phần kế toán nội bộ sau này.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Tổng giao dịch"
          value={`${txSummary.n} giao dịch`}
          sub={`${fmt(txSummary.sum)} VND`}
        />
        <StatCard
          label="Vốn góp Triết"
          value={fmt(byFounder.get("Triết") ?? 0)}
          sub="Bỏ cá nhân cho cty"
        />
        <StatCard
          label="Vốn góp Bách"
          value={fmt(byFounder.get("Bách") ?? 0)}
          sub="Bỏ cá nhân cho cty"
        />
        <StatCard
          label="Tổng founder"
          value={fmt(capitalTotal)}
          sub="Triết + Bách"
        />
      </div>

      {/* Sub-page cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SectionCard
          title="Vốn góp founder"
          desc="Triết + Bách góp bao nhiêu qua từng tháng, lũy kế đến hiện tại."
          href="/finance/capital"
          badge={`${capitalRows.length} founder`}
          highlight
        >
          <ul className="text-xs text-slate-600 space-y-0.5 mt-2">
            {[...byFounder.entries()].map(([name, sum]) => (
              <li key={name} className="flex justify-between">
                <span>{name}</span>
                <span className="tabular-nums font-medium">{fmt(sum)} VND</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Giao dịch tài chính"
          desc="Toàn bộ dòng tiền chi/thu/vốn/hoàn, filter theo tháng × TK × người chi."
          href="/finance/transactions"
          badge={`${txSummary.n} rows`}
        />

        <SectionCard
          title="Tài sản công ty"
          desc="Ký quỹ dự án + thiết bị/TSCĐ + đầu tư ban đầu. Sẽ mở rộng sau."
          href="/finance/assets"
          badge="Sắp có"
          disabled
        />

        <SectionCard
          title="Cấu hình + dữ liệu cũ"
          desc="Thuế TNDN, ngày bắt đầu KD, dữ liệu chi phí/đầu tư cũ (legacy)."
          href="/finance/legacy"
          badge={`${legacyInv.n} đầu tư · ${legacyExp.n} chi phí cũ`}
        />
      </div>

      <p className="text-[11px] text-slate-400 italic">
        Import Excel dùng script local <code>scripts/import-financial-local.ts</code>.
        Không expose UI upload để tránh nhầm lẫn.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionCard({
  title,
  desc,
  href,
  badge,
  highlight,
  disabled,
  children,
}: {
  title: string;
  desc: string;
  href: string;
  badge?: string;
  highlight?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const inner = (
    <div
      className={`bg-white border rounded-xl p-4 h-full transition ${
        disabled
          ? "border-slate-200 opacity-60"
          : highlight
            ? "border-orange-300 hover:border-orange-400 hover:shadow-md"
            : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="font-semibold">{title}</div>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-1">{desc}</p>
      {children}
    </div>
  );
  if (disabled) return <div>{inner}</div>;
  return <Link href={href}>{inner}</Link>;
}
