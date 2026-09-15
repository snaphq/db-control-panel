import { createHash, randomBytes } from "node:crypto";
import { requestOriginForRequest } from "@/lib/agent-auth/discovery";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkPasswordResetRateLimit } from "@/lib/rate-limit";
import {
  buildTenantAuthEmail,
  db,
  resolveTenantFromHost,
} from "@repo/database";
import { and, eq, isNull } from "@repo/database";
import * as schema from "@repo/database/schema";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashResetToken(token: string): string {
  return `legacy-password-reset:${createHash("sha256").update(token).digest("hex")}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      // Always return success to prevent email enumeration
      return NextResponse.json({ success: true });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const requestHeaders = await headers();
    const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
    if (!tenant) {
      return NextResponse.json({ success: true });
    }
    const authEmail = buildTenantAuthEmail(tenant.id, normalizedEmail);

    // Check rate limit
    const rateLimit = await checkPasswordResetRateLimit(
      `${tenant.id}:${normalizedEmail}`,
    );
    if (!rateLimit.success) {
      // Still return success to prevent enumeration
      console.log(`[Auth] Password reset rate limited for ${normalizedEmail}`);
      return NextResponse.json({ success: true });
    }

    // Find user by email
    const users = await db()
      .select({ id: schema.user.id, email: schema.user.email })
      .from(schema.user)
      .where(
        and(
          eq(schema.user.email, authEmail),
          eq(schema.user.tenantId, tenant.id),
          isNull(schema.user.archivedAt),
        ),
      )
      .limit(1);

    if (users.length === 0) {
      // User not found, but still return success to prevent enumeration
      return NextResponse.json({ success: true });
    }

    // Generate secure token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    // Store only a hash. The plaintext is delivered through the mailer and is
    // never recoverable from the database if it is exposed.
    await db()
      .insert(schema.verification)
      .values({
        id: nanoid(),
        tenantId: tenant.id,
        identifier: authEmail,
        value: hashResetToken(token),
        expiresAt,
      });

    // Build reset URL
    const resetUrl = `${requestOriginForRequest(request)}/auth/reset-password?token=${encodeURIComponent(token)}`;

    // Send email (or log to console if not configured)
    void sendPasswordResetEmail({
      to: normalizedEmail,
      resetUrl,
      token,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Auth] Forgot password error:", error);
    // Return success even on error to prevent enumeration
    return NextResponse.json({ success: true });
  }
}
