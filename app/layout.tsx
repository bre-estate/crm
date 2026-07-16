import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import NavLinks from "./NavLinks";
import AppShell from "./AppShell";
import { Toaster } from "sonner";
import { getOwnerEmail, hasReportsAccess, hasSegmentsAccess } from "@/lib/auth";

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
      <html lang="vi" className="h-full">
        <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
          {children}
          <Toaster position="top-right" richColors closeButton />
        </body>
      </html>
    );
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "User";
  const isOwner = (await getOwnerEmail()) !== null;
  const canSeeReports = await hasReportsAccess();
  const canSeeSegments = await hasSegmentsAccess();

  const sidebar = (
    <>
      <div className="p-5 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="BRE — Better Real Estate" className="h-14 w-auto" />
      </div>
      <NavLinks
        isOwner={isOwner}
        canSeeReports={canSeeReports}
        canSeeSegments={canSeeSegments}
      />
      <div className="p-3 border-t border-slate-200 space-y-2">
        <div className="text-xs text-slate-600 truncate" title={displayName}>
          {displayName}
        </div>
        <SignOutButton />
      </div>
    </>
  );

  return (
    <html lang="vi" className="h-full">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
        <AppShell sidebar={sidebar} userName={displayName}>
          {children}
        </AppShell>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
