import { auth } from "@repo/auth/server";
import {
  agent,
  agentInstallation,
  and,
  db,
  eq,
  resolveTenantFromHost,
} from "@repo/database";
import { member, organization, project } from "@repo/database/schema";
import { nanoid } from "nanoid";
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
        { error: "Only workspace owners and admins can install agents." },
        { status: 403 },
      ),
    };
  }
  return { project: proj.project, tenantId: tenant.id };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const check = await checkProjectMembership(id);
  if ("error" in check) return check.error;

  const rows = await db()
    .select({ installation: agentInstallation, agent })
    .from(agentInstallation)
    .innerJoin(agent, eq(agentInstallation.agentId, agent.id))
    .where(
      and(
        eq(agentInstallation.projectId, id),
        eq(agentInstallation.organizationId, check.project.organizationId),
      ),
    );

  return NextResponse.json(
    rows.map((r) => ({ ...r.installation, agent: r.agent })),
  );
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const check = await checkProjectMembership(id, { requireWriteRole: true });
  if ("error" in check) return check.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { agentSlug, displayName, config } = body as {
    agentSlug?: string;
    displayName?: string;
    config?: Record<string, unknown>;
  };
  if (!agentSlug) {
    return NextResponse.json(
      { error: "agentSlug is required" },
      { status: 400 },
    );
  }

  const [agentRow] = await db()
    .select()
    .from(agent)
    .where(eq(agent.slug, agentSlug))
    .limit(1);
  if (!agentRow) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (agentRow.status === "hidden" || agentRow.status === "deprecated") {
    return NextResponse.json(
      { error: `Agent is ${agentRow.status}` },
      { status: 400 },
    );
  }

  try {
    const [row] = await db()
      .insert(agentInstallation)
      .values({
        id: nanoid(),
        agentId: agentRow.id,
        organizationId: check.project.organizationId,
        projectId: id,
        displayName: displayName ?? null,
        configPublic: config ?? null,
      })
      .returning();
    return NextResponse.json({ ...row, agent: agentRow }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Install failed";
    const status = /unique|duplicate/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
