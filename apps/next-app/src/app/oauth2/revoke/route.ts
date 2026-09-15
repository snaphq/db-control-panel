import { recordAudit } from "@/lib/agent-auth/audit";
import { resourceUrlForRequest } from "@/lib/agent-auth/discovery";
import { requestOriginForRequest } from "@/lib/agent-auth/discovery";
import {
  AgentAuthConfigurationError,
  getSigningKey,
} from "@/lib/agent-auth/keys";
import { db, resolveTenantFromHost } from "@repo/database";
import { oauthAccessToken } from "@repo/database/schema";
import { agentToken } from "@repo/database/schema-agent-auth";
import { and, eq, isNull, or } from "drizzle-orm";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

/**
 * POST /oauth2/revoke — RFC 7009 token revocation. Idempotent; 200 even for
 * unknown/already-revoked tokens (anti-enumeration). 400 only for a malformed
 * body.
 */
export async function POST(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) return new NextResponse(null, { status: 404 });

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Body must be form-encoded",
      },
      { status: 400 },
    );
  }

  const token = form.get("token");
  if (!token) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "token parameter is required",
      },
      { status: 400 },
    );
  }

  // Standard OIDC access tokens are opaque and are revoked by marking their
  // ledger row. This lookup is tenant-scoped and idempotent.
  const [opaque] = await db()
    .select({ id: oauthAccessToken.id })
    .from(oauthAccessToken)
    .where(
      and(
        or(
          eq(oauthAccessToken.accessToken, token),
          eq(oauthAccessToken.refreshToken, token),
        ),
        eq(oauthAccessToken.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (opaque) {
    await db()
      .update(oauthAccessToken)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthAccessToken.id, opaque.id),
          eq(oauthAccessToken.tenantId, tenant.id),
        ),
      );
    return new NextResponse(null, { status: 200 });
  }

  try {
    const { publicKey } = await getSigningKey();
    const verified = await jwtVerify(token, publicKey, {
      issuer: requestOriginForRequest(request),
      audience: resourceUrlForRequest(request),
    });
    if ((verified.protectedHeader.typ ?? "").toLowerCase() !== "at+jwt") {
      return new NextResponse(null, { status: 200 });
    }
    if (String(verified.payload.tid ?? "") !== tenant.id) {
      return new NextResponse(null, { status: 200 });
    }
    const jti = String(verified.payload.jti ?? "");
    if (jti) {
      await db()
        .update(agentToken)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(agentToken.jti, jti),
            eq(agentToken.tenantId, tenant.id),
            isNull(agentToken.revokedAt),
          ),
        );

      await recordAudit({
        tenantId: tenant.id,
        event: "token.revoked",
        registrationId: String(verified.payload.sub ?? "") || null,
      });
    }
  } catch (error) {
    if (error instanceof AgentAuthConfigurationError) {
      return NextResponse.json(
        {
          error: "temporarily_unavailable",
          error_description: "Agent authentication is not configured",
        },
        { status: 503 },
      );
    }
    // Unknown/invalid token: return 200 per RFC 7009 §2.2.
  }

  return new NextResponse(null, { status: 200 });
}
