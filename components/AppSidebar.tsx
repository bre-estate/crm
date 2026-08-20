"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useTransition } from "react";
import type { Action, Resource } from "@/lib/permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationData,
  type NotificationItem,
} from "@/app/actions/notifications";

// ============================================================================
// Nav definition
// ============================================================================
type NavLeaf = {
  href: string;
  label: string;
  resource?: Resource;
  ownerOnly?: boolean;
  section?: string;
  exact?: boolean;
};

type NavGroup = {
  label: string;
  href?: string;
  ownerOnly?: boolean;
  resource?: Resource;
  children: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;
const isGroup = (n: NavEntry): n is NavGroup => "children" in n;

// Nav được reorganize theo tần suất dùng, không phải theo domain:
// - HÀNG NGÀY: những trang mở nhiều nhất
// - CƠ SỞ DỮ LIỆU: setup entities (ít khi sửa)
// - BÁO CÁO: 3 báo cáo chính + 1 group deep dives
// - KẾ TOÁN: cho owner cần audit
// - QUẢN TRỊ HỆ THỐNG: chỉ owner
const NAV: NavEntry[] = [
  { href: "/", label: "Tổng quan" },
  { href: "/chat", label: "🤖 Trợ lý CRM", ownerOnly: true },
  {
    label: "Đối tác & Dự án",
    children: [
      { href: "/partners", label: "Đối tác", resource: "partners" },
      { href: "/projects", label: "Dự án", resource: "products" },
    ],
  },
  {
    label: "Giao dịch sơ cấp",
    children: [
      { href: "/products", label: "Danh sách căn", resource: "products" },
      { href: "/revenues", label: "Doanh thu", resource: "revenues" },
      { href: "/costs", label: "Giá vốn", resource: "costs" },
      { href: "/invoices", label: "Hóa đơn", resource: "invoices" },
    ],
  },
  {
    label: "Giao dịch thứ cấp",
    children: [
      { href: "/secondary-sales", label: "Danh sách căn", resource: "products" },
    ],
  },
  {
    label: "Báo cáo quản trị",
    href: "/reports",
    children: [
      { href: "/reports/kpi-dashboard", label: "🎯 KPI Dashboard", resource: "reports.kpi-dashboard" },
      { href: "/reports/profit-detail", label: "Lãi/lỗ (dồn tích)", resource: "reports.profit-detail" },
      { href: "/reports/cash-flow", label: "Dòng tiền", resource: "reports.cash-flow" },
      { href: "/reports/ar-aging", label: "Tuổi nợ phải thu", resource: "reports.ar-aging" },
      { href: "/reports/ap-aging", label: "Tuổi nợ phải trả", resource: "reports.ap-aging" },
      { href: "/reports/balance-sheet", label: "Bảng cân đối", resource: "reports.balance-sheet" },
      { href: "/reports/sales", label: "Báo cáo bán hàng", resource: "reports.sales" },
      { href: "/reports/commissions", label: "Báo cáo hoa hồng", resource: "reports.commissions" },
      { href: "/reports/project-profitability", label: "Lãi/lỗ theo dự án", resource: "reports.project-profitability" },
      { href: "/reports/expenses", label: "Phân tích chi phí", resource: "reports.expenses" },
      { href: "/reports/break-even", label: "Điểm hòa vốn", resource: "reports.break-even" },
      // Deep dives (Phase 2 sắp gom lại thành Sales report + Commission)
      { href: "/reports/unit-profitability", label: "Lãi từng căn", resource: "reports.unit-profitability", section: "Chi tiết" },
      { href: "/reports/segments", label: "Phân khúc căn", resource: "reports.segments", section: "Chi tiết" },
      { href: "/reports/people", label: "Theo nhân sự", resource: "reports.people", section: "Chi tiết" },
      { href: "/reports/projects", label: "Theo dự án", resource: "reports.overview", section: "Chi tiết" },
      { href: "/reports/partners", label: "Theo đối tác", resource: "reports.overview", section: "Chi tiết" },
    ],
  },
  {
    label: "Kế toán",
    href: "/finance",
    resource: "finance",
    children: [
      { href: "/finance/capital", label: "Vốn góp founder", resource: "finance" },
      { href: "/finance/assets", label: "Tài sản cố định", resource: "finance" },
      { href: "/finance/transactions", label: "Giao dịch tài chính", resource: "finance" },
      { href: "/finance/bank-review", label: "Đối chiếu sao kê bank", resource: "finance" },
      { href: "/finance/nkc-review", label: "Đối chiếu sổ NKC", resource: "finance" },
    ],
  },
  {
    label: "Nhân sự",
    children: [
      { href: "/employees", label: "Nhân viên", resource: "employees" },
      { href: "/departments", label: "Phòng ban", resource: "departments" },
    ],
  },
  {
    label: "Quản trị hệ thống",
    children: [
      { href: "/admin/users", label: "Quản lý user", ownerOnly: true },
      { href: "/admin/data-checks", label: "Kiểm tra dữ liệu", ownerOnly: true },
      { href: "/admin/activity", label: "Lịch sử hoạt động", resource: "admin.activity" },
      { href: "/admin/import-logs", label: "Nhật ký import", resource: "admin.activity" },
    ],
  },
  {
    label: "Hướng dẫn",
    children: [
      { href: "/help/nhap-doi-tac", label: "🤝 Nhập đối tác", resource: "help" },
      { href: "/help/nhap-du-an", label: "🏗️ Nhập dự án", resource: "help" },
      { href: "/help/nhap-can", label: "🏢 Nhập căn", resource: "help" },
      { href: "/help/nhap-doanh-thu", label: "📥 Nhập doanh thu", resource: "help" },
      { href: "/help/nhap-doi-chieu-gia-von", label: "💸 Nhập giá vốn", resource: "help" },
      { href: "/help/accounting-basics", label: "📚 Kế toán căn bản", resource: "help" },
    ],
  },
];

function isActive(pathname: string, href: string, exact = false): boolean {
  if (href === "/") return pathname === "/";
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

// ============================================================================
// Notification panel — click "Thông báo" nav item mở Popover với list này
// ============================================================================
const SEV_STYLE = {
  critical: { icon: "🚨", cls: "border-l-red-500" },
  warning: { icon: "⚠️", cls: "border-l-amber-500" },
  info: { icon: "ℹ️", cls: "border-l-blue-500" },
} as const;

function NotificationsPanel({
  data,
  onItemClick,
  onMarkAll,
  onClose,
  pending,
}: {
  data: NotificationData;
  onItemClick: (item: NotificationItem) => void;
  onMarkAll: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  const topItems = data.items.slice(0, 6);
  return (
    <div className="w-96 max-w-[calc(100vw-2rem)]">
      <div className="px-4 py-2.5 border-b border-slate-100 flex justify-between items-center">
        <div className="font-semibold text-sm">Thông báo</div>
        {data.unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAll}
            disabled={pending}
            className="text-[11px] text-blue-600 hover:underline"
          >
            Đánh dấu đã đọc tất cả
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {topItems.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            ✅ Không có cảnh báo nào
          </div>
        ) : (
          topItems.map((item) => {
            const style = SEV_STYLE[item.severity];
            const content = (
              <div
                className={`px-4 py-2.5 border-l-4 ${style.cls} ${
                  item.read ? "bg-white" : "bg-slate-50"
                } hover:bg-slate-100 cursor-pointer transition-colors`}
                onClick={() => onItemClick(item)}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm ${
                        item.read ? "text-slate-600" : "text-slate-900 font-medium"
                      }`}
                    >
                      {item.title}
                    </div>
                  </div>
                  {!item.read && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                  )}
                </div>
              </div>
            );
            return item.url ? (
              <Link key={item.key} href={item.url} onClick={onClose} className="block">
                {content}
              </Link>
            ) : (
              <div key={item.key}>{content}</div>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-2 bg-slate-50">
        <Link
          href="/alerts"
          onClick={onClose}
          className="text-xs text-blue-600 hover:underline"
        >
          Xem tất cả →
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// AppSidebar — main export, dùng trong app/layout.tsx
// ============================================================================
export default function AppSidebar({
  isOwner,
  permissions,
  displayName,
  email,
  notifications,
  canSeeAlerts,
}: {
  isOwner: boolean;
  permissions: Record<string, Action[]>;
  displayName: string;
  email: string;
  notifications: NotificationData;
  canSeeAlerts: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signPending, startSign] = useTransition();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifData, setNotifData] = useState<NotificationData>(notifications);
  const [notifPending, startNotif] = useTransition();

  // Fetch notifications lần đầu client-side (server không fetch để tránh 504
  // — computeAlertSummaries chạy 20+ queries). Sau đó auto-refresh 5 min.
  useEffect(() => {
    if (!canSeeAlerts) return;
    fetchNotifications().then(setNotifData).catch(() => {});
    const int = setInterval(() => {
      fetchNotifications().then(setNotifData).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(int);
  }, [canSeeAlerts]);

  const canSee = (entry: NavLeaf | NavGroup): boolean => {
    if (entry.ownerOnly) return isOwner;
    if (isOwner) return true;
    if (!entry.resource) return true;
    return permissions[entry.resource]?.includes("view") ?? false;
  };

  function handleSignOut() {
    startSign(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  function handleNotifClick(item: NotificationItem) {
    if (!item.read) {
      startNotif(async () => {
        await markNotificationRead(item.key);
        setNotifData((d) => ({
          ...d,
          items: d.items.map((i) => (i.key === item.key ? { ...i, read: true } : i)),
          unreadCount: Math.max(0, d.unreadCount - 1),
        }));
      });
    }
  }

  function handleMarkAll() {
    startNotif(async () => {
      await markAllNotificationsRead();
      setNotifData((d) => ({
        ...d,
        items: d.items.map((i) => ({ ...i, read: true })),
        unreadCount: 0,
      }));
    });
  }

  const initials = displayName
    .split(/\s+/)
    .slice(-2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("");

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="px-2 py-2 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="BRE" className="h-10 w-auto" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Notifications item — luôn ở đầu, có badge */}
        {canSeeAlerts && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <Popover open={notifOpen} onOpenChange={setNotifOpen}>
                    <PopoverTrigger
                      render={
                        <SidebarMenuButton isActive={pathname.startsWith("/alerts")}>
                          <Bell />
                          <span>Thông báo</span>
                        </SidebarMenuButton>
                      }
                    />
                    <PopoverContent side="right" align="start" className="p-0" sideOffset={8}>
                      <NotificationsPanel
                        data={notifData}
                        onItemClick={handleNotifClick}
                        onMarkAll={handleMarkAll}
                        onClose={() => setNotifOpen(false)}
                        pending={notifPending}
                      />
                    </PopoverContent>
                  </Popover>
                  {notifData.unreadCount > 0 && (() => {
                    // Đỏ chỉ khi có critical unread; còn lại xám subtle
                    const hasCriticalUnread = notifData.items.some(
                      (i) => !i.read && i.severity === "critical",
                    );
                    return (
                      <SidebarMenuBadge
                        className={
                          hasCriticalUnread
                            ? "bg-red-500 text-white"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {notifData.unreadCount > 9 ? "9+" : notifData.unreadCount}
                      </SidebarMenuBadge>
                    );
                  })()}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Main nav */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => {
                if (!canSee(n)) return null;

                if (!isGroup(n)) {
                  const active = isActive(pathname, n.href, n.exact);
                  return (
                    <SidebarMenuItem key={n.href}>
                      <SidebarMenuButton
                        isActive={active}
                        className="data-active:bg-orange-500 data-active:text-white data-active:font-semibold data-active:hover:bg-orange-500 data-active:hover:text-white"
                        render={<Link href={n.href} />}
                      >
                        {n.label}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                const visibleChildren = n.children.filter((c) => canSee(c));
                if (visibleChildren.length === 0) return null;

                const parentActive = n.href ? pathname === n.href : false;
                return (
                  <SidebarMenuItem key={n.label}>
                    {n.href ? (
                      <SidebarMenuButton
                        isActive={parentActive}
                        className="data-active:bg-orange-500 data-active:text-white data-active:font-semibold data-active:hover:bg-orange-500 data-active:hover:text-white"
                        render={<Link href={n.href} />}
                      >
                        <span className="font-medium">{n.label}</span>
                      </SidebarMenuButton>
                    ) : (
                      <div className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {n.label}
                      </div>
                    )}
                    <SidebarMenuSub>
                      {(() => {
                        const rendered: React.ReactNode[] = [];
                        let lastSection = "__none__";
                        for (const c of visibleChildren) {
                          const sec = c.section ?? "__nosec__";
                          if (sec !== lastSection && c.section) {
                            rendered.push(
                              <div
                                key={`sec-${sec}`}
                                className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                              >
                                {c.section}
                              </div>,
                            );
                          }
                          lastSection = sec;
                          const active = isActive(pathname, c.href, c.exact);
                          rendered.push(
                            <SidebarMenuSubItem key={c.href}>
                              <SidebarMenuSubButton
                                isActive={active}
                                className="data-active:bg-orange-500 data-active:text-white data-active:font-semibold data-active:hover:bg-orange-500 data-active:hover:text-white"
                                render={<Link href={c.href} />}
                              >
                                {c.label}
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>,
                          );
                        }
                        return rendered;
                      })()}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Click TÊN + EMAIL → thẳng vào /profile. Logout tách ra icon riêng. */}
            <div className="flex items-center gap-1 p-1">
              <Link
                href="/profile"
                className="flex flex-1 items-center gap-2 rounded-md p-2 text-sm hover:bg-sidebar-accent focus:bg-sidebar-accent outline-hidden min-w-0"
                title="Trang cá nhân"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-orange-500 text-white text-xs font-semibold shrink-0">
                  {initials}
                </div>
                <div className="grid flex-1 text-left leading-tight min-w-0">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </div>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signPending}
                className="rounded-md p-2 hover:bg-sidebar-accent focus:bg-sidebar-accent outline-hidden text-slate-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title={signPending ? "Đang đăng xuất..." : "Đăng xuất"}
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
