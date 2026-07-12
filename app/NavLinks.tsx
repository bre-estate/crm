"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Tổng quan" },
  { href: "/partners", label: "Đối tác" },
  { href: "/projects", label: "Dự án" },
  { href: "/products", label: "Giao dịch" },
  { href: "/revenues", label: "Doanh thu" },
  { href: "/costs", label: "Giá vốn" },
  { href: "/reports", label: "Báo cáo" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 p-3 space-y-1">
      {NAV.map((n) => {
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
      })}
    </nav>
  );
}
