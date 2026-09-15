import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../client";
import { organization, payments, session, user } from "../schema";

export interface AdminStats {
  totalUsers: number;
  totalOrganizations: number;
  totalPayments: number;
  activeSessions: number;
}

/**
 * Tenant-safe statistics exposed through tenant-bound protocol surfaces.
 *
 * The legacy `payments` table has no tenant foreign key. It is therefore
 * intentionally absent from this contract; callers that need payment data
 * must use the global site-admin surface until that table is migrated.
 */
export interface TenantAdminStats {
  totalUsers: number;
  totalOrganizations: number;
  activeSessions: number;
}

/**
 * Session fields that are safe to cross an application or protocol boundary.
 *
 * Better Auth stores the bearer value in `session.token`. That value is a
 * credential, not an identifier, and must never be returned from an admin
 * page, API route, MCP tool, log, or serialized server-component prop.
 */
export interface SafeSession {
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

const safeSessionSelection = {
  id: session.id,
  tenantId: session.tenantId,
  userId: session.userId,
  expiresAt: session.expiresAt,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  ipAddress: session.ipAddress,
  userAgent: session.userAgent,
};

/**
 * Read session metadata without selecting the bearer token column.
 *
 * `activeOnly` and `limit` are deliberately handled here so every consumer
 * shares the same projection and cannot accidentally fall back to
 * `select().from(session)`.
 */
export async function getSafeSessions(options?: {
  activeOnly?: boolean;
  limit?: number;
  tenantId?: string;
}): Promise<SafeSession[]> {
  const activeOnly = options?.activeOnly ?? false;
  const limit = options?.limit;
  const tenantScope = options?.tenantId
    ? eq(session.tenantId, options.tenantId)
    : undefined;

  if (activeOnly) {
    const where = tenantScope
      ? and(gt(session.expiresAt, new Date()), tenantScope)
      : gt(session.expiresAt, new Date());
    const query = db()
      .select(safeSessionSelection)
      .from(session)
      .where(where)
      .orderBy(session.createdAt);
    return limit === undefined ? query : query.limit(limit);
  }

  const query = db()
    .select(safeSessionSelection)
    .from(session)
    .$dynamic()
    .where(tenantScope)
    .orderBy(session.createdAt);
  return limit === undefined ? query : query.limit(limit);
}

/**
 * Fetch global aggregate admin statistics in a single pass.
 * Used by the global site-admin dashboard and stats API route. Tenant-bound
 * protocol surfaces must use `getTenantAdminStats` instead.
 */
export async function getAdminStats(): Promise<AdminStats> {
  const [totalUsers] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(user);

  const [totalOrganizations] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(organization);

  const [totalPayments] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(payments);

  const activeSessions = await db()
    .select({ id: session.id })
    .from(session)
    .where(gt(session.expiresAt, new Date()));

  return {
    totalUsers: Number(totalUsers.count),
    totalOrganizations: Number(totalOrganizations.count),
    totalPayments: Number(totalPayments.count),
    activeSessions: activeSessions.length,
  };
}

/**
 * Fetch statistics whose ownership is enforced by tenant foreign keys.
 *
 * Keep this separate from `getAdminStats`: adding a tenant option to the
 * global stats query would make it easy to accidentally reintroduce an
 * email-based join against the unscoped legacy payments table.
 */
export async function getTenantAdminStats(
  tenantId: string,
): Promise<TenantAdminStats> {
  const [totalUsers] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(user)
    .where(eq(user.tenantId, tenantId));

  const [totalOrganizations] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(organization)
    .where(eq(organization.tenantId, tenantId));

  const activeSessions = await db()
    .select({ id: session.id })
    .from(session)
    .where(
      and(gt(session.expiresAt, new Date()), eq(session.tenantId, tenantId)),
    );

  return {
    totalUsers: Number(totalUsers.count),
    totalOrganizations: Number(totalOrganizations.count),
    activeSessions: activeSessions.length,
  };
}
