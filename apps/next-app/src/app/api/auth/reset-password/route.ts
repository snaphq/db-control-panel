import { createHash } from "node:crypto";
import {
  account,
  and,
  eq,
  gt,
  isNull,
  resolveTenantFromHost,
  user,
  verification,
  withDbTransaction,
} from "@repo/database";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function hashResetToken(token: string): string {
  return `legacy-password-reset:${createHash("sha256").update(token).digest("hex")}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, newPassword } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: { message: "Invalid token", code: "INVALID_TOKEN" } },
        { status: 400 },
      );
    }

    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json(
        {
          error: { message: "Password is required", code: "MISSING_PASSWORD" },
        },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        {
          error: {
            message: "Password must be at least 8 characters",
            code: "PASSWORD_TOO_SHORT",
          },
        },
        { status: 400 },
      );
    }

    const tenant = await resolveTenantFromHost(request.headers.get("host"));
    if (!tenant) {
      return NextResponse.json(
        { error: { message: "Invalid token", code: "INVALID_TOKEN" } },
        { status: 400 },
      );
    }

    // Hash once and use a conditional delete inside the transaction below.
    // This prevents a reset token from being replayed by concurrent requests.
    const tokenHash = hashResetToken(token);
    const now = new Date();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await withDbTransaction(async (tx) => {
      const [verificationRow] = await tx
        .select({ id: verification.id, identifier: verification.identifier })
        .from(verification)
        .where(
          and(
            eq(verification.value, tokenHash),
            eq(verification.tenantId, tenant.id),
            gt(verification.expiresAt, now),
          ),
        )
        .limit(1);

      if (!verificationRow) {
        return {
          ok: false as const,
          message: "Invalid or expired reset token",
          code: "TOKEN_EXPIRED",
        };
      }

      const [resetUser] = await tx
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.email, verificationRow.identifier),
            eq(user.tenantId, tenant.id),
            isNull(user.archivedAt),
          ),
        )
        .limit(1);
      if (!resetUser) {
        return {
          ok: false as const,
          message: "Invalid or expired reset token",
          code: "TOKEN_EXPIRED",
        };
      }

      const [credential] = await tx
        .select({ id: account.id })
        .from(account)
        .where(
          and(
            eq(account.userId, resetUser.id),
            eq(account.tenantId, tenant.id),
            eq(account.providerId, "credential"),
          ),
        )
        .limit(1);
      if (!credential) {
        return {
          ok: false as const,
          message: "No password account found for this user",
          code: "NO_PASSWORD_ACCOUNT",
        };
      }

      const [consumed] = await tx
        .delete(verification)
        .where(
          and(
            eq(verification.id, verificationRow.id),
            eq(verification.value, tokenHash),
            eq(verification.tenantId, tenant.id),
          ),
        )
        .returning({ id: verification.id });
      if (!consumed) {
        return {
          ok: false as const,
          message: "Invalid or expired reset token",
          code: "TOKEN_EXPIRED",
        };
      }

      await tx
        .update(account)
        .set({ password: hashedPassword })
        .where(
          and(eq(account.id, credential.id), eq(account.tenantId, tenant.id)),
        );
      return { ok: true as const };
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: { message: result.message, code: result.code } },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Auth] Reset password error:", error);
    return NextResponse.json(
      { error: { message: "Failed to reset password", code: "RESET_FAILED" } },
      { status: 500 },
    );
  }
}
