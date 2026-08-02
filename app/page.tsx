import { db } from "@/lib/db";
import { fmtMoney, fmtPctRaw } from "@/lib/format";
import { partners, projects, products, revenueReconciliations, costReconciliations, paymentsIn } from "@/lib/schema";
import { count, sum } from "drizzle-orm";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { resolvePermissions, type Resource, RESOURCES } from "@/lib/permissions";
import DeniedBanner from "./DeniedBanner";
import { cn } from "@/lib/utils";

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
  const [counts, totalRev, totalCost, totalPaidIn] = await Promise.all([
    getCounts(),
    canRevenue || canProfit ? getRevenueTotal() : Promise.resolve(0),
    canCost || canProfit ? getCostTotal() : Promise.resolve(0),
    canPayIn ? getPaidInTotal() : Promise.resolve(0),
  ]);

  const profit = totalRev - totalCost;
  const margin = totalRev > 0 ? (profit / totalRev) * 100 : 0;

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
