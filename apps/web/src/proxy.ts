import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Optimistic check only: no session cookie → the sign-in page, before anything renders. The cookie's signature
 * is verified on the server next to every data read and Server Action (requestSession / runAction).
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  // Server Action and API calls get the real check (and a readable error) instead of a redirect.
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  const url = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the sign-in page and what an installed app needs before signing in.
  matcher: ["/((?!login|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|offline\\.html|icon|apple-touch-icon).*)"],
};
