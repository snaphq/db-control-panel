import { resourceUrlForRequest } from "@/lib/agent-auth/discovery";
import {
  getBetterAuthServer,
  runWithAuthTenantContext,
} from "@repo/auth/server";
import { and, db, eq, resolveTenantFromHost } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const server = getBetterAuthServer();
    const requestHeaders = await headers();
    const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
    if (!tenant) {
      return NextResponse.json(
        { error: "Unknown tenant host" },
        { status: 404 },
      );
    }
    const session = await server.getSession(requestHeaders);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 },
      );
    }

    const [membership] = await db()
      .select({ id: member.id })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, session.user.id),
          eq(member.tenantId, tenant.id),
          eq(organization.tenantId, tenant.id),
        ),
      )
      .limit(1);
    if (!membership) {
      return NextResponse.json(
        { error: "Organization is not available on this tenant" },
        { status: 403 },
      );
    }

    const instance = server.getAuthInstance();
    await runWithAuthTenantContext(
      {
        tenantId: tenant.id,
        resource: resourceUrlForRequest(request),
      },
      () =>
        instance.api.setActiveOrganization({
          body: { organizationId },
          headers: requestHeaders,
        }),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error setting active organization:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
