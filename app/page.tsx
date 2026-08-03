import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/format";
import {
  revenueReconciliations,
  costReconciliations,
  paymentsIn,
  paymentsOut,
  financialTransactions,
  products,
} from "@/lib/schema";
import { sql, and, eq, inArray, gte, lte, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { resolvePermissions, type Resource, RESOURCES } from "@/lib/permissions";
import DeniedBanner from "./DeniedBanner";
import { cn } from "@/lib/utils";
import { OPEX_MGMT_CATEGORIES } from "@/lib/accounting/categories";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers
// ============================================================================

function currentAndPrevMonth(): { curr: string; prev: string } {
  const now = new Date();
  const curr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
  return { curr, prev };
}

async function monthRevenue(month: string): Promise<number> {
  const [r] = await db
    .select({ s: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8` })
    .from(revenueReconciliations)
    .where(sql`substr(${revenueReconciliations.reconciliationDate}, 1, 7) = ${month}`);
  return Number(r?.s ?? 0);
}

async function monthCost(month: string): Promise<number> {
  const [rec] = await db
    .select({ s: sql<number>`coalesce(sum(${costReconciliations.amountPayableThisTime}), 0)::float8` })
    .from(costReconciliations)
    .where(sql`substr(${costReconciliations.reconciliationDate}, 1, 7) = ${month}`);
  const [fin] = await db
    .select({ s: sql<number>`coalesce(sum(${financialTransactions.amount}), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.direction, "out"),
        eq(financialTransactions.categoryCode, "6417"),
        eq(financialTransactions.accrualMonth, month),
      ),
    );
  return Number(rec?.s ?? 0) + Number(fin?.s ?? 0);
}

async function monthOpex(month: string): Promise<number> {
  const [r] = await db
    .select({ s: sql<number>`coalesce(sum(${financialTransactions.amount}), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.direction, "out"),
        inArray(financialTransactions.categoryCode, OPEX_MGMT_CATEGORIES),
        eq(financialTransactions.accrualMonth, month),
      ),
    );
  return Number(r?.s ?? 0);
}

async function monthProductsClosed(month: string): Promise<number> {
  const [r] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(products)
    .where(sql`substr(${products.depositDate}, 1, 7) = ${month}`);
  return Number(r?.c ?? 0);
}

// Còn thu CĐT = revenue_reconciliations.totalReceivable − sum(payments_in đã nhận)
async function receivableOutstanding(): Promise<number> {
  const [rev] = await db
    .select({ s: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8` })
    .from(revenueReconciliations);
  const [pIn] = await db
    .select({ s: sql<number>`coalesce(sum(${paymentsIn.amount}), 0)::float8` })
    .from(paymentsIn);
  return Math.max(0, Number(rev?.s ?? 0) - Number(pIn?.s ?? 0));
}

// Còn trả sale = cost_reconciliations.amountPayable − sum(payments_out đã trả)
async function payableOutstanding(): Promise<number> {
  const [cost] = await db
    .select({ s: sql<number>`coalesce(sum(${costReconciliations.amountPayableThisTime}), 0)::float8` })
    .from(costReconciliations);
  const [pOut] = await db
    .select({ s: sql<number>`coalesce(sum(${paymentsOut.amount}), 0)::float8` })
    .from(paymentsOut);
  return Math.max(0, Number(cost?.s ?? 0) - Number(pOut?.s ?? 0));
}

// Cash runway = (payments_in trailing 3M − payments_out trailing 3M − OPEX trailing 3M) / 3
// → dự phóng mỗi tháng cty tiêu bao nhiêu, còn cover được bao nhiêu tháng.
async function cashRunway(): Promise<{ months: number | null; burnRate: number }> {
  const now = new Date();
  const start3M = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const startStr = start3M.toISOString().slice(0, 10);
  const endStr = now.toISOString().slice(0, 10);

  const [pIn3M] = await db
    .select({ s: sql<number>`coalesce(sum(${paymentsIn.amount}), 0)::float8` })
    .from(paymentsIn)
    .where(and(gte(paymentsIn.paymentDate, startStr), lte(paymentsIn.paymentDate, endStr)));
  const [pOut3M] = await db
    .select({ s: sql<number>`coalesce(sum(${paymentsOut.amount}), 0)::float8` })
    .from(paymentsOut)
    .where(and(gte(paymentsOut.paymentDate, startStr), lte(paymentsOut.paymentDate, endStr)));
  const [opex3M] = await db
    .select({ s: sql<number>`coalesce(sum(${financialTransactions.amount}), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.direction, "out"),
        inArray(financialTransactions.categoryCode, OPEX_MGMT_CATEGORIES),
        gte(financialTransactions.transactionMonth, startStr.slice(0, 7)),
      ),
    );

  const inflow = Number(pIn3M?.s ?? 0);
  const outflow = Number(pOut3M?.s ?? 0) + Number(opex3M?.s ?? 0);
  const netBurn = (outflow - inflow) / 3; // per month

  // Nếu đang lãi ròng (inflow > outflow) → runway "∞"
  if (netBurn <= 0) return { months: null, burnRate: 0 };
  return { months: 6, burnRate: netBurn }; // TODO: tính chính xác cần cash balance
}

// ============================================================================
// Small helper components
// ============================================================================

function KpiCard({
  label,
  value,
  delta,
  sub,
  color = "default",
}: {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  sub?: React.ReactNode;
  color?: "default" | "warn" | "good" | "bad";
}) {
  const ring = {
    default: "",
    warn: "ring-amber-300 bg-amber-50",
    good: "ring-green-300 bg-green-50",
    bad: "ring-red-300 bg-red-50",
  }[color];
  return (
    <Card className={cn("px-4", ring)}>
      <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      {delta && <div className="text-xs mt-1">{delta}</div>}
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </Card>
  );
}

function DeltaText({ curr, prev, label }: { curr: number; prev: number; label: string }) {
  if (prev === 0) return <span className="text-slate-400">— {label}</span>;
  const pct = ((curr - prev) / prev) * 100;
  const good = curr >= prev;
  return (
    <span className={good ? "text-green-700" : "text-red-700"}>
      {good ? "↑" : "↓"} {Math.abs(pct).toFixed(0)}% {label}
    </span>
  );
}

// ============================================================================
// Page
// ============================================================================

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const isOwner = user?.role === "owner";
  const perms = user ? resolvePermissions(user.role, user.customPermissions) : {};
  const canView = (r: Resource) => isOwner || (perms[r]?.includes("view") ?? false);
  const canRevenue = canView("revenues");
  const canCost = canView("costs");
  const canFinance = canView("finance");

  const { curr, prev } = currentAndPrevMonth();

  const availablePages: Array<[Resource, string, string]> = [
    ["products", "/products", "Danh sách căn"],
    ["revenues", "/revenues", "Doanh thu"],
    ["costs", "/costs", "Giá vốn"],
    ["invoices", "/invoices", "Hóa đơn"],
    ["partners", "/partners", "Đối tác"],
    ["finance", "/finance", "Tài chính"],
    ["employees", "/employees", "Nhân sự"],
    ["reports.overview", "/reports/overview", "Báo cáo"],
  ];
  const userAccessible = availablePages.filter(([r]) => canView(r));

  // Not authorized to anything
  if (!isOwner && userAccessible.length === 0) {
    return (
      <div className="space-y-4">
        {sp.denied && <DeniedBanner label={RESOURCES[sp.denied as Resource] ?? sp.denied} />}
        <h1 className="text-2xl font-bold">Chào {user?.fullName ?? user?.email ?? "bạn"}</h1>
        <p className="text-sm text-slate-500">
          Tài khoản chưa được cấp quyền. Liên hệ chủ tài khoản.
        </p>
      </div>
    );
  }

  // Non-owner: simple quick links only
  if (!isOwner) {
    return (
      <div className="space-y-6">
        {sp.denied && <DeniedBanner label={RESOURCES[sp.denied as Resource] ?? sp.denied} />}
        <div>
          <h1 className="text-2xl font-bold">Chào {user?.fullName ?? user?.email ?? "bạn"}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Bạn có quyền vào {userAccessible.length} khu vực.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {userAccessible.map(([res, href, label]) => (
            <Link
              key={href}
              href={href}
              className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 hover:ring-orange-400 transition-colors"
            >
              <div className="text-sm font-medium text-slate-700">{label}</div>
              <div className="text-xs text-slate-400 mt-1">{RESOURCES[res]}</div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Owner: KPI dashboard
  const [
    revCurr, revPrev,
    costCurr, costPrev,
    opexCurr,
    unitsCurr, unitsPrev,
    receivable, payable,
    runway,
  ] = await Promise.all([
    canRevenue ? monthRevenue(curr) : Promise.resolve(0),
    canRevenue ? monthRevenue(prev) : Promise.resolve(0),
    canCost ? monthCost(curr) : Promise.resolve(0),
    canCost ? monthCost(prev) : Promise.resolve(0),
    canFinance ? monthOpex(curr) : Promise.resolve(0),
    monthProductsClosed(curr),
    monthProductsClosed(prev),
    canRevenue ? receivableOutstanding() : Promise.resolve(0),
    canCost ? payableOutstanding() : Promise.resolve(0),
    canFinance ? cashRunway() : Promise.resolve({ months: null, burnRate: 0 }),
  ]);

  const monthLabel = `T${Number(curr.slice(5))}/${curr.slice(2, 4)}`;

  return (
    <div className="space-y-6">
      {sp.denied && <DeniedBanner label={RESOURCES[sp.denied as Resource] ?? sp.denied} />}

      <div>
        <h1 className="text-2xl font-bold">Chào {user?.fullName ?? "bạn"}</h1>
        <p className="text-sm text-slate-500 mt-1">
          Bức tranh kinh doanh tháng {monthLabel} — so với tháng trước
        </p>
      </div>

      {/* 6 KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {canRevenue && (
          <KpiCard
            label="Doanh thu tháng"
            value={fmtMoney(revCurr)}
            delta={<DeltaText curr={revCurr} prev={revPrev} label={`vs T${Number(prev.slice(5))}`} />}
            color={revCurr >= revPrev ? "good" : "warn"}
          />
        )}

        <KpiCard
          label="Số căn chốt tháng"
          value={`${unitsCurr} căn`}
          delta={<DeltaText curr={unitsCurr} prev={unitsPrev} label={`vs T${Number(prev.slice(5))}`} />}
          color={unitsCurr >= unitsPrev ? "good" : "warn"}
        />

        {canRevenue && (
          <KpiCard
            label="Còn thu CĐT"
            value={fmtMoney(receivable)}
            sub="Nghĩa vụ CĐT còn phải trả cty (theo ĐC)"
            color={receivable > 3_000_000_000 ? "warn" : "default"}
          />
        )}

        {canCost && (
          <KpiCard
            label="Giá vốn tháng (HH sale)"
            value={fmtMoney(costCurr)}
            delta={<DeltaText curr={costCurr} prev={costPrev} label={`vs T${Number(prev.slice(5))}`} />}
          />
        )}

        {canCost && (
          <KpiCard
            label="Còn trả sale team"
            value={fmtMoney(payable)}
            sub="Nghĩa vụ HH sale + thưởng chưa trả"
            color={payable > 1_000_000_000 ? "warn" : "default"}
          />
        )}

        {canFinance && (
          <KpiCard
            label={runway.months === null ? "Cash flow" : "Cash runway"}
            value={
              runway.months === null ? (
                <span className="text-green-700">Đang lãi ròng</span>
              ) : (
                `${runway.months} tháng`
              )
            }
            sub={
              runway.months === null
                ? "Thu > Chi (trailing 3 tháng)"
                : `Burn ${fmtMoney(runway.burnRate)}/tháng`
            }
            color={runway.months === null ? "good" : runway.months < 3 ? "bad" : "warn"}
          />
        )}
      </div>

      {/* Xu hướng 6 tháng — link đến báo cáo detail */}
      <Card className="[--card-spacing:1rem] px-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm font-semibold">Xu hướng 6 tháng</div>
            <div className="text-xs text-slate-500">
              Lãi gộp = Doanh thu (excl VAT) − HH sale − Thưởng
              {" · "}
              Lãi thuần = Lãi gộp − Chi phí quản lý (thuê, lương admin, thuế…)
            </div>
          </div>
          <Link
            href="/reports/management"
            className="text-xs text-blue-600 hover:underline whitespace-nowrap"
          >
            Xem chi tiết →
          </Link>
        </div>
        <div className="text-xs text-slate-500 italic mt-2">
          Biên gộp 6T gần nhất: {revCurr + revPrev > 0
            ? `${((((revCurr + revPrev) / 1.1) - (costCurr + costPrev)) / ((revCurr + revPrev) / 1.1) * 100).toFixed(1)}%`
            : "—"}
          {" · "}
          OPEX tháng {monthLabel}: {fmtMoney(opexCurr)}
        </div>
      </Card>

      {/* Truy cập nhanh */}
      <div>
        <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider mb-2">
          Truy cập nhanh
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickLink href="/products" label="Danh sách căn" desc="Xem/thêm căn chốt" />
          <QuickLink href="/revenues" label="Doanh thu" desc="ĐC hoa hồng với CĐT" />
          <QuickLink href="/costs" label="Giá vốn" desc="Trả HH sale team" />
          <QuickLink href="/reports/management" label="Báo cáo" desc="P&L, cash flow, chi tiết" />
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link
      href={href}
      className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 hover:ring-orange-400 transition-colors"
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
    </Link>
  );
}
