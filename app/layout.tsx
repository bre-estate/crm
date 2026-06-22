import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import NavLinks from "./NavLinks";

export const metadata: Metadata = {
  title: "BRE — Quản lý sàn giao dịch BĐS",
  description: "Hệ thống quản lý doanh thu, giá vốn, báo cáo",
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
        <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">{children}</body>
      </html>
    );
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "User";

  return (
    <html lang="vi" className="h-full">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
        <div className="flex min-h-screen">
          <aside className="w-60 bg-white border-r border-slate-200 flex flex-col">
            <div className="p-5 border-b border-slate-200">
              <div className="text-lg font-bold text-blue-700">BRE</div>
              <div className="text-xs text-slate-500">Sàn giao dịch BĐS</div>
            </div>
            <NavLinks />
            <div className="p-3 border-t border-slate-200 space-y-2">
              <div className="text-xs text-slate-600 truncate" title={displayName}>
                {displayName}
              </div>
              <SignOutButton />
            </div>
          </aside>
          <main className="flex-1 overflow-auto">
            <div className="max-w-7xl mx-auto p-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
