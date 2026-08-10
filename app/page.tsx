import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/format";
import {
  revenueReconciliations,
  costReconciliations,
  paymentsIn,
  products,
  trialBalance,
} from "@/lib/schema";
import { sql, and, gte, lte } from "drizzle-orm";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { resolvePermissions, type Resource, RESOURCES } from "@/lib/permissions";
import DeniedBanner from "./DeniedBanner";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// ============ Data helpers ============

async function ytdRevenue(year: number): Promise<{ total: number; units: number }> {
  const [r] = await db
    .select({
      total: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8`,
      units: sql<number>`count(distinct ${revenueReconciliations.productId})::int`,
    })
    .from(revenueReconciliations)
    .where(
      and(
        gte(revenueReconciliations.reconciliationDate, `${year}-01-01`),
        lte(revenueReconciliations.reconciliationDate, `${year}-12-31`),
      ),
    );
  return { total: Number(r?.total ?? 0), units: Number(r?.units ?? 0) };
}

async function monthRevenue(month: string): Promise<{ total: number; units: number }> {
  const [r] = await db
    .select({
      total: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8`,
      units: sql<number>`count(distinct ${revenueReconciliations.productId})::int`,
    })
    .from(revenueReconciliations)
    .where(sql`substr(${revenueReconciliations.reconciliationDate}, 1, 7) = ${month}`);
  return { total: Number(r?.total ?? 0), units: Number(r?.units ?? 0) };
}

async function ytdCogs(year: number): Promise<number> {
  const [r] = await db
    .select({ s: sql<number>`coalesce(sum(${costReconciliations.amountPayableThisTime}), 0)::float8` })
    .from(costReconciliations)
    .where(
      and(
        gte(costReconciliations.reconciliationDate, `${year}-01-01`),
        lte(costReconciliations.reconciliationDate, `${year}-12-31`),
      ),
    );
  return Number(r?.s ?? 0);
}

async function cashBalance(): Promise<number> {
  // Ưu tiên trial_balance nếu có, fallback từ bank_transactions running_balance
  const rows = await db
    .select()
    .from(trialBalance)
    .where(sql`account_code IN ('111', '112') AND length(account_code) = 3`)
    .orderBy(sql`period_end DESC`)
    .limit(2);
  if (rows.length > 0) {
    // Lấy period_end mới nhất, sum 111+112 net (debit − credit)
    const latest = rows[0].periodEnd;
    const [r] = await db.execute(sql`
      SELECT COALESCE(SUM(closing_debit - closing_credit), 0)::float8 as s
      FROM trial_balance
      WHERE period_end = ${latest} AND account_code IN ('111', '112')
    `) as any[];
    return Number(r?.s ?? 0);
  }
  // Fallback: bank_transactions latest running_balance
  const [tx] = await db.execute(sql`
    SELECT running_balance FROM bank_transactions
    WHERE running_balance IS NOT NULL
    ORDER BY transaction_date DESC, id DESC LIMIT 1
  `) as any[];
  return Number(tx?.running_balance ?? 0);
}

