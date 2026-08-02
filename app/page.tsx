import { db } from "@/lib/db";
import { fmtMoney, fmtPctRaw } from "@/lib/format";
import { partners, projects, products, revenueReconciliations, costReconciliations, paymentsIn } from "@/lib/schema";
import { count, sum, sql, gte, isNotNull, and } from "drizzle-orm";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { resolvePermissions, type Resource, RESOURCES } from "@/lib/permissions";
import DeniedBanner from "./DeniedBanner";
import { cn } from "@/lib/utils";

// Trả về [YYYY-MM, YYYY-MM, YYYY-MM] — 3 tháng gần nhất tính đến hôm nay,
// oldest first. VD hôm nay 2026-08-02 → ["2026-06", "2026-07", "2026-08"].
function last3Months(): string[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-11
  const months: string[] = [];
  for (let i = 2; i >= 0; i--) {
    const total = y * 12 + m - i;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    months.push(`${ny}-${String(nm).padStart(2, "0")}`);
  }
  return months;
}

// Group by first 7 chars của reconciliationDate (YYYY-MM). Chỉ lấy 3 tháng
// gần nhất để giảm data scan.
async function getMonthlyRevenue(startMonth: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      month: sql<string>`substr(${revenueReconciliations.reconciliationDate}, 1, 7)`.as("month"),
      total: sum(revenueReconciliations.totalReceivableThisTime).as("total"),
    })
    .from(revenueReconciliations)
    .where(
      and(
        isNotNull(revenueReconciliations.reconciliationDate),
        gte(revenueReconciliations.reconciliationDate, `${startMonth}-01`),
      ),
    )
    .groupBy(sql`substr(${revenueReconciliations.reconciliationDate}, 1, 7)`);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.month, Number(r.total ?? 0));
  return map;
}

async function getMonthlyCost(startMonth: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      month: sql<string>`substr(${costReconciliations.reconciliationDate}, 1, 7)`.as("month"),
      total: sum(costReconciliations.amountPayableThisTime).as("total"),
    })
    .from(costReconciliations)
    .where(
      and(
        isNotNull(costReconciliations.reconciliationDate),
        gte(costReconciliations.reconciliationDate, `${startMonth}-01`),
      ),
    )
    .groupBy(sql`substr(${costReconciliations.reconciliationDate}, 1, 7)`);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.month, Number(r.total ?? 0));
  return map;
}

export const dynamic = "force-dynamic";

async function getCounts() {
  const [partnerCount] = await db.select({ c: count() }).from(partners);
  const [projectCount] = await db.select({ c: count() }).from(projects);
  const [productCount] = await db.select({ c: count() }).from(products);
  const [revCount] = await db.select({ c: count() }).from(revenueReconciliations);
  const [costCount] = await db.select({ c: count() }).from(costReconciliations);
  return {
    partners: partnerCount?.c ?? 0,
    projects: projectCount?.c ?? 0,
    products: productCount?.c ?? 0,
    revRec: revCount?.c ?? 0,
    costRec: costCount?.c ?? 0,
  };
}

async function getRevenueTotal() {
  const [r] = await db
    .select({ s: sum(revenueReconciliations.totalReceivableThisTime) })
    .from(revenueReconciliations);
  return Number(r?.s ?? 0);
}

async function getCostTotal() {
  const [r] = await db
    .select({ s: sum(costReconciliations.amountPayableThisTime) })
    .from(costReconciliations);
  return Number(r?.s ?? 0);
}

