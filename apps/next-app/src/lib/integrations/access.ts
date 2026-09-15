import { auth } from "@repo/auth/server";
import { and, db, eq, resolveTenantFromHost } from "@repo/database";
import {
  type IntegrationInstallation,
  integration,
  integrationInstallation,
  member,
  organization,
} from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export type AuthorizedInstallation = {
  row: IntegrationInstallation;
  integrationSlug: string;
  tenantId: string;
  membership: { role: string };
};

export async function loadAuthorizedInstallation(
  installationId: string,
  options: { requireWriteRole?: boolean } = {},
): Promise<AuthorizedInstallation | { error: NextResponse }> {
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
  const [row] = await db()
    .select({
      installation: integrationInstallation,
      slug: integration.slug,
      tenantId: organization.tenantId,
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
    .where(
      and(
        eq(integrationInstallation.id, installationId),
        eq(organization.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!row) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  const [m] = await db()
    .select()
    .from(member)
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, row.installation.organizationId),
        eq(member.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!m) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  if (options.requireWriteRole && m.role !== "owner" && m.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Only workspace owners and admins can modify installations." },
        { status: 403 },
      ),
    };
  }
  return {
    row: row.installation,
    integrationSlug: row.slug,
    tenantId: row.tenantId,
    membership: { role: m.role },
  };
}
