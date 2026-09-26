import { type NextRequest, NextResponse } from "next/server";

// Cookie presence only; pages and API routes verify the session against the
// database (see src/lib/admin-auth.ts). Keep in sync with ADMIN_SESSION_COOKIE.
const ADMIN_SESSION_COOKIE = "backend_admin_session";

// Machine-to-machine endpoints authenticate themselves (signatures/tokens).
const PUBLIC_PREFIXES = [
  "/login",
  "/api/webhooks",
  "/api/payments/webhook",
  "/api/inngest",
  "/mcp",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }
  if (request.cookies.has(ADMIN_SESSION_COOKIE)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