async function outstanding(): Promise<{ receivable: number; payable: number }> {
  const [rev] = await db
    .select({ s: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8` })
    .from(revenueReconciliations);
  const [pin] = await db
    .select({ s: sql<number>`coalesce(sum(${paymentsIn.amount}), 0)::float8` })
    .from(paymentsIn);
  const receivable = Math.max(0, Number(rev?.s ?? 0) - Number(pin?.s ?? 0));

  // HH còn trả sale = sum(amount_payable) − sum(payments_out) — chỉ tính CHƯA
  // trả cho NV. Dùng payments_out để consistent với /reports/ap-aging.
  // Tất cả cost_type (không chỉ sale_commission) vì các loại KPI/thưởng cũng
  // là "còn trả cho NV" theo cùng logic.
  const [payable] = await db.execute(sql`
    SELECT COALESCE(SUM(GREATEST(0, c.amount_payable_this_time - COALESCE(po.paid, 0))), 0)::float8 as s
    FROM cost_reconciliations c
    LEFT JOIN (
      SELECT cost_reconciliation_id, SUM(amount) AS paid
      FROM payments_out
      GROUP BY cost_reconciliation_id
    ) po ON po.cost_reconciliation_id = c.id
    WHERE c.amount_payable_this_time > 0
  `) as any[];
  return { receivable, payable: Number(payable?.s ?? 0) };
}

async function ytdUnitsClosedByPerson(year: number, limit = 3) {
  return await db.execute(sql`
    SELECT p.sales_person AS name, COUNT(DISTINCT p.id)::int AS units,
      COALESCE(SUM(r.total_receivable_this_time), 0)::float8 AS rev
    FROM revenue_reconciliations r
    JOIN products p ON p.id = r.product_id
    WHERE r.reconciliation_date BETWEEN ${year + '-01-01'} AND ${year + '-12-31'}
      AND p.sales_person IS NOT NULL
    GROUP BY p.sales_person
    ORDER BY rev DESC
    LIMIT ${limit}
  `) as any[];
}

async function ytdRevByProject(year: number, limit = 3) {
  return await db.execute(sql`
    SELECT pj.name, COALESCE(SUM(r.total_receivable_this_time), 0)::float8 as rev,
      COUNT(DISTINCT p.id)::int as units
    FROM revenue_reconciliations r
    JOIN products p ON p.id = r.product_id
    JOIN projects pj ON pj.id = p.project_id
    WHERE r.reconciliation_date BETWEEN ${year + '-01-01'} AND ${year + '-12-31'}
    GROUP BY pj.name
    ORDER BY rev DESC
    LIMIT ${limit}
  `) as any[];
}

// ============ Small components ============

function Kpi({ label, value, sub, color = "default", link }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: "default" | "warn" | "good" | "bad" | "info";
  link?: string;
}) {
  const cls = {
    default: "",
    warn: "ring-amber-300 bg-amber-50",
    good: "ring-green-300 bg-green-50",
    bad: "ring-red-300 bg-red-50",
    info: "ring-blue-300 bg-blue-50",
  }[color];
  const inner = (
    <Card className={cn("px-4 py-3", cls, link && "hover:shadow-sm cursor-pointer transition-shadow")}>
      <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider">{label}</div>
      <div className="text-xl font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </Card>
  );
  return link ? <Link href={link}>{inner}</Link> : inner;
}

function QuickLink({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link href={href} className="bg-card rounded-xl ring-1 ring-foreground/10 p-3 hover:ring-orange-400 transition-colors">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
    </Link>
  );
}

// ============ Page ============

export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const isOwner = user?.role === "owner";
  const perms = user ? resolvePermissions(user.role, user.customPermissions) : {};
  const canView = (r: Resource) => isOwner || (perms[r]?.includes("view") ?? false);
  const canRevenue = canView("revenues");
  const canFinance = canView("finance");

  const now = new Date();
  const year = now.getFullYear();
  const currMonth = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = `T${now.getMonth() + 1}/${String(year).slice(2)}`;

  // Available pages for permission
  const availablePages: Array<[Resource, string, string]> = [
    ["products", "/products", "Danh sách căn"],
    ["revenues", "/revenues", "Doanh thu"],
    ["costs", "/costs", "Giá vốn"],
    ["invoices", "/invoices", "Hóa đơn"],
    ["partners", "/partners", "Đối tác"],
    ["finance", "/finance", "Tài chính"],
    ["employees", "/employees", "Nhân sự"],
    ["reports.profit-detail", "/reports/profit-detail", "Báo cáo"],
  ];
  const userAccessible = availablePages.filter(([r]) => canView(r));

  // Không có quyền gì
  if (!isOwner && userAccessible.length === 0) {
    return (
      <div className="space-y-4">
        {sp.denied && <DeniedBanner label={RESOURCES[sp.denied as Resource] ?? sp.denied} />}
        <h1 className="text-2xl font-bold">Chào {user?.fullName ?? user?.email ?? "bạn"}</h1>
        <p className="text-sm text-slate-500">Tài khoản chưa được cấp quyền. Liên hệ Quản lý.</p>
      </div>
    );
  }

  // Non-owner: chỉ quick links
  if (!isOwner) {
    return (
      <div className="space-y-6">
        {sp.denied && <DeniedBanner label={RESOURCES[sp.denied as Resource] ?? sp.denied} />}
        <div>
          <h1 className="text-2xl font-bold">Chào {user?.fullName ?? user?.email ?? "bạn"}</h1>
          <p className="text-sm text-slate-500 mt-1">Bạn có quyền vào {userAccessible.length} khu vực.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {userAccessible.map(([res, href, label]) => (
            <Link key={href} href={href}
              className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 hover:ring-orange-400 transition-colors">
              <div className="text-sm font-medium text-slate-700">{label}</div>
              <div className="text-xs text-slate-400 mt-1">{RESOURCES[res]}</div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Owner: dashboard tổng hợp
  const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((e) => { console.warn("[home]", e); return fallback; });

  const [
    revYtd,
    revMonth,
    cogsYtd,
    cash,
    owed,
    topSale,
    topProject,
  ] = await Promise.all([
    canRevenue ? safe(ytdRevenue(year), { total: 0, units: 0 }) : Promise.resolve({ total: 0, units: 0 }),
    canRevenue ? safe(monthRevenue(currMonth), { total: 0, units: 0 }) : Promise.resolve({ total: 0, units: 0 }),
    safe(ytdCogs(year), 0),
    canFinance ? safe(cashBalance(), 0) : Promise.resolve(0),
    canFinance ? safe(outstanding(), { receivable: 0, payable: 0 }) : Promise.resolve({ receivable: 0, payable: 0 }),
    canRevenue ? safe(ytdUnitsClosedByPerson(year), []) : Promise.resolve([]),
    canRevenue ? safe(ytdRevByProject(year), []) : Promise.resolve([]),
  ]);

  const revYtdNet = revYtd.total / 1.1;
  const laiGop = revYtdNet - cogsYtd;

  return (
    <div className="space-y-6">
      {sp.denied && <DeniedBanner label={RESOURCES[sp.denied as Resource] ?? sp.denied} />}

      <div>
        <h1 className="text-2xl font-bold">Chào {user?.fullName ?? "bạn"}</h1>
        <p className="text-sm text-slate-500 mt-1">Tổng quan năm {year} · Cập nhật {monthLabel}</p>
      </div>

      {/* Row 1: TIỀN MẶT + LÃI + CÒN THU + CÒN TRẢ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {canFinance && (
          <Kpi
            label="💰 Tiền mặt hiện có"
            value={fmtMoney(cash)}
            sub="TK 111 tiền mặt + TK 112 bank"
            color={cash > 500_000_000 ? "good" : cash > 100_000_000 ? "warn" : "bad"}
            link="/reports/balance-sheet"
          />
        )}
        {canRevenue && (
          <Kpi
            label={`📊 Lãi gộp YTD ${year}`}
            value={fmtMoney(laiGop)}
            sub={`Biên ${revYtdNet > 0 ? ((laiGop / revYtdNet) * 100).toFixed(1) : "0"}%`}
            color={laiGop >= 0 ? "good" : "bad"}
            link="/reports/profit-detail"
          />
        )}
        {canFinance && (
          <Kpi
            label="💵 Công nợ từ CĐT"
            value={fmtMoney(owed.receivable)}
            sub="CĐT còn phải trả HH → A/R aging"
            color="info"
            link="/reports/ar-aging"
          />
        )}
        {canFinance && (
          <Kpi
            label="📤 HH còn trả sale"
            value={fmtMoney(owed.payable)}
            sub="Thường = HH chưa về từ CĐT → A/P aging"
            color="warn"
            link="/reports/ap-aging"
          />
        )}
      </div>

      {/* Row 2: DT tháng + DT YTD */}
      {canRevenue && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi
            label={`Doanh thu ${monthLabel}`}
            value={fmtMoney(revMonth.total)}
            sub={`${revMonth.units} căn chốt tháng này`}
            link="/reports/sales"
          />
          <Kpi
            label={`Doanh thu YTD ${year}`}
            value={fmtMoney(revYtd.total)}
            sub={`${revYtd.units} căn từ đầu năm`}
            link="/reports/sales"
          />
          <Kpi
            label={`Giá vốn YTD ${year}`}
            value={fmtMoney(cogsYtd)}
            sub={`HH sale + KPI + thưởng`}
            link="/reports/commissions"
          />
        </div>
      )}

      {/* Top 3 sale + Top 3 dự án YTD */}
      {canRevenue && (topSale.length > 0 || topProject.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topSale.length > 0 && (
            <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
              <div className="bg-slate-800 text-white p-3 font-bold text-sm">🏆 Top 3 nhân viên (DT YTD)</div>
              <table className="w-full text-sm">
                <tbody>
                  {topSale.map((s: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        <span className="text-xs text-slate-500 mr-2">#{i + 1}</span>
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-slate-400 ml-2">· {s.units} căn</span>
                      </td>
                      <td className="p-2 text-right tabular-nums">{fmtMoney(Number(s.rev))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {topProject.length > 0 && (
            <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
              <div className="bg-slate-800 text-white p-3 font-bold text-sm">🏗️ Top 3 dự án (DT YTD)</div>
              <table className="w-full text-sm">
                <tbody>
                  {topProject.map((p: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        <span className="text-xs text-slate-500 mr-2">#{i + 1}</span>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-slate-400 ml-2">· {p.units} căn</span>
                      </td>
                      <td className="p-2 text-right tabular-nums">{fmtMoney(Number(p.rev))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Link báo cáo đầy đủ */}
      <div className="text-sm">
        <Link href="/reports/kpi-dashboard" className="text-blue-600 hover:underline">
          Xem KPI Dashboard đầy đủ →
        </Link>
        <span className="mx-2 text-slate-400">·</span>
        <Link href="/reports/profit-detail" className="text-blue-600 hover:underline">
          Lãi/lỗ chi tiết
        </Link>
        <span className="mx-2 text-slate-400">·</span>
        <Link href="/reports/cash-flow" className="text-blue-600 hover:underline">
          Dòng tiền
        </Link>
      </div>

      {/* Truy cập nhanh */}
      <div>
        <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider mb-2">Truy cập nhanh</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickLink href="/products" label="Danh sách căn" desc="Xem/thêm căn chốt" />
          <QuickLink href="/revenues" label="Doanh thu" desc="ĐC hoa hồng với CĐT" />
          <QuickLink href="/costs" label="Giá vốn" desc="Trả HH sale team" />
          <QuickLink href="/reports" label="Báo cáo" desc="P&L, cash flow, chi tiết" />
        </div>
      </div>
    </div>
  );
}
