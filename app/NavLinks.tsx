"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Gate = "owner" | "reports" | "segments";

type NavLeaf = {
  href: string;
  label: string;
  gate?: Gate;
  section?: string; // header nhóm trong group (VD "Thị trường")
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
    // Parent không set gate — child gate quyết định visible (segments-only user
    // vẫn thấy parent nếu Phân khúc visible).
    children: [
      { href: "/reports/overview", label: "Tổng hợp", gate: "reports", section: "Tổng quan" },
      { href: "/reports/segments", label: "Phân khúc", gate: "segments", section: "Thị trường" },
      { href: "/reports/projects", label: "Theo dự án", gate: "reports", section: "Thị trường" },
      { href: "/reports/partners", label: "Đối tác", gate: "reports", section: "Thị trường" },
      { href: "/reports/people", label: "Theo nhân sự", gate: "reports", section: "Nội bộ" },
      { href: "/reports/time", label: "Theo thời gian", gate: "reports", section: "Nội bộ" },
      { href: "/reports/cashflow", label: "Dòng tiền", gate: "owner", section: "Tài chính" },
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

export default function NavLinks({
  isOwner = false,
  canSeeReports = false,
  canSeeSegments = false,
}: {
  isOwner?: boolean;
  canSeeReports?: boolean;
  canSeeSegments?: boolean;
}) {
  const pathname = usePathname();

  const canSee = (gate: Gate | undefined): boolean => {
    if (!gate) return true;
    if (gate === "owner") return isOwner;
    if (gate === "reports") return canSeeReports;
    if (gate === "segments") return canSeeSegments;
    return false;
  };

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {NAV.map((n) => {
        if (!canSee(n.gate)) return null;

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

        const visibleChildren = n.children.filter((c) => canSee(c.gate));
        if (visibleChildren.length === 0) return null;

        // Group children theo section (giữ nguyên thứ tự xuất hiện)
        const sectionsOrder: (string | null)[] = [];
        const bySection = new Map<string | null, NavLeaf[]>();
        for (const c of visibleChildren) {
          const key = c.section ?? null;
          if (!bySection.has(key)) {
            bySection.set(key, []);
            sectionsOrder.push(key);
          }
          bySection.get(key)!.push(c);
        }
        const hasSections = sectionsOrder.some((s) => s !== null);

        return (
          <div key={n.label} className="pt-1">
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {n.label}
            </div>
            <div className="space-y-0.5">
              {sectionsOrder.map((sec, sectionIdx) => (
                <div
                  key={sec ?? "_none"}
                  className={
                    hasSections && sectionIdx > 0
                      ? "mt-1.5 pt-1.5 border-t border-slate-100"
                      : ""
                  }
                  title={sec ?? undefined}
                >
                  {bySection.get(sec)!.map((c) => {
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
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
