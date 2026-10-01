import "server-only";
import { auth } from "@repo/auth/server";
import { and, db, eq, resolveTenantFromHost } from "@repo/database";
import { member, organization, project } from "@repo/database/schema";
import { headers } from "next/headers";
import type { ControlPlaneScope } from "./client";

/** Workspace roles that may change databases; every member may read them. */
const WRITE_ROLES = new Set(["owner", "admin"]);

export interface ProjectAccess {
  userId: string;
  tenantId: string;
  role: string;
  /** Derived from the console database, never from the request. */
  scope: ControlPlaneScope;
}

export type ProjectAccessResult =
  | { ok: true; access: ProjectAccess }
  | { ok: false; status: 401 | 403 | 404; message: string };

function canManageDatabases(role: string): boolean {
  return WRITE_ROLES.has(role);
}

/**
 * Resolves the caller, the site's tenant and the project in one membership
 * query. A project that does not exist, belongs to another tenant, or sits in
 * an organization the caller has not joined all answer 404, so a project id
 * reveals nothing to outsiders. Members who are not owner or admin may read
 * (`write: false`) but get 403 on changes.
 */
export async function requireProjectAccess(
  projectId: string,
  options: { write: boolean },
): Promise<ProjectAccessResult> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) return { ok: false, status: 404, message: "Project not found" };

  const [row] = await db()
    .select({
      organizationId: project.organizationId,
      projectId: project.id,
      role: member.role,
    })
    .from(project)
    .innerJoin(
      organization,
      and(
        eq(organization.id, project.organizationId),
        eq(organization.tenantId, tenant.id),
      ),
    )
    .innerJoin(
      member,
      and(
        eq(member.organizationId, project.organizationId),
        eq(member.userId, session.user.id),
        eq(member.tenantId, tenant.id),
      ),
    )
    .where(and(eq(project.id, projectId), eq(project.tenantId, tenant.id)))
    .limit(1);
  if (!row) return { ok: false, status: 404, message: "Project not found" };

  if (options.write && !canManageDatabases(row.role)) {
    return {
      ok: false,
      status: 403,
      message: "Only workspace owners and admins can change databases.",
    };
  }
  return {
    ok: true,
    access: {
      userId: session.user.id,
      tenantId: tenant.id,
      role: row.role,
      scope: { organizationId: row.organizationId, projectId: row.projectId },
    },
  };
}
