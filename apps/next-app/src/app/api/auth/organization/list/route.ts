import {
  getBetterAuthServer,
  runWithAuthTenantContext,
} from "@repo/auth/server";
import { resourceUrlForRequest } from "@repo/core/agent-auth/discovery";
import { filterOrganizationsForTenant } from "@repo/core/auth/organizations";
import { resolveTenantFromHost } from "@repo/database";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
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

    const instance = server.getAuthInstance();
    const orgs = await runWithAuthTenantContext(
      {
        tenantId: tenant.id,
        resource: resourceUrlForRequest(request),
      },
      () => instance.api.listOrganizations({ headers: requestHeaders }),
    );

    return NextResponse.json(
      await filterOrganizationsForTenant(orgs, tenant.id, session.user.id),
    );
  } catch (error) {
    console.error("Error listing organizations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
