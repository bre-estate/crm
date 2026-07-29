"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Action, Resource } from "@/lib/permissions";

type NavLeaf = {
  href: string;
  label: string;
  /** Resource key — visible nếu user có 'view' permission. Nếu không set → luôn visible. */
  resource?: Resource;
  /** Owner-only override (VD Admin/user management). */
  ownerOnly?: boolean;
  section?: string;
  /** exact match — nếu true, chỉ active khi pathname === href. */
  exact?: boolean;
};

type NavGroup = {
  label: string;
  href?: string;
  /** Group-level ownerOnly hoặc resource: nếu set và không pass → ẩn cả group. */
  ownerOnly?: boolean;
  resource?: Resource;
  children: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;

const isGroup = (n: NavEntry): n is NavGroup => "children" in n;

const NAV: NavEntry[] = [
  { href: "/", label: "Tổng quan" },
  { href: "/alerts", label: "🔔 Cảnh báo", resource: "alerts" },
  { href: "/partners", label: "Đối tác", resource: "partners" },
  { href: "/projects", label: "Dự án", resource: "products" },
  {
    label: "Giao dịch",
    children: [
      { href: "/products", label: "Danh sách căn", resource: "products" },
      { href: "/revenues", label: "Doanh thu", resource: "revenues" },
      { href: "/costs", label: "Giá vốn", resource: "costs" },
      { href: "/invoices", label: "Hóa đơn", resource: "invoices" },
    ],
  },
  {
    label: "Báo cáo",
    href: "/reports",
    children: [
      // TỔNG QUAN
      { href: "/reports/overview", label: "Tổng hợp", resource: "reports.overview", section: "Tổng quan" },
      { href: "/reports/management", label: "Quản trị", resource: "reports.management", section: "Tổng quan" },
      { href: "/reports/unit-profitability", label: "Lãi từng căn", resource: "reports.unit-profitability", section: "Tổng quan" },
      // TÀI CHÍNH
      { href: "/reports/balance-sheet", label: "BCĐKT", resource: "reports.balance-sheet", section: "Tài chính" },
      { href: "/reports/cash-flow-statement", label: "LCTT", resource: "reports.cash-flow-statement", section: "Tài chính" },
      { href: "/reports/cashflow", label: "Dòng tiền HH", ownerOnly: true, section: "Tài chính" },
      // THỊ TRƯỜNG
      { href: "/reports/segments", label: "Phân khúc", resource: "reports.segments", section: "Thị trường" },
      { href: "/reports/projects", label: "Theo dự án", resource: "reports.overview", section: "Thị trường" },
      { href: "/reports/partners", label: "Đối tác", resource: "reports.overview", section: "Thị trường" },
      // NỘI BỘ
      { href: "/reports/people", label: "Theo nhân sự", resource: "reports.people", section: "Nội bộ" },
      { href: "/reports/hr-checks", label: "Kiểm tra HR", resource: "reports.hr-checks", section: "Nội bộ" },
      { href: "/reports/time", label: "Theo thời gian", resource: "reports.overview", section: "Nội bộ" },
    ],
  },
  {
    label: "Tài chính",
    href: "/finance",
    resource: "finance",
    children: [
      { href: "/finance/capital", label: "Vốn góp founder", resource: "finance" },
      { href: "/finance/assets", label: "Tài sản cố định", resource: "finance" },
      { href: "/finance/transactions", label: "Giao dịch", resource: "finance" },
    ],
  },
  {
    label: "Nhân sự",
    resource: "employees",
    children: [
      { href: "/employees", label: "Nhân viên", resource: "employees" },
      { href: "/departments", label: "Phòng ban", resource: "departments" },
    ],
  },
  { href: "/admin/users", label: "Quản lý user", ownerOnly: true },
  { href: "/admin/activity", label: "Lịch sử hoạt động", resource: "admin.activity" },
];

function isActive(pathname: string, href: string, exact = false): boolean {
  if (href === "/") return pathname === "/";
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function NavLinks({
  isOwner,
  permissions,
}: {
  isOwner: boolean;
  permissions: Record<string, Action[]>;
}) {
  const pathname = usePathname();

  const canSee = (entry: NavLeaf | NavGroup): boolean => {
    if (entry.ownerOnly) return isOwner;
    if (isOwner) return true;
    if (!entry.resource) return true; // no gate → visible cho mọi người authenticated
    return permissions[entry.resource]?.includes("view") ?? false;
  };

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {NAV.map((n) => {
        if (!canSee(n)) return null;

        if (!isGroup(n)) {
          const active = isActive(pathname, n.href, n.exact);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={
                active
                  ? "block px-3 py-2 rounded-lg text-sm font-medium bg-orange-50 text-orange-700 border-l-2 border-orange-500"
                  : "block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-colors"
              }
            >
              {n.label}
            </Link>
          );
        }

        const visibleChildren = n.children.filter((c) => canSee(c));
        if (visibleChildren.length === 0) return null;

        const parentActive = n.href ? pathname === n.href : false;
        return (
          <div key={n.label} className="pt-1">
            {n.href ? (
              <Link
                href={n.href}
                className={
                  parentActive
                    ? "block px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-700 border-l-2 border-orange-500"
                    : "block px-3 py-1.5 rounded-lg text-sm text-slate-700 font-medium hover:bg-slate-100 transition-colors"
                }
              >
                {n.label}
              </Link>
            ) : (
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {n.label}
              </div>
            )}
            <div className="space-y-0.5 mt-0.5">
              {(() => {
                const rendered: React.ReactNode[] = [];
                let lastSection = "__none__";
                for (const c of visibleChildren) {
                  const sec = c.section ?? "__nosec__";
                  if (sec !== lastSection && c.section) {
                    rendered.push(
                      <div
                        key={`sec-${sec}`}
                        className="pl-6 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                      >
                        {c.section}
                      </div>,
                    );
                  }
                  lastSection = sec;
                  const active = isActive(pathname, c.href, c.exact);
                  rendered.push(
                    <Link
                      key={c.href}
                      href={c.href}
                      className={
                        active
                          ? `block ${c.section ? "pl-9" : "pl-6"} pr-3 py-1.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-700 border-l-2 border-orange-500`
                          : `block ${c.section ? "pl-9" : "pl-6"} pr-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-colors`
                      }
                    >
                      {c.label}
                    </Link>,
                  );
                }
                return rendered;
              })()}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
