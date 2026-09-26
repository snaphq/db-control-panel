import { baseServer, runWithAuthTenantContext } from "@repo/auth/server";
import { resourceUrlForRequest } from "@repo/core/agent-auth/discovery";
import { resolveTenantFromHost } from "@repo/database";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const tenant = await resolveTenantFromHost(request.headers.get("host"));
    if (!tenant) {
      return NextResponse.json(
        { error: "Unknown tenant host" },
        { status: 404 },
      );
    }
    // For Better Auth, delegate to its handler which properly handles sign-out
    // Better Auth's handler knows how to clear cookies and invalidate sessions
    const handler = await baseServer.getApiHandler();
    return runWithAuthTenantContext(
      {
        tenantId: tenant.id,
        resource: resourceUrlForRequest(request),
      },
      () => handler.POST(request),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 },
    );
  }
}
