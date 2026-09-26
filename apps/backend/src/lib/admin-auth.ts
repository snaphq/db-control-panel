import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, db, eq, gt, isNull } from "@repo/database";
import { adminSession, adminUser } from "@repo/database/schema-admin";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

/**
 * Backend admin authentication.
 *
 * apps/backend is only for platform operators, so it does not use the tenant
 * auth provider in packages/auth. An operator is an admin when their email is
 * listed in BACKEND_ADMIN_EMAILS; they sign in with a one-time email code
 * (see ./admin-login.ts) and receive an opaque session cookie whose SHA-256
 * is stored in `admin_session`. Removing an email from the allowlist revokes
 * access on the next request, even for live sessions.
 */

const ADMIN_SESSION_COOKIE = "backend_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface AdminSessionView {
  sessionId: string;
  expiresAt: Date;
  user: { id: string; email: string; name: string | null };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAllowedAdminEmails(): Set<string> {
  return new Set(
    (process.env.BACKEND_ADMIN_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export function isAllowedAdminEmail(email: string): boolean {
  return getAllowedAdminEmails().has(normalizeEmail(email));
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Create a session for an allowlisted admin and set the session cookie. */
export async function createAdminSession(
  email: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isAllowedAdminEmail(normalized)) {
    throw new Error(`Refusing to create a session for ${normalized}`);
  }

  const now = new Date();
  const [admin] = await db()
    .insert(adminUser)
    .values({ id: `adm_${nanoid()}`, email: normalized, lastLoginAt: now })
    .onConflictDoUpdate({
      target: adminUser.email,
      set: { lastLoginAt: now },
    })
    .returning({ id: adminUser.id, disabledAt: adminUser.disabledAt });
  if (admin.disabledAt) {
    throw new Error(`Admin ${normalized} is disabled`);
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db()
    .insert(adminSession)
    .values({
      id: nanoid(),
      adminUserId: admin.id,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    });

  (await cookies()).set(ADMIN_SESSION_COOKIE, token, cookieOptions(expiresAt));
}

/** Resolve the current admin session, or null. Cached per request. */
export const getAdminSession = cache(
  async (): Promise<AdminSessionView | null> => {
    const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
    if (!token) return null;

    const [row] = await db()
      .select({
        sessionId: adminSession.id,
        expiresAt: adminSession.expiresAt,
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
      })
      .from(adminSession)
      .innerJoin(adminUser, eq(adminUser.id, adminSession.adminUserId))
      .where(
        and(
          eq(adminSession.tokenHash, hashToken(token)),
          gt(adminSession.expiresAt, new Date()),
          isNull(adminUser.disabledAt),
        ),
      )
      .limit(1);

    if (!row || !isAllowedAdminEmail(row.email)) return null;
    return {
      sessionId: row.sessionId,
      expiresAt: row.expiresAt,
      user: { id: row.id, email: row.email, name: row.name },
    };
  },
);

/** For server components and actions: redirect to /login when signed out. */
export async function requireAdmin(): Promise<AdminSessionView> {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  return session;
}

export async function destroyAdminSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    await db()
      .delete(adminSession)
      .where(eq(adminSession.tokenHash, hashToken(token)));
  }
  jar.delete(ADMIN_SESSION_COOKIE);
}
