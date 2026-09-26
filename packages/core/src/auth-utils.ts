import { auth } from "@repo/auth/server";
import { and, db, eq, isNull, resolveTenantFromHost } from "@repo/database";
import { user } from "@repo/database/schema";
import { headers } from "next/headers";

/**
 * Check the site-admin role for the user in the request tenant.
 *
 * Site-admin is persisted on the user row, but users are tenant-owned. A
 * role-only lookup would let a session from one tenant authorize an admin
 * request on another tenant host. Callers that already resolved the tenant
 * can pass it explicitly to avoid resolving the host twice.
 */
export async function getSiteAdminStatus(
  userId: string,
  tenantId?: string,
): Promise<boolean> {
  const scopedTenantId =
    tenantId ??
    (await resolveTenantFromHost((await headers()).get("host")))?.id;
  if (!scopedTenantId) return false;

  const userRecord = await db()
    .select({ role: user.role })
    .from(user)
    .where(
      and(
        eq(user.id, userId),
        eq(user.tenantId, scopedTenantId),
        isNull(user.archivedAt),
      ),
    )
    .limit(1);

  if (userRecord.length === 0) {
    return false;
  }

  return userRecord[0].role === "site-admin";
}

export async function isSiteAdmin(): Promise<boolean> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session?.user?.id) {
    return false;
  }

  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  return tenant ? getSiteAdminStatus(session.user.id, tenant.id) : false;
}

export async function getCurrentUserRole(): Promise<string | null> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session?.user?.id) {
    return null;
  }

  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) return null;

  const userRecord = await db()
    .select({ role: user.role })
    .from(user)
    .where(
      and(
        eq(user.id, session.user.id),
        eq(user.tenantId, tenant.id),
        isNull(user.archivedAt),
      ),
    )
    .limit(1);

  if (userRecord.length === 0) {
    return null;
  }

  return userRecord[0].role;
}
