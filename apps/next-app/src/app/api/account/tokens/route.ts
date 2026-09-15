import {
  expirationToDate,
  generatePlaintextToken,
  hashToken,
  isValidExpiration,
  tokenDisplayPrefix,
} from "@/lib/auth/account-token";
import { auth } from "@repo/auth/server";
import {
  and,
  db,
  desc,
  eq,
  isNull,
  resolveTenantFromHost,
} from "@repo/database";
import { accountApiToken } from "@repo/database/schema";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant)
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const tokens = await db()
    .select({
      id: accountApiToken.id,
      name: accountApiToken.name,
      tokenPrefix: accountApiToken.tokenPrefix,
      scope: accountApiToken.scope,
      expiresAt: accountApiToken.expiresAt,
      lastUsedAt: accountApiToken.lastUsedAt,
      createdAt: accountApiToken.createdAt,
    })
    .from(accountApiToken)
    .where(
      and(
        eq(accountApiToken.userId, session.user.id),
        eq(accountApiToken.tenantId, tenant.id),
        isNull(accountApiToken.revokedAt),
      ),
    )
    .orderBy(desc(accountApiToken.createdAt));

  return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant)
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const expiration = typeof body.expiration === "string" ? body.expiration : "";
  const scope = typeof body.scope === "string" ? body.scope : "full";

  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  if (!isValidExpiration(expiration)) {
    return NextResponse.json({ error: "invalid_expiration" }, { status: 400 });
  }
  if (scope !== "full") {
    return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  }

  const plaintext = generatePlaintextToken();
  const tokenHash = hashToken(plaintext);
  const tokenPrefix = tokenDisplayPrefix(plaintext);
  const expiresAt = expirationToDate(expiration);

  const [created] = await db()
    .insert(accountApiToken)
    .values({
      id: nanoid(),
      tenantId: tenant.id,
      userId: session.user.id,
      name,
      tokenHash,
      tokenPrefix,
      scope,
      expiresAt,
    })
    .returning({
      id: accountApiToken.id,
      name: accountApiToken.name,
      tokenPrefix: accountApiToken.tokenPrefix,
      scope: accountApiToken.scope,
      expiresAt: accountApiToken.expiresAt,
      createdAt: accountApiToken.createdAt,
    });

  return NextResponse.json({ token: created, plaintext });
}
