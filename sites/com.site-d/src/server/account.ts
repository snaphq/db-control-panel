import { and, db, desc, eq } from "@repo/database";
import { member, organization, session, user } from "@repo/database/schema";

/**
 * Read models for the account dashboard.
 *
 * Every function takes an already-resolved `tenantId` plus the session's own
 * `userId`. Neither is ever accepted from the client: the tenant comes from
 * the Host header via src/middleware.ts, and the user comes from the signed
 * session cookie. The queries only ever narrow from those two values.
 */

export async function getUserAccount(tenantId: string, userId: string) {
  const [row] = await db()
    .select({
      name: user.name,
      email: user.publicEmail,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function getUserOrganizations(tenantId: string, userId: string) {
  return db()
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(organization.tenantId, tenantId)))
    .orderBy(organization.name);
}

export async function getUserSessions(tenantId: string, userId: string) {
  return db()
    .select({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(and(eq(session.userId, userId), eq(session.tenantId, tenantId)))
    .orderBy(desc(session.createdAt))
    .limit(20);
}

export interface AccountOverview {
  account: Awaited<ReturnType<typeof getUserAccount>>;
  organizations: Awaited<ReturnType<typeof getUserOrganizations>>;
  sessions: Awaited<ReturnType<typeof getUserSessions>>;
}

export async function getAccountOverview(
  tenantId: string,
  userId: string,
): Promise<AccountOverview> {
  const [account, organizations, sessions] = await Promise.all([
    getUserAccount(tenantId, userId),
    getUserOrganizations(tenantId, userId),
    getUserSessions(tenantId, userId),
  ]);
  return { account, organizations, sessions };
}
