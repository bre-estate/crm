import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Hostname whitelist cho OAuth redirect. Bảo vệ chống proxy misconfig
// forward x-forwarded-host tới host attacker control → redirect sau OAuth
// đưa user tới host giả cùng cookie session.
const ALLOWED_HOSTS = new Set([
  "crm.bre.vn",
  "crm-azure-kappa-85.vercel.app",
]);

// Path chỉ chấp nhận relative (bắt đầu /), tránh open redirect qua ?next=https://evil.com
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      // Production: chỉ chấp nhận x-forwarded-host nếu match whitelist,
      // fallback về origin (Vercel URL) nếu không.
      const forwardedHost = request.headers.get("x-forwarded-host");
      if (forwardedHost && ALLOWED_HOSTS.has(forwardedHost)) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("OAuth exchange failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
