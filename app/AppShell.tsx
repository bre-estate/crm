"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Responsive shell wrap sidebar + top bar mobile + main content.
 *
 * - Desktop (md+): sidebar static bên trái, top bar ẩn.
 * - Mobile (<md): sidebar collapsed thành hamburger. Top bar sticky trên
 *   với logo + hamburger + user name. Bấm hamburger mở sidebar dạng
 *   overlay (backdrop). Click backdrop hoặc chuyển page → auto-close.
 */
export default function AppShell({
  sidebar,
  userName,
  children,
}: {
  sidebar: React.ReactNode;
  userName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Đóng sidebar khi chuyển trang trên mobile
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll khi sidebar mobile mở
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <div className="min-h-screen">
      {/* ============ Top bar (mobile only) ============ */}
      <header className="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200 flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg hover:bg-slate-100 -m-1"
          aria-label="Mở menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="BRE" className="h-8 w-auto" />
        <div className="ml-auto text-xs text-slate-600 truncate max-w-[45%]" title={userName}>
          {userName}
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3rem)] md:min-h-screen">
        {/* ============ Sidebar ============ */}
        <aside
          className={`
            fixed md:static
            inset-y-0 left-0 z-40
            w-64 md:w-60
            bg-white border-r border-slate-200
            flex flex-col
            transform transition-transform duration-200 ease-out
            ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          `}
        >
          {sidebar}
        </aside>

        {/* ============ Backdrop (mobile khi sidebar open) ============ */}
        {open && (
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}

        {/* ============ Main content ============ */}
        <main className="flex-1 min-w-0 overflow-x-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
