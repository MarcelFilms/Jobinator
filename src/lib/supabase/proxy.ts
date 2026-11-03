import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ownerEmail, publicEnv } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/api/cron/discover", "/auth/callback"];

export async function updateSession(request: NextRequest) {
  const env = publicEnv();
  const path = request.nextUrl.pathname;
  if (!env) {
    if (PUBLIC_PATHS.some((item) => path === item || path.startsWith(`${item}/`))) {
      return NextResponse.next();
    }
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    return NextResponse.redirect(login);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const isPublic = PUBLIC_PATHS.some((item) => path === item || path.startsWith(`${item}/`));
  if (isPublic) return response;

  const allowed = ownerEmail();
  const email = user?.email?.toLowerCase() ?? "";
  if (!user || !allowed || email !== allowed) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    if (user && allowed && email !== allowed) login.searchParams.set("error", "private");
    if (!allowed) login.searchParams.set("error", "owner");
    return NextResponse.redirect(login);
  }
  return response;
}
