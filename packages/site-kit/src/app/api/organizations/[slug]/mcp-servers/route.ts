import { auth } from "@repo/auth/server";
import { listTools } from "@repo/core/integrations/mcp-proxy";
import { loadMCPServers } from "@repo/core/integrations/mcp-runtime";
import { getCurrentTenant } from "@repo/core/tenant";
import { and, db, eq } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/organizations/[slug]/mcp-servers
 *
 * Returns the list of installed custom-mcp-server installations scoped
 * to this workspace (workspace-only; no project fallback). When `?probe=1`,
 * also calls `tools/list` against each server and includes the tool count
 * or error message.
 *
 * Never returns credentials.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await params;
  const tenant = await getCurrentTenant();

  const [org] = await db()
    .select()
    .from(organization)
    .where(
      and(eq(organization.tenantId, tenant.id), eq(organization.slug, slug)),
    )
    .limit(1);
  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    );
  }

  const [membership] = await db()
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, org.id),
        eq(member.userId, session.user.id),
        eq(member.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const servers = await loadMCPServers({
    tenantId: tenant.id,
    organizationId: org.id,
  });

  const url = new URL(request.url);
  const probe = url.searchParams.get("probe") === "1";

  const result = await Promise.all(
    servers.map(async (s) => {
      const base = {
        installationId: s.installationId,
        displayName: s.displayName,
        endpointUrl: s.endpointUrl,
        authType: s.authType,
        toolAllowlist: s.toolAllowlist,
      };
      if (!probe) return base;
      try {
        const tools = await listTools(s);
        return { ...base, toolCount: tools.length };
      } catch (err) {
        return {
          ...base,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return NextResponse.json(result);
}
