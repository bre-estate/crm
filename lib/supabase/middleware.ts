import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolvePermissions, resourceOfPath, type Action, type Role } from "@/lib/permissions";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Permission check: nếu path yêu cầu resource → user phải có 'view'.
  // Owner qua thẳng. Anonymous và public đã handle ở trên.
  if (user && !isPublic && path !== "/") {
    const resource = resourceOfPath(path);
    if (resource) {
      const { data: perm } = await supabase
        .from("user_permissions")
        .select("role, permissions, active")
        .eq("email", user.email!)
        .maybeSingle();

      // User chưa được thêm hoặc bị disable → root redirect để Layout hiển thị notice.
      if (!perm || !perm.active) {
        if (path !== "/") {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          return NextResponse.redirect(url);
        }
      } else if (perm.role !== "owner") {
        const perms = resolvePermissions(
          perm.role as Role,
          (perm.permissions as Record<string, Action[]>) ?? {},
        );
        // Wildcard /reports → allow nếu có ANY reports.* permission
        const allowed =
          resource === "reports.*"
            ? Object.keys(perms).some((r) => r.startsWith("reports."))
            : (perms[resource]?.includes("view") ?? false);
        if (!allowed) {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          url.searchParams.set("denied", resource);
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return supabaseResponse;
}
