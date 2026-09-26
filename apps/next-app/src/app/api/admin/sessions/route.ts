import { auth } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { getSafeSessions, resolveTenantFromHost } from "@repo/database";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const authSession = await auth.api.getSession({
      headers: await headers(),
    });

    if (!authSession?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestHeaders = await headers();
    const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const isAdmin = await getSiteAdminStatus(authSession.user.id, tenant.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sessions = await getSafeSessions({ tenantId: tenant.id });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
