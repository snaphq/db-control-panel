import {
  parseBody,
  requireSiteAdmin,
} from "@/app/api/admin/_lib/resource-crud";
import {
  agentAuthAudit,
  agentRegistration,
  agentToken,
  and,
  db,
  eq,
  isNull,
  resolveTenantFromHost,
} from "@repo/database";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const deny = await requireSiteAdmin();
  if (deny) return deny;
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  const { id } = await params;
  const bodyOrError = await parseBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const { action } = bodyOrError;
  if (action !== "revoke" && action !== "expire") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const [registration] = await db()
    .select({ tenantId: agentRegistration.tenantId })
    .from(agentRegistration)
    .where(
      and(
        eq(agentRegistration.id, id),
        eq(agentRegistration.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!registration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  const status = action === "revoke" ? "revoked" : "expired";

  await db()
    .update(agentRegistration)
    .set({ status })
    .where(
      and(
        eq(agentRegistration.id, id),
        eq(agentRegistration.tenantId, tenant.id),
      ),
    );

  if (action === "revoke") {
    await db()
      .update(agentToken)
      .set({ revokedAt: now })
      .where(
        and(
          eq(agentToken.registrationId, id),
          eq(agentToken.tenantId, tenant.id),
          isNull(agentToken.revokedAt),
        ),
      );
  }

  await db()
    .insert(agentAuthAudit)
    .values({
      id: `aaudit_${crypto.randomUUID()}`,
      tenantId: registration.tenantId,
      registrationId: id,
      event:
        action === "revoke" ? "registration.revoked" : "registration.expired",
      metadata: { via: "adminx" },
    });

  return NextResponse.json({ success: true });
}
