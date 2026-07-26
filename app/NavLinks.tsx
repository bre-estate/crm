"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Gate = "owner" | "reports" | "segments";

type NavLeaf = {
  href: string;
  label: string;
  gate?: Gate;
  section?: string; // header nhóm trong group (VD "Thị trường")
  /** exact match — nếu true, chỉ active khi pathname === href.
   *  Dùng cho parent link có sub-page (VD /finance) để không active
   *  khi đang ở /finance/capital. */
  exact?: boolean;
};

type NavGroup = {
  label: string;
  /** Nếu có href, parent label render dưới dạng link (VD "Tài chính" →
   *  /finance landing hub). Nếu không, chỉ là section header text. */
  href?: string;
  gate?: Gate;
  children: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;

const isGroup = (n: NavEntry): n is NavGroup => "children" in n;

const NAV: NavEntry[] = [
  { href: "/", label: "Tổng quan" },
  { href: "/alerts", label: "🔔 Cảnh báo", gate: "owner" },
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
    href: "/reports",
    // Parent không set gate — child gate quyết định visible.
    // Thứ tự children QUAN TRỌNG: liền nhau theo section để render header đúng.
    children: [
      // TỔNG QUAN
      { href: "/reports/overview", label: "Tổng hợp", gate: "reports", section: "Tổng quan" },
      { href: "/reports/management", label: "Quản trị", gate: "owner", section: "Tổng quan" },
      { href: "/reports/unit-profitability", label: "Lãi từng căn", gate: "reports", section: "Tổng quan" },
      // TÀI CHÍNH
      { href: "/reports/balance-sheet", label: "BCĐKT", gate: "owner", section: "Tài chính" },
      { href: "/reports/cash-flow-statement", label: "LCTT", gate: "owner", section: "Tài chính" },
      { href: "/reports/cashflow", label: "Dòng tiền HH", gate: "owner", section: "Tài chính" },
      // THỊ TRƯỜNG
      { href: "/reports/segments", label: "Phân khúc", gate: "segments", section: "Thị trường" },
      { href: "/reports/projects", label: "Theo dự án", gate: "reports", section: "Thị trường" },
      { href: "/reports/partners", label: "Đối tác", gate: "reports", section: "Thị trường" },
      // NỘI BỘ
      { href: "/reports/people", label: "Theo nhân sự", gate: "reports", section: "Nội bộ" },
      { href: "/reports/time", label: "Theo thời gian", gate: "reports", section: "Nội bộ" },
    ],
  },
  {
    label: "Tài chính",
    href: "/finance",
    gate: "owner",
    children: [
      { href: "/finance/capital", label: "Vốn góp founder", gate: "owner" },
      { href: "/finance/assets", label: "Tài sản cố định", gate: "owner" },
      { href: "/finance/transactions", label: "Giao dịch", gate: "owner" },
    ],
  },
  {
    label: "Nhân sự",
    gate: "owner",
    children: [
      { href: "/employees", label: "Nhân viên", gate: "owner" },
      { href: "/departments", label: "Phòng ban", gate: "owner" },
    ],
  },
  { href: "/admin/activity", label: "Lịch sử hoạt động", gate: "owner" },
];

function isActive(pathname: string, href: string, exact = false): boolean {
  if (href === "/") return pathname === "/";
  if (exact) return pathname === href;
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

        const visibleChildren = n.children.filter((c) => canSee(c.gate));
        if (visibleChildren.length === 0) return null;

        // Parent = section header hoặc link. Nếu có href → link tới landing
        // hub (VD /finance), exact match để KHÔNG active khi ở sub-page.
        // Children indent vào để phân cấp rõ ràng.
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
              {/* Render sub-section headers khi có `section` field. Group children
                  có cùng section liền nhau, insert header trước group.
                  Nếu no section → render flat như cũ. */}
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
