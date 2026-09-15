import { and, db, eq, isNull, or } from "@repo/database";
import {
  type Integration,
  type IntegrationInstallation,
  integration,
  integrationInstallation,
  organization,
  project,
} from "@repo/database/schema";
import { type SafeInstallation, toSafeInstallation } from "./types";

export type ScopedInstallationRow = {
  installation: SafeInstallation;
  integration: Integration;
  inherited: boolean;
};

/**
 * List installed integrations visible at a given scope.
 *
 * - Project scope: returns project-scoped + workspace-scoped (inherited=true).
 * - Workspace scope: returns workspace-scoped only.
 */
export async function listScopedInstallations(scope: {
  tenantId: string;
  organizationId: string;
  projectId?: string | null;
}): Promise<ScopedInstallationRow[]> {
  const projectFilter = scope.projectId
    ? or(
        eq(integrationInstallation.projectId, scope.projectId),
        isNull(integrationInstallation.projectId),
      )
    : isNull(integrationInstallation.projectId);

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
    .innerJoin(
      organization,
      eq(integrationInstallation.organizationId, organization.id),
    )
    .leftJoin(project, eq(integrationInstallation.projectId, project.id))
    .where(
      and(
        eq(integrationInstallation.organizationId, scope.organizationId),
        eq(organization.tenantId, scope.tenantId),
        or(
          isNull(integrationInstallation.projectId),
          and(
            eq(project.id, integrationInstallation.projectId),
            eq(project.tenantId, scope.tenantId),
            eq(project.organizationId, scope.organizationId),
          ),
        ),
        projectFilter,
      ),
    );

  return rows.map((r) => ({
    installation: toSafeInstallation(r.installation),
    integration: r.integration,
    inherited: Boolean(scope.projectId) && r.installation.projectId === null,
  }));
}

/**
 * List visible registry entries (excludes hidden status + metadata.hidden).
 */
export async function listAvailableIntegrations(): Promise<Integration[]> {
  const rows = await db().select().from(integration);
  return rows.filter((row) => {
    if (row.status === "hidden") return false;
    const meta = row.metadata as { hidden?: boolean } | null;
    if (meta?.hidden) return false;
    return true;
  });
}

export async function findIntegrationBySlug(
  slug: string,
): Promise<Integration | null> {
  const [row] = await db()
    .select()
    .from(integration)
    .where(eq(integration.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function findInstallationById(
  id: string,
  scope: {
    tenantId: string;
    organizationId: string;
    projectId?: string | null;
  },
): Promise<IntegrationInstallation | null> {
  const projectFilter = scope.projectId
    ? or(
        eq(integrationInstallation.projectId, scope.projectId),
        isNull(integrationInstallation.projectId),
      )
    : isNull(integrationInstallation.projectId);

  const [row] = await db()
    .select({ installation: integrationInstallation, project })
    .from(integrationInstallation)
    .innerJoin(
      organization,
      eq(integrationInstallation.organizationId, organization.id),
    )
    .leftJoin(project, eq(integrationInstallation.projectId, project.id))
    .where(
      and(
        eq(integrationInstallation.id, id),
        eq(integrationInstallation.organizationId, scope.organizationId),
        eq(organization.tenantId, scope.tenantId),
        or(
          isNull(integrationInstallation.projectId),
          and(
            eq(project.id, integrationInstallation.projectId),
            eq(project.tenantId, scope.tenantId),
            eq(project.organizationId, scope.organizationId),
          ),
        ),
        projectFilter,
      ),
    )
    .limit(1);
  return row?.installation ?? null;
}
