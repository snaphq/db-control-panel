import { auth } from "@repo/auth/server";
/**
 * Proxy for Better Auth
 *
 * Simplified proxy with no provider switching.
 * ~120 lines vs 471 lines in the multi-provider version.
 */
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import {
  createLinkHeader,
  isMarkdownRequest,
  isPublicMarkdownPath,
} from "./lib/agent-discovery";

// Cookie constants for workspace caching
const HAS_WORKSPACE_COOKIE = "has_workspace";
const WORKSPACE_COOKIE_TTL = 5 * 60; // 5 minutes

// AI bot UA patterns — hits are logged to /api/aieo/bot-hit for the
// AIEO Referrers dashboard.
const AI_BOT_PATTERNS: RegExp[] = [
  /GPTBot/i,
  /OAI-SearchBot/i,
  /PerplexityBot/i,
  /ClaudeBot/i,
  /anthropic-ai/i,
  /Google-Extended/i,
  /Applebot-Extended/i,
  /Bytespider/i,
  /CCBot/i,
  /cohere-ai/i,
  /YouBot/i,
  /DuckAssistBot/i,
  /Meta-ExternalAgent/i,
  /Amazonbot/i,
];

function isAiBot(userAgent: string): boolean {
  return AI_BOT_PATTERNS.some((re) => re.test(userAgent));
}

function recordBotHit(pathname: string, userAgent: string, origin: string) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return;
  const date = new Date().toISOString().slice(0, 10);
  fetch(`${origin}/api/aieo/bot-hit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({ date, userAgent, path: pathname, hits: 1 }),
  }).catch(() => {});
}

/**
 * Check if user has workspaces, using cookie cache when available.
 */
async function checkUserWorkspaces(
  request: NextRequest,
  userId: string,
  tenantId: string,
): Promise<{ hasWorkspace: boolean; shouldSetCookie: boolean }> {
  // Check cookie cache first
  const cachedValue = request.cookies.get(HAS_WORKSPACE_COOKIE)?.value;
  if (cachedValue === "1") {
    return { hasWorkspace: true, shouldSetCookie: false };
  }
  if (cachedValue === "0") {
    return { hasWorkspace: false, shouldSetCookie: false };
  }

  // No cache, query database
  try {
    const { db } = await import("@repo/database");
    const { member } = await import("@repo/database/schema");
    const { and, eq } = await import("@repo/database");

    const userMembers = await db()
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.tenantId, tenantId)))
      .limit(1);

    const hasWorkspace = userMembers.length > 0;
    return { hasWorkspace, shouldSetCookie: true };
  } catch (error) {
    console.error("[Proxy] Error checking workspaces:", error);
    return { hasWorkspace: true, shouldSetCookie: false };
  }
}

/**
 * Add workspace cookie to response headers.
 */
function setWorkspaceCookie(
  response: NextResponse,
  hasWorkspace: boolean,
): void {
  const value = hasWorkspace ? "1" : "0";
  response.cookies.set(HAS_WORKSPACE_COOKIE, value, {
    path: "/",
    maxAge: WORKSPACE_COOKIE_TTL,
    sameSite: "lax",
  });
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: NextResponse): void {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS",
  );
  response.headers.set("Access-Control-Allow-Headers", "*");
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const { resolveTenantFromHost } = await import("@repo/database");
  const tenant = await resolveTenantFromHost(request.headers.get("host")).catch(
    (error) => {
      console.error("[Proxy] Error resolving tenant:", error);
      return null;
    },
  );
  if (!tenant) {
    return new NextResponse(null, { status: 404 });
  }

  // AIEO: fire-and-forget bot-hit ingest for AI crawlers
  const ua = request.headers.get("user-agent") ?? "";
  if (ua && isAiBot(ua)) {
    recordBotHit(pathname, ua, request.nextUrl.origin);
  }

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  if (
    request.method === "GET" &&
    isMarkdownRequest(request) &&
    isPublicMarkdownPath(pathname)
  ) {
    const response = NextResponse.rewrite(
      new URL(
        `/__agent_markdown?pathname=${encodeURIComponent(pathname)}`,
        request.url,
      ),
    );
    addCorsHeaders(response);
    response.headers.set("Link", createLinkHeader(pathname));
    return response;
  }

  // Protected routes: dashboard, user-profile, onboarding
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/auth/user-profile") ||
    pathname.startsWith("/auth/onboarding")
  ) {
    let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
    try {
      session = await auth.api.getSession({
        headers: await headers(),
      });
    } catch (error) {
      console.error("[Proxy] Error getting session:", error);
      session = null;
    }

    if (!session) {
      const response = NextResponse.redirect(
        new URL("/auth/sign-in", request.url),
      );
      response.cookies.delete(HAS_WORKSPACE_COOKIE);
      addCorsHeaders(response);
      return response;
    }

    // Check workspaces for dashboard routes
    if (pathname.startsWith("/dashboard")) {
      const { hasWorkspace, shouldSetCookie } = await checkUserWorkspaces(
        request,
        session.user.id,
        tenant.id,
      );

      if (!hasWorkspace) {
        const response = NextResponse.redirect(
          new URL("/auth/onboarding", request.url),
        );
        if (shouldSetCookie) {
          setWorkspaceCookie(response, false);
        }
        addCorsHeaders(response);
        return response;
      }

      if (shouldSetCookie) {
        const response = NextResponse.next();
        setWorkspaceCookie(response, true);
        addCorsHeaders(response);
        return response;
      }
    }
  }

  // Default response with CORS headers
  const response = NextResponse.next();
  addCorsHeaders(response);
  response.headers.set("Link", createLinkHeader(pathname));
  return response;
}
