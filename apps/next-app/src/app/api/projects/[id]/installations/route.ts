import { auth } from "@repo/auth/server";
import { createInstallation } from "@repo/core/integrations/install";
import { toSafeInstallation } from "@repo/core/integrations/types";
import { and, db, eq, resolveTenantFromHost } from "@repo/database";
import {
  integration,
  integrationInstallation,
  member,
  organization,
  project,
} from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function checkProjectMembership(
  projectId: string,
  options: { requireWriteRole?: boolean } = {},
) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) {
    return {
      error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }),
    };
  }
  const [proj] = await db()
    .select()
    .from(project)
    .innerJoin(organization, eq(project.organizationId, organization.id))
    .where(
      and(
        eq(project.id, projectId),
        eq(project.tenantId, tenant.id),
        eq(organization.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!proj) {
    return {
      error: NextResponse.json({ error: "Project not found" }, { status: 404 }),
    };
  }
  const [m] = await db()
    .select()
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, proj.project.organizationId),
        eq(member.tenantId, tenant.id),
        eq(organization.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!m) {
    return {
      error: NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 },
      ),
    };
  }
  if (
    options.requireWriteRole &&
    m.member.role !== "owner" &&
    m.member.role !== "admin"
  ) {
    return {
      error: NextResponse.json(
        {
          error: "Only workspace owners and admins can install integrations.",
        },
        { status: 403 },
      ),
    };
  }
  return { project: proj.project, tenantId: tenant.id };
}

/**
 * GET /api/projects/[id]/installations
 * List integrations installed at this project (does not include workspace-scoped).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const check = await checkProjectMembership(id);
  if ("error" in check) return check.error;

  const rows = await db()
    .select({
      installation: integrationInstallation,
      integration: integration,
    })
    .from(integrationInstallation)
    .innerJoin(
      integration,
      eq(integrationInstallation.integrationId, integration.id),
    )
    .where(
      and(
        eq(integrationInstallation.projectId, id),
        eq(
          integrationInstallation.organizationId,
          check.project.organizationId,
        ),
      ),
    );

  return NextResponse.json(
    rows.map((r) => ({
      ...toSafeInstallation(r.installation),
      integration: r.integration,
    })),
  );
}

/**
 * POST /api/projects/[id]/installations
 * Body: { integrationSlug, displayName?, config }
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const check = await checkProjectMembership(id, { requireWriteRole: true });
  if ("error" in check) return check.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { integrationSlug, displayName, config } = body as {
    integrationSlug?: string;
    displayName?: string;
    config?: Record<string, unknown>;
  };
  if (!integrationSlug || !config) {
    return NextResponse.json(
      { error: "integrationSlug and config are required" },
      { status: 400 },
    );
  }

  const result = await createInstallation({
    integrationSlug,
    tenantId: check.tenantId,
    organizationId: check.project.organizationId,
    projectId: id,
    displayName,
    config,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result.installation, { status: 201 });
}