async function getPaidInTotal() {
  const [r] = await db.select({ s: sum(paymentsIn.amount) }).from(paymentsIn);
  return Number(r?.s ?? 0);
}

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

  // Permissions for each stat block
  const canRevenue = canView("revenues");
  const canCost = canView("costs");
  const canProfit = canView("reports.unit-profitability") || canView("finance");
  const canPayIn = canView("finance");
  const canAnyMoney = canRevenue || canCost || canProfit || canPayIn;

  // Available quick-link pages (dùng cho block cuối, luôn show)
  const pageMap: Array<[Resource, string, string]> = [
    ["products", "/products", "Danh sách căn"],
    ["revenues", "/revenues", "Doanh thu"],
    ["costs", "/costs", "Giá vốn"],
    ["invoices", "/invoices", "Hóa đơn"],
    ["partners", "/partners", "Đối tác"],
    ["finance", "/finance", "Tài chính"],
    ["employees", "/employees", "Nhân sự"],
    ["reports.overview", "/reports/overview", "Báo cáo tổng hợp"],
    ["reports.management", "/reports/management", "Báo cáo quản trị"],
    ["reports.people", "/reports/people", "Báo cáo theo nhân sự"],
    ["reports.segments", "/reports/segments", "Phân khúc căn"],
    ["reports.unit-profitability", "/reports/unit-profitability", "Lãi từng căn"],
    ["reports.balance-sheet", "/reports/balance-sheet", "Bảng cân đối kế toán"],
    ["reports.cash-flow-statement", "/reports/cash-flow-statement", "Lưu chuyển tiền tệ"],
    ["alerts", "/alerts", "Thông báo"],
    ["departments", "/departments", "Phòng ban"],
  ];
  const availablePages = pageMap.filter(([r]) => canView(r));

  const noAccess = !isOwner && availablePages.length === 0;
  if (noAccess) {
    return (
      <div className="space-y-6">
        {sp.denied && <DeniedBanner label={RESOURCES[sp.denied as Resource] ?? sp.denied} />}
        <div>
          <h1 className="text-2xl font-bold">
            Chào {user?.fullName ?? user?.email ?? "bạn"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tài khoản chưa được cấp quyền vào trang nào. Liên hệ chủ tài khoản.
          </p>
        </div>
      </div>
    );
  }

  // Query stats — chỉ khi có quyền tương ứng. Parallel để tiết kiệm.
  const months3 = last3Months();
  const [counts, totalRev, totalCost, totalPaidIn, revByMonth, costByMonth] = await Promise.all([
    getCounts(),
    canRevenue || canProfit ? getRevenueTotal() : Promise.resolve(0),
    canCost || canProfit ? getCostTotal() : Promise.resolve(0),
    canPayIn ? getPaidInTotal() : Promise.resolve(0),
    canRevenue || canProfit ? getMonthlyRevenue(months3[0]) : Promise.resolve(new Map<string, number>()),
    canCost || canProfit ? getMonthlyCost(months3[0]) : Promise.resolve(new Map<string, number>()),
  ]);

  const profit = totalRev - totalCost;
  const margin = totalRev > 0 ? (profit / totalRev) * 100 : 0;

  // 3-month breakdown data
  const revPerMonth = months3.map((m) => revByMonth.get(m) ?? 0);
  const costPerMonth = months3.map((m) => costByMonth.get(m) ?? 0);
  const profitPerMonth = revPerMonth.map((r, i) => r - costPerMonth[i]);
  const marginPerMonth = revPerMonth.map((r, i) => (r > 0 ? (profitPerMonth[i] / r) * 100 : 0));
  const revTotal3 = revPerMonth.reduce((s, x) => s + x, 0);
  const costTotal3 = costPerMonth.reduce((s, x) => s + x, 0);
  const profitTotal3 = revTotal3 - costTotal3;
  const marginTotal3 = revTotal3 > 0 ? (profitTotal3 / revTotal3) * 100 : 0;
  const showRev3 = canRevenue;
  const showCost3 = canCost;
  const showProfit3 = canProfit;
  const showBlock3 = showRev3 || showCost3 || showProfit3;
  const currentMonth = months3[months3.length - 1];

  const canProducts = canView("products");
  const canPartners = canView("partners");
  const canRevReconLink = canView("revenues");
  const canCostReconLink = canView("costs");

  return (
    <div className="space-y-6">
      {sp.denied && <DeniedBanner label={RESOURCES[sp.denied as Resource] ?? sp.denied} />}
      <div>
        <h1 className="text-2xl font-bold">
          {isOwner ? "Tổng quan" : `Chào ${user?.fullName ?? user?.email ?? "bạn"}`}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isOwner
            ? "Bảng theo dõi doanh thu, giá vốn, lợi nhuận toàn công ty."
            : `Bạn có quyền vào ${availablePages.length} khu vực.`}
        </p>
      </div>

      {/* Count cards — hiển thị theo quyền view của từng resource */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {canPartners && <StatLink label="Đối tác" value={counts.partners} href="/partners" />}
        {canProducts && (
          <StatLink label="Dự án / Hợp đồng" value={counts.projects} href="/projects" />
        )}
        {canProducts && (
          <StatLink label="Giao dịch (căn chốt)" value={counts.products} href="/products" />
        )}
        {canRevReconLink && (
          <StatLink label="Đợt đối chiếu DT" value={counts.revRec} href="/revenues" />
        )}
        {canCostReconLink && (
          <StatLink label="Dòng đối chiếu GV" value={counts.costRec} href="/costs" />
        )}
      </div>

      {/* Money cards — hiển thị theo quyền */}
      {canAnyMoney && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {canRevenue && (
            <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
              <div className="text-xs text-slate-500">Tổng doanh thu đã đối chiếu</div>
              <div className="text-xl font-bold mt-2 tabular-nums">{fmtMoney(totalRev)}</div>
            </div>
          )}
          {canCost && (
            <div className="bg-orange-50 rounded-xl ring-1 ring-orange-300 p-4">
              <div className="text-xs text-slate-500">Tổng giá vốn đã đối chiếu</div>
              <div className="text-xl font-bold mt-2 tabular-nums">{fmtMoney(totalCost)}</div>
            </div>
          )}
          {canProfit && (
            <div
              className={cn(
                "rounded-xl ring-1 p-4",
                profit >= 0 ? "ring-green-300 bg-green-50" : "ring-red-300 bg-red-50",
              )}
            >
              <div className="text-xs text-slate-500">Lợi nhuận gộp</div>
              <div
                className={cn(
                  "text-xl font-bold mt-2 tabular-nums",
                  profit >= 0 ? "text-green-700" : "text-red-700",
                )}
              >
                {fmtMoney(profit)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Biên LN: {fmtPctRaw(margin, 1)}</div>
            </div>
          )}
          {canPayIn && (
            <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
              <div className="text-xs text-slate-500">Tiền đã nhận từ CĐT/F1</div>
              <div className="text-xl font-bold mt-2 tabular-nums">{fmtMoney(totalPaidIn)}</div>
              {canRevenue && (
                <div className="text-xs text-slate-500 mt-1">
                  Còn phải thu: {fmtMoney(totalRev - totalPaidIn)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== 3 tháng gần nhất — snapshot bức tranh kinh doanh ===== */}
      {showBlock3 && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider">
              📊 3 tháng gần nhất
            </div>
            <div className="text-[10px] text-slate-400 italic">
              * {formatMonthLabel(currentMonth)} tính đến hôm nay
            </div>
          </div>
          <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="text-left p-3 font-medium"></th>
                  {months3.map((m, i) => (
                    <th key={m} className="text-right p-3 font-medium">
                      {formatMonthLabel(m)}
                      {i === months3.length - 1 && "*"}
                    </th>
                  ))}
                  <th className="text-right p-3 font-semibold bg-slate-100">Tổng 3T</th>
                </tr>
              </thead>
              <tbody>
                {showRev3 && (
                  <tr className="border-t border-slate-100">
                    <td className="p-3 text-slate-700">Doanh thu</td>
                    {revPerMonth.map((v, i) => (
                      <td key={i} className="p-3 text-right tabular-nums">{fmtMoney(v)}</td>
                    ))}
                    <td className="p-3 text-right tabular-nums font-semibold bg-slate-50">
                      {fmtMoney(revTotal3)}
                    </td>
                  </tr>
                )}
                {showCost3 && (
                  <tr className="border-t border-slate-100">
                    <td className="p-3 text-slate-700">Giá vốn</td>
                    {costPerMonth.map((v, i) => (
                      <td key={i} className="p-3 text-right tabular-nums text-orange-700">
                        {fmtMoney(v)}
                      </td>
                    ))}
                    <td className="p-3 text-right tabular-nums font-semibold text-orange-700 bg-slate-50">
                      {fmtMoney(costTotal3)}
                    </td>
                  </tr>
                )}
                {showProfit3 && (
                  <>
                    <tr className="border-t border-slate-100">
                      <td className="p-3 text-slate-700 font-medium">Lãi gộp</td>
                      {profitPerMonth.map((v, i) => (
                        <td
                          key={i}
                          className={cn(
                            "p-3 text-right tabular-nums font-medium",
                            v >= 0 ? "text-green-700" : "text-red-700",
                          )}
                        >
                          {fmtMoney(v)}
                        </td>
                      ))}
                      <td
                        className={cn(
                          "p-3 text-right tabular-nums font-bold bg-slate-50",
                          profitTotal3 >= 0 ? "text-green-700" : "text-red-700",
                        )}
                      >
                        {fmtMoney(profitTotal3)}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="p-3 text-slate-500 text-xs">Biên LN</td>
                      {marginPerMonth.map((v, i) => (
                        <td key={i} className="p-3 text-right tabular-nums text-xs text-slate-500">
                          {revPerMonth[i] > 0 ? fmtPctRaw(v, 1) : "—"}
                        </td>
                      ))}
                      <td className="p-3 text-right tabular-nums text-xs text-slate-500 font-semibold bg-slate-50">
                        {revTotal3 > 0 ? fmtPctRaw(marginTotal3, 1) : "—"}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick links — non-owner luôn thấy, owner ẩn (đã có sidebar) */}
      {!isOwner && availablePages.length > 0 && (
        <div>
          <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider mb-2">
            Truy cập nhanh
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {availablePages.map(([res, href, label]) => (
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
      )}
    </div>
  );
}

// "2026-08" → "T8/26"
function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `T${Number(m)}/${y.slice(-2)}`;
}

function StatLink({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 hover:ring-blue-400 transition-colors"
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
    </Link>
  );
}
