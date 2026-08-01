import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import NavLinks from "./NavLinks";
import AppShell from "./AppShell";
import NotificationBell from "@/components/NotificationBell";
import { fetchNotifications } from "./actions/notifications";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { getCurrentUser } from "@/lib/auth";
import { resolvePermissions, hasPermission as checkPerm } from "@/lib/permissions";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "BRE — Quản lý sàn giao dịch BĐS",
  description: "Hệ thống quản lý doanh thu, giá vốn, báo cáo",
  // Favicon: dùng Next.js file-convention → `app/icon.png` được auto-detect
  // + generate <link rel="icon"> với hash cache-busting. Không cần config
  // metadata.icons — nếu set sẽ conflict với auto-detect.
};

// Viewport riêng theo Next 15 convention (thay vì trong metadata).
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // On /login and /auth routes we render children directly without the shell.
  if (!user) {
    return (
      <html lang="vi" className={cn("h-full", "font-sans", geist.variable)}>
        <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
          {children}
          <Toaster position="top-right" richColors closeButton />
        </body>
      </html>
    );
  }

  const currentUser = await getCurrentUser();
  const displayName =
    currentUser?.fullName ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "User";

  // Chưa có trong whitelist → force logout để tránh confusion.
  if (!currentUser) {
    return (
      <html lang="vi" className={cn("h-full", "font-sans", geist.variable)}>
        <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
          <div className="min-h-screen flex items-center justify-center p-6">
            <div className="max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center">
              <h1 className="text-lg font-semibold mb-2">Chưa được cấp quyền</h1>
              <p className="text-sm text-slate-600 mb-4">
                Tài khoản <b>{user.email}</b> chưa được thêm vào hệ thống. Liên hệ
                chủ tài khoản để được mời.
              </p>
              <SignOutButton />
            </div>
          </div>
          <Toaster position="top-right" richColors closeButton />
        </body>
      </html>
    );
  }

  const permissions = resolvePermissions(currentUser.role, currentUser.customPermissions);
  const isOwner = currentUser.role === "owner";

  // Load notifications cho bell (chỉ khi user có quyền xem alerts)
  const canSeeAlerts = checkPerm(currentUser.role, currentUser.customPermissions, "alerts");
  const notifications = canSeeAlerts
    ? await fetchNotifications()
    : { items: [], unreadCount: 0 };
  const bell = canSeeAlerts ? <NotificationBell initial={notifications} /> : null;

  const sidebar = (
    <>
      <div className="p-5 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="BRE — Better Real Estate" className="h-14 w-auto" />
      </div>
      <NavLinks isOwner={isOwner} permissions={permissions} />
      <div className="p-3 border-t border-slate-200 space-y-2">
        <div className="text-xs text-slate-600 truncate" title={displayName}>
          {displayName}
        </div>
        <SignOutButton />
      </div>
    </>
  );

  return (
    <html lang="vi" className={cn("h-full", "font-sans", geist.variable)}>
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
        <TooltipProvider>
          <AppShell sidebar={sidebar} userName={displayName} bell={bell}>
            {children}
          </AppShell>
        </TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
