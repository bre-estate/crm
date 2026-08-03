import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import AppSidebar from "@/components/AppSidebar";
import { fetchNotifications } from "./actions/notifications";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "sonner";
import { getCurrentUser } from "@/lib/auth";
import { resolvePermissions, hasPermission as checkPerm } from "@/lib/permissions";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "BRE — Quản lý sàn giao dịch BĐS",
  description: "Hệ thống quản lý doanh thu, giá vốn, báo cáo",
};

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

  if (!currentUser) {
    return (
      <html lang="vi" className={cn("h-full", "font-sans", geist.variable)}>
        <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
          <div className="min-h-screen flex items-center justify-center p-6">
            <div className="max-w-md bg-card ring-1 ring-foreground/10 rounded-xl p-6 shadow-sm text-center">
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
  const canSeeAlerts = checkPerm(currentUser.role, currentUser.customPermissions, "alerts");
  // Notifications KHÔNG fetch server-side (chạy 20+ queries, slow → 504).
  // Bell load empty ban đầu, tự fetch client-side sau khi trang render.
  const notifications = { items: [], unreadCount: 0 };

  return (
    <html lang="vi" className={cn("h-full", "font-sans", geist.variable)}>
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar
              isOwner={isOwner}
              permissions={permissions}
              displayName={displayName}
              email={currentUser.email}
              notifications={notifications}
              canSeeAlerts={canSeeAlerts}
            />
            <SidebarInset>
              {/* Mobile top bar với hamburger — desktop ẩn */}
              <header className="md:hidden sticky top-0 z-20 bg-card border-b border-foreground/10 flex items-center gap-2 px-3 py-2">
                <SidebarTrigger />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="BRE" className="h-7 w-auto" />
              </header>
              <div className="max-w-7xl mx-auto p-4 md:p-6 w-full">{children}</div>
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
