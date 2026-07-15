"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Gate = "owner" | "reports";

type NavLeaf = {
  href: string;
  label: string;
  gate?: Gate;
};

type NavGroup = {
  label: string;
  gate?: Gate;
  children: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;

const isGroup = (n: NavEntry): n is NavGroup => "children" in n;

const NAV: NavEntry[] = [
  { href: "/", label: "Tổng quan" },
  { href: "/partners", label: "Đối tác" },
  { href: "/projects", label: "Dự án" },
  {
    label: "Giao dịch",
    children: [
      { href: "/products", label: "Danh sách căn" },
      { href: "/revenues", label: "Doanh thu" },
      { href: "/costs", label: "Giá vốn" },
      { href: "/invoices", label: "Hóa đơn" },
    ],
  },
  {
    label: "Báo cáo",
    gate: "reports",
    children: [
      { href: "/reports/overview", label: "Tổng hợp" },
      { href: "/reports/projects", label: "Theo dự án" },
      { href: "/reports/partners", label: "Đối tác" },
      { href: "/reports/people", label: "Theo nhân sự" },
      { href: "/reports/time", label: "Theo thời gian" },
      { href: "/reports/cashflow", label: "Dòng tiền", gate: "owner" },
    ],
  },
  { href: "/finance", label: "Tài chính", gate: "owner" },
  { href: "/employees", label: "Nhân viên" },
  { href: "/admin/activity", label: "Lịch sử hoạt động", gate: "owner" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function canSee(gate: Gate | undefined, isOwner: boolean, canSeeReports: boolean): boolean {
  if (!gate) return true;
  if (gate === "owner") return isOwner;
  if (gate === "reports") return canSeeReports;
  return false;
}

export default function NavLinks({
  isOwner = false,
  canSeeReports = false,
}: {
  isOwner?: boolean;
  canSeeReports?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {NAV.map((n) => {
        if (!canSee(n.gate, isOwner, canSeeReports)) return null;

        if (!isGroup(n)) {
          const active = isActive(pathname, n.href);
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

        const visibleChildren = n.children.filter((c) =>
          canSee(c.gate, isOwner, canSeeReports),
        );
        if (visibleChildren.length === 0) return null;

        return (
          <div key={n.label} className="pt-1">
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {n.label}
            </div>
            <div className="space-y-0.5">
              {visibleChildren.map((c) => {
                const active = isActive(pathname, c.href);
                return (
                  <Link
                    key={c.href}
                    href={c.href}
                    className={
                      active
                        ? "block pl-6 pr-3 py-1.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-700 border-l-2 border-orange-500"
                        : "block pl-6 pr-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                    }
                  >
                    {c.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
