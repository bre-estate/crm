import { db } from "@/lib/db";
import { financialTransactions, companySettings } from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { sql, eq, inArray, and, ne } from "drizzle-orm";
import Link from "next/link";
import SettingsForm from "./SettingsForm";
import { updateSettings } from "@/lib/actions/finance";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default async function FinanceLandingPage() {
  await requirePermission("finance");

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

  // Settings (thuế TNDN + ngày bắt đầu KD)
  const settingsRows = await db.select().from(companySettings);
  const settings = settingsRows[0] ?? { id: 1, taxRate: 0.2, businessStartDate: null };

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
          sub={
            capitalTotal > 0
              ? `${(((byFounder.get("Triết") ?? 0) / capitalTotal) * 100).toFixed(1)}% tổng`
              : "—"
          }
        />
        <StatCard
          label="Vốn góp Bách"
          value={fmt(byFounder.get("Bách") ?? 0)}
          sub={
            capitalTotal > 0
              ? `${(((byFounder.get("Bách") ?? 0) / capitalTotal) * 100).toFixed(1)}% tổng`
              : "—"
          }
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
          title="Tài sản cố định"
          desc="Tài sản cố định / công cụ dụng cụ (máy móc, thiết bị văn phòng) với khấu hao đường thẳng 3 năm. Khấu hao/tháng cộng vào chi phí hoạt động."
          href="/finance/assets"
          badge="Tài sản cố định"
        />
      </div>

      {/* Cấu hình cty — inline vì đơn giản, ít khi sửa */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold">⚙️ Cấu hình</h2>
        <p className="text-xs text-slate-500 mb-3">
          Thuế TNDN (%) + ngày bắt đầu kinh doanh (dùng tính Thời gian hoàn vốn).
        </p>
        <SettingsForm
          settings={settings}
          onSave={async (fd) => {
            "use server";
            await updateSettings(fd);
          }}
        />
      </div>

      <p className="text-[11px] text-slate-400 italic">
        Nạp dữ liệu Excel dùng script cục bộ <code>scripts/import-financial-local.ts</code>.
        Không hiển thị giao diện tải lên để tránh nhầm lẫn.
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
