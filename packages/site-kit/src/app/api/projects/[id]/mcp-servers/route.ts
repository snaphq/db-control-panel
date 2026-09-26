import { auth } from "@repo/auth/server";
import { listTools } from "@repo/core/integrations/mcp-proxy";
import { loadMCPServers } from "@repo/core/integrations/mcp-runtime";
import { and, db, eq } from "@repo/database";
import { resolveTenantFromHost } from "@repo/database";
import { member, organization, project } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/mcp-servers
 *
 * Returns the list of installed custom-mcp-server installations visible
 * to this project (project-scoped + workspace-scoped). When `?probe=1`,
 * also calls `tools/list` against each server and includes the tool
 * count or error message.
 *
 * Never returns credentials.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const requestHeaders = await headers();
  const [session, tenant] = await Promise.all([
    auth.api.getSession({ headers: requestHeaders }),
    resolveTenantFromHost(requestHeaders.get("host")),
  ]);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const [proj] = await db()
    .select()
    .from(project)
    .innerJoin(organization, eq(project.organizationId, organization.id))
    .where(
      and(
        eq(project.id, id),
        eq(project.tenantId, tenant.id),
        eq(organization.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!proj) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [membership] = await db()
    .select()
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.organizationId, proj.project.organizationId),
        eq(member.userId, session.user.id),
        eq(member.tenantId, tenant.id),
        eq(organization.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const servers = await loadMCPServers({
    tenantId: tenant.id,
    organizationId: proj.project.organizationId,
    projectId: proj.project.id,
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
