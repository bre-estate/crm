import { db } from "@/lib/db";
import { fmtMoney, fmtPctRaw } from "@/lib/format";
import { partners, projects, products, revenueReconciliations, costReconciliations, paymentsIn } from "@/lib/schema";
import { count, sum } from "drizzle-orm";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { resolvePermissions, type Action, type Resource, RESOURCES } from "@/lib/permissions";
import DeniedBanner from "./DeniedBanner";

export const dynamic = "force-dynamic";

async function getStats() {
  const [partnerCount] = await db.select({ c: count() }).from(partners);
  const [projectCount] = await db.select({ c: count() }).from(projects);
  const [productCount] = await db.select({ c: count() }).from(products);
  const [revCount] = await db.select({ c: count() }).from(revenueReconciliations);
  const [costCount] = await db.select({ c: count() }).from(costReconciliations);

  const [totalRev] = await db
    .select({ s: sum(revenueReconciliations.totalReceivableThisTime) })
    .from(revenueReconciliations)
  const [totalCost] = await db
    .select({ s: sum(costReconciliations.amountPayableThisTime) })
    .from(costReconciliations)
  const [totalPaidIn] = await db.select({ s: sum(paymentsIn.amount) }).from(paymentsIn);

  return {
    partners: partnerCount?.c ?? 0,
    projects: projectCount?.c ?? 0,
    products: productCount?.c ?? 0,
    revRec: revCount?.c ?? 0,
    costRec: costCount?.c ?? 0,
    totalRev: Number(totalRev?.s ?? 0),
    totalCost: Number(totalCost?.s ?? 0),
    totalPaidIn: Number(totalPaidIn?.s ?? 0),
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const isOwner = user?.role === "owner";
  const perms = user
    ? resolvePermissions(user.role, user.customPermissions)
    : {};
  const canView = (r: Resource) =>
    isOwner || (perms[r]?.includes("view") ?? false);

  // ============ Owner: full dashboard ============
  if (isOwner) {
    const s = await getStats();
    const profit = s.totalRev - s.totalCost;
    const margin = s.totalRev > 0 ? (profit / s.totalRev) * 100 : 0;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Tổng quan</h1>
          <p className="text-sm text-slate-500 mt-1">
            Bảng theo dõi doanh thu, giá vốn, lợi nhuận toàn công ty.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatLink label="Đối tác" value={s.partners} href="/partners" />
          <StatLink label="Dự án / Hợp đồng" value={s.projects} href="/projects" />
          <StatLink label="Giao dịch (căn chốt)" value={s.products} href="/products" />
          <StatLink label="Đợt đối chiếu DT" value={s.revRec} href="/revenues" />
          <StatLink label="Dòng đối chiếu GV" value={s.costRec} href="/costs" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
            <div className="text-xs text-slate-500">Tổng doanh thu đã đối chiếu</div>
            <div className="text-xl font-bold mt-2 tabular-nums">{fmtMoney(s.totalRev)}</div>
          </div>
          <div className="bg-white border border-orange-300 rounded-xl p-4 bg-orange-50">
            <div className="text-xs text-slate-500">Tổng giá vốn đã đối chiếu</div>
            <div className="text-xl font-bold mt-2 tabular-nums">{fmtMoney(s.totalCost)}</div>
          </div>
          <div
            className={`bg-white border rounded-xl p-4 ${
              profit >= 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"
            }`}
          >
            <div className="text-xs text-slate-500">Lợi nhuận gộp</div>
            <div
              className={`text-xl font-bold mt-2 tabular-nums ${
                profit >= 0 ? "text-green-700" : "text-red-700"
              }`}
            >
              {fmtMoney(profit)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Biên LN: {fmtPctRaw(margin, 1)}</div>
          </div>
          <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
            <div className="text-xs text-slate-500">Tiền đã nhận từ CĐT/F1</div>
            <div className="text-xl font-bold mt-2 tabular-nums">{fmtMoney(s.totalPaidIn)}</div>
            <div className="text-xs text-slate-500 mt-1">
              Còn phải thu: {fmtMoney(s.totalRev - s.totalPaidIn)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ Non-owner: chỉ hiển thị link tới trang được phép ============
  // Xác định danh sách trang user có view.
  const availablePages: Array<{ href: string; label: string; resource: Resource }> = [];
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
    ["alerts", "/alerts", "Cảnh báo"],
    ["departments", "/departments", "Phòng ban"],
  ];
  for (const [res, href, label] of pageMap) {
    if (canView(res)) availablePages.push({ href, label, resource: res });
  }

  return (
    <div className="space-y-6">
      {sp.denied && (
        <DeniedBanner label={RESOURCES[sp.denied as Resource] ?? sp.denied} />
      )}
      <div>
        <h1 className="text-2xl font-bold">
          Chào {user?.fullName ?? user?.email ?? "bạn"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {availablePages.length === 0
            ? "Tài khoản chưa được cấp quyền vào trang nào. Liên hệ chủ tài khoản."
            : `Bạn có quyền truy cập ${availablePages.length} khu vực dưới đây.`}
        </p>
      </div>

      {availablePages.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {availablePages.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 hover:border-orange-400 transition-colors"
            >
              <div className="text-sm font-medium text-slate-700">{p.label}</div>
              <div className="text-xs text-slate-400 mt-1">{p.href}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatLink({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 hover:border-blue-400 transition-colors"
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
    </Link>
  );
}
