import { auth } from "@repo/auth/server";
import { and, db, eq, resolveTenantFromHost } from "@repo/database";
import { searchProjects } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { parseSearchQuery } from "@repo/search";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const MAX_LIMIT = 100;
const MAX_OFFSET = 100_000;

function boundedInteger(value: string | null, fallback: number, max: number) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(0, parsed));
}

/**
 * GET /api/search/projects?organizationId=xxx&query=...
 *
 * This is the expressive-search adapter. `/api/projects` remains the
 * compatibility list endpoint used by the project switcher.
 */
export async function GET(request: Request) {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
    if (!tenant) {
      return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId")?.trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 },
      );
    }

    const limit = boundedInteger(searchParams.get("limit"), 50, MAX_LIMIT);
    const offset = boundedInteger(searchParams.get("offset"), 0, MAX_OFFSET);
    if (limit === null || offset === null || limit < 1) {
      return NextResponse.json(
        { error: "limit and offset must be valid non-negative integers" },
        { status: 400 },
      );
    }

    const [membership] = await db()
      .select({ id: member.id })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.userId, session.user.id),
          eq(member.organizationId, organizationId),
          eq(member.tenantId, tenant.id),
          eq(organization.tenantId, tenant.id),
        ),
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 },
      );
    }

    const queryText = searchParams.has("query")
      ? (searchParams.get("query") ?? "")
      : (searchParams.get("q") ?? "");
    const query = parseSearchQuery(queryText);
    const result = await searchProjects(tenant.id, organizationId, {
      query,
      limit,
      offset,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error searching projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
