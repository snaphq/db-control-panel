import { auth } from "@repo/auth/server";
import { completeClaim } from "@repo/core/agent-auth/claims";
import {
  requestOriginForRequest,
  resourceUrlForRequest,
} from "@repo/core/agent-auth/discovery";
import { clientIp } from "@repo/core/agent-auth/registrations";
import { resolveTenantFromHost } from "@repo/database";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /agent/identity/claim/complete — service-owned form action.
 * The signed-in user confirms the 6-digit user_code; agents never see this.
 * Body: { claim_attempt_token, user_code }.
 */
export async function POST(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) {
    return NextResponse.json(
      { error: "tenant_not_found", message: "Unknown tenant host" },
      { status: 404 },
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Body must be JSON" },
      { status: 400 },
    );
  }

  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { claim_attempt_token?: unknown; user_code?: unknown })
      : {};
  const attemptToken =
    typeof input.claim_attempt_token === "string"
      ? input.claim_attempt_token.trim()
      : "";
  const userCode =
    typeof input.user_code === "string" ? input.user_code.trim() : "";
  if (!attemptToken || !userCode) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "claim_attempt_token and user_code are required",
      },
      { status: 400 },
    );
  }

  const result = await completeClaim({
    attemptToken,
    userCode,
    userId: session.user.id,
    userEmail: session.user.email,
    tenantId: tenant.id,
    resource: resourceUrlForRequest(request),
    issuer: requestOriginForRequest(request),
    ip: clientIp(request),
  });

  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "invalid_code"
          ? 400
          : result.error === "invalid_request"
            ? 400
            : result.error === "organization_required"
              ? 409
              : 410;
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status },
    );
  }

  return NextResponse.json({
    success: true,
    registration_id: result.registrationId,
  });
}
